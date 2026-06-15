import type { Express, Request, Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

// ── Lucky Get config (edit luckyGetConfig.json untuk ubah reward/rate) ────────
const _require = createRequire(import.meta.url);
const lcCfg = _require("./luckyGetConfig.json") as {
  price10: {
    phase0: { label: number; rewardMultiplier: number; thresholdMin: number; thresholdMax: number };
    phase1: { label: number; rewardMultiplier: number; thresholdMin: number; thresholdMax: number };
  };
  price100: {
    label: number; rewardMultiplier: number; roomThreshold: number;
    firstTriggerMin: number; firstTriggerMax: number; cycleMin: number; cycleMax: number;
    dropsByCombo: Record<string, number>;
  };
  otherPrices: {
    label: number; rewardMultiplier: number; firstTriggerMin: number; firstTriggerMax: number;
    ratesByCombo: Record<string, number>;
  };
};
import { broadcastToRoom, broadcastToAllClients } from "../../gateway";
import { coinToDiamond, luxuryCoinToDiamond } from "../../config/currency";
import { storage } from "../../storage";
import {
  isBotEnabled,
  getBotCount,
  spawnBots,
  clearBots,
  getBotViewers,
  getBotViewerCount,
} from "../botViewer/botViewerService";

// ── PK Battle in-memory timers ────────────────────────────────────────────────
const pkTimers = new Map<number, NodeJS.Timeout>();

async function endPKBattle(battleId: number) {
  clearTimeout(pkTimers.get(battleId));
  pkTimers.delete(battleId);
  try {
    const row = await db.execute(sql`
      SELECT id, challenger_stream_id, opponent_stream_id, challenger_score, opponent_score
      FROM pk_battles WHERE id = ${battleId} AND status = 'active' LIMIT 1
    `);
    if (!row.rows.length) return;
    const pk = row.rows[0] as any;
    const cs = Number(pk.challenger_score), os = Number(pk.opponent_score);
    const winner = cs > os ? 'challenger' : os > cs ? 'opponent' : 'tie';
    await db.execute(sql`
      UPDATE pk_battles SET status = 'ended', winner = ${winner}, ended_at = NOW()
      WHERE id = ${battleId}
    `);
    const payload = { type: "PK_ENDED", battleId, winner, challengerScore: cs, opponentScore: os };
    broadcastToRoom(`livesolo-${pk.challenger_stream_id}`, payload as any);
    broadcastToRoom(`livesolo-${pk.opponent_stream_id}`, payload as any);
  } catch (e) { console.error("[pk/auto-end]", e); }
}

// ── Thumbnail upload storage ─────────────────────────────────────────────────
const THUMB_DIR = path.join(process.cwd(), "uploads", "live-thumbnails");
function ensureThumbDir() {
  if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });
}
const thumbStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { ensureThumbDir(); cb(null, THUMB_DIR); },
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const thumbUpload = multer({
  storage: thumbStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Hanya file gambar yang diizinkan"));
  },
});

/**
 * Live Solo — API streaming video solo untuk host perempuan agency.
 *
 * Tabel: live_streams, stream_gifts, stream_viewers (dibuat di index.ts)
 * Prefix: /api/live
 *
 * Endpoints:
 *   POST /api/live/start                — host mulai live
 *   GET  /api/live/streams              — list semua stream aktif
 *   GET  /api/live/streams/:id          — detail satu stream
 *   POST /api/live/streams/:id/token    — LiveKit token (host/viewer)
 *   POST /api/live/streams/:id/end      — host akhiri live
 *   POST /api/live/streams/:id/gift     — viewer kirim gift ke host
 *   POST /api/live/streams/:id/join     — viewer join (tracking)
 *   POST /api/live/streams/:id/leave    — viewer leave (tracking)
 */

// ─── LiveKit — same dual-provider logic as liveParty ─────────────────────────
const LIVEKIT_CLOUD_URL        = process.env.LIVEKIT_CLOUD_URL        || "";
const LIVEKIT_CLOUD_API_KEY    = process.env.LIVEKIT_CLOUD_API_KEY    || "";
const LIVEKIT_CLOUD_API_SECRET = process.env.LIVEKIT_CLOUD_API_SECRET || "";
const LIVEKIT_SELF_URL         = process.env.LIVEKIT_URL              || "";
const LIVEKIT_SELF_API_KEY     = process.env.LIVEKIT_API_KEY          || "";
const LIVEKIT_SELF_API_SECRET  = process.env.LIVEKIT_API_SECRET       || "";

function getActiveLiveKit(): { url: string; apiKey: string; apiSecret: string; provider: "cloud" | "selfhosted" } {
  const mode       = (process.env.LIVEKIT_MODE || "auto").toLowerCase();
  const cloudReady = !!(LIVEKIT_CLOUD_URL && LIVEKIT_CLOUD_API_KEY && LIVEKIT_CLOUD_API_SECRET);
  const selfReady  = !!(LIVEKIT_SELF_URL  && LIVEKIT_SELF_API_KEY  && LIVEKIT_SELF_API_SECRET);

  if (mode === "cloud")      return { url: LIVEKIT_CLOUD_URL, apiKey: LIVEKIT_CLOUD_API_KEY, apiSecret: LIVEKIT_CLOUD_API_SECRET, provider: "cloud" };
  if (mode === "selfhosted") return { url: LIVEKIT_SELF_URL,  apiKey: LIVEKIT_SELF_API_KEY,  apiSecret: LIVEKIT_SELF_API_SECRET,  provider: "selfhosted" };
  if (cloudReady) return { url: LIVEKIT_CLOUD_URL, apiKey: LIVEKIT_CLOUD_API_KEY, apiSecret: LIVEKIT_CLOUD_API_SECRET, provider: "cloud" };
  return { url: LIVEKIT_SELF_URL, apiKey: LIVEKIT_SELF_API_KEY, apiSecret: LIVEKIT_SELF_API_SECRET, provider: "selfhosted" };
}

function soloRoomName(streamId: string): string {
  return `livesolo-${streamId}`;
}

async function generateToken(
  streamId: string,
  identity: string,
  canPublish: boolean,
): Promise<{ token: string; url: string; provider: "cloud" | "selfhosted" }> {
  const lk = getActiveLiveKit();
  const at = new AccessToken(lk.apiKey, lk.apiSecret, { identity, ttl: 7200 });
  at.addGrant({
    roomJoin:     true,
    room:         soloRoomName(streamId),
    canPublish,
    canSubscribe: true,
  });
  const token = await at.toJwt();
  return { token, url: lk.url, provider: lk.provider };
}

// ─── Gate Keeper: validasi host female + agency aktif ────────────────────────
async function validateHostEligibility(userId: string): Promise<
  | { ok: true; username: string; displayName: string | null; avatarUrl: string | null; agencyName: string | null }
  | { ok: false; status: number; message: string }
> {
  // 1. Ambil data user + profil
  const userRes = await db.execute(sql`
    SELECT u.username, u.display_name, up.display_picture
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `);
  const user = userRes.rows[0] as any;
  if (!user) return { ok: false, status: 404, message: "User tidak ditemukan" };

  // 2a. Cek apakah user adalah owner agency yang approved
  const ownerRes = await db.execute(sql`
    SELECT id, agency_name FROM agencies
    WHERE LOWER(registered_by) = LOWER(${user.username})
      AND status = 'approved'
    LIMIT 1
  `);
  const isAgencyOwner = ownerRes.rows.length > 0;
  let agencyName: string | null = null;

  if (isAgencyOwner) {
    agencyName = (ownerRes.rows[0] as any).agency_name ?? null;
  } else {
    // 2b. Cek agency_hosts aktif (host biasa)
    const hostRes = await db.execute(sql`
      SELECT ah.agency_id
      FROM agency_hosts ah
      WHERE ah.username = ${user.username}
        AND ah.status = 'active'
      LIMIT 1
    `);
    if (hostRes.rows.length === 0) {
      return { ok: false, status: 403, message: "Kamu harus terdaftar sebagai host aktif di sebuah agency" };
    }

    // 2c. Cek agency approved + ambil nama
    const agencyId = (hostRes.rows[0] as any).agency_id;
    const agencyRes = await db.execute(sql`
      SELECT id, agency_name FROM agencies WHERE id = ${agencyId} AND status = 'approved' LIMIT 1
    `);
    if (agencyRes.rows.length === 0) {
      return { ok: false, status: 403, message: "Agency kamu belum disetujui oleh admin" };
    }
    agencyName = (agencyRes.rows[0] as any).agency_name ?? null;
  }

  return {
    ok:          true,
    username:    user.username,
    displayName: user.display_name ?? null,
    avatarUrl:   user.display_picture ?? null,
    agencyName,
  };
}

// ─── Register Routes ─────────────────────────────────────────────────────────
export function registerLiveSoloRoutes(app: Express) {

  // ── POST /api/live/thumbnail ─────────────────────────────────────────────
  // Upload gambar thumbnail untuk live stream. Returns { url }.
  app.post(
    "/api/live/thumbnail",
    thumbUpload.single("thumbnail"),
    (req: Request, res: Response) => {
      if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
      if (!req.file) return res.status(400).json({ message: "Tidak ada file yang diunggah" });
      const url = `/uploads/live-thumbnails/${req.file.filename}`;
      res.json({ ok: true, url });
    }
  );

  // ── POST /api/live/start ─────────────────────────────────────────────────
  // Host mulai live. Validasi female + agency aktif.
  app.post("/api/live/start", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login terlebih dahulu" });

    try {
      const eligibility = await validateHostEligibility(req.session.userId);
      if (!eligibility.ok) {
        return res.status(eligibility.status).json({ message: eligibility.message });
      }
      const { username, displayName, avatarUrl, agencyName } = eligibility;

      // Cek apakah host sudah punya stream aktif
      const existing = await db.execute(sql`
        SELECT id FROM live_streams
        WHERE host_user_id = ${req.session.userId} AND status = 'live'
        LIMIT 1
      `);
      if (existing.rows.length > 0) {
        const existingId = (existing.rows[0] as any).id;
        return res.json({ ok: true, streamId: existingId, resumed: true, agencyName });
      }

      const title       = (req.body?.title       as string) || `${displayName ?? username}'s Live`;
      const category    = (req.body?.category     as string) || "general";
      const thumbnailUrl = (req.body?.thumbnailUrl as string) || avatarUrl || null;

      const insertRes = await db.execute(sql`
        INSERT INTO live_streams (
          host_user_id, host_username, host_display_name, host_avatar_url,
          title, category, thumbnail_url, status
        ) VALUES (
          ${req.session.userId}, ${username}, ${displayName}, ${avatarUrl},
          ${title}, ${category}, ${thumbnailUrl}, 'live'
        )
        RETURNING id
      `);
      const streamId = (insertRes.rows[0] as any).id as string;

      console.log(`[liveSolo] Stream started: ${streamId} by @${username}`);

      // ── Spawn bot viewers (fake audience) ───────────────────────────────
      if (isBotEnabled()) {
        const botKey   = `livesolo-${streamId}`;
        const botTotal = getBotCount();
        spawnBots(botKey, botTotal, async (bot) => {
          try {
            // Increment viewer_count di DB untuk setiap bot
            await db.execute(sql`
              UPDATE live_streams
              SET viewer_count = viewer_count + 1
              WHERE id = ${streamId} AND status = 'live'
            `);
            // Broadcast LIVE_JOIN event → client menampilkan "bergabung ke live"
            broadcastToRoom(botKey, {
              type:        "LIVE_JOIN",
              streamId,
              username:    bot.username,
              displayName: bot.displayName,
              vipLevel:    0,
              hasTopup:    false,
              avatarUrl:   null,
            } as any);
          } catch { /* non-fatal */ }
        });
      }

      res.json({ ok: true, streamId, resumed: false, agencyName });
    } catch (err) {
      console.error("[liveSolo/start] error:", err);
      res.status(500).json({ message: "Gagal memulai live" });
    }
  });

  // ── GET /api/live/livekit-status ─────────────────────────────────────────
  // Health check: cek konfigurasi + konektivitas ke LiveKit server
  app.get("/api/live/livekit-status", async (_req: Request, res: Response) => {
    const lk          = getActiveLiveKit();
    const cloudReady  = !!(LIVEKIT_CLOUD_URL && LIVEKIT_CLOUD_API_KEY && LIVEKIT_CLOUD_API_SECRET);
    const selfReady   = !!(LIVEKIT_SELF_URL  && LIVEKIT_SELF_API_KEY  && LIVEKIT_SELF_API_SECRET);
    const configured  = !!(lk.url && lk.apiKey && lk.apiSecret);

    let reachable = false;
    let pingMs: number | null = null;
    let pingError: string | null = null;

    if (configured) {
      const httpUrl = lk.url.replace(/^wss?:\/\//, "https://").replace(/\/$/, "");
      const t0 = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const resp  = await fetch(`${httpUrl}/`, { signal: ctrl.signal });
        clearTimeout(timer);
        pingMs    = Date.now() - t0;
        reachable = resp.status < 500;
      } catch (e: any) {
        pingMs    = Date.now() - t0;
        pingError = e?.message ?? String(e);
      }
    }

    res.json({
      provider:   lk.provider,
      configured,
      reachable,
      pingMs,
      pingError,
      url:        lk.url || null,
      cloud:      { configured: cloudReady, url: LIVEKIT_CLOUD_URL || null },
      self:       { configured: selfReady,  url: LIVEKIT_SELF_URL  || null },
    });
  });

  // ── GET /api/live/streams ────────────────────────────────────────────────
  // List semua stream aktif (status = 'live'), diurutkan by viewer count.
  app.get("/api/live/streams", async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT
          ls.id,
          ls.host_username,
          ls.host_display_name,
          ls.host_avatar_url,
          ls.title,
          ls.category,
          ls.thumbnail_url,
          ls.viewer_count,
          ls.total_gifts,
          ls.started_at,
          COALESCE(
            (SELECT COUNT(*) FROM stream_viewers sv WHERE sv.stream_id = ls.id AND sv.left_at IS NULL),
            0
          ) AS live_viewer_count
        FROM live_streams ls
        WHERE ls.status = 'live'
        ORDER BY ls.viewer_count DESC, ls.started_at DESC
        LIMIT 100
      `);

      const streams = (result.rows as any[]).map(r => ({
        id:              r.id,
        hostUsername:    r.host_username,
        hostDisplayName: r.host_display_name ?? null,
        hostAvatar:      r.host_avatar_url ?? null,
        title:           r.title,
        category:        r.category ?? "general",
        thumbnailUrl:    r.thumbnail_url ?? null,
        viewerCount:     Number(r.live_viewer_count ?? r.viewer_count ?? 0) + getBotViewerCount(`livesolo-${r.id}`) + 1,
        totalGifts:      Number(r.total_gifts ?? 0),
        startedAt:       r.started_at,
      }));

      res.json({ streams });
    } catch (err) {
      console.error("[liveSolo/streams] error:", err);
      res.status(500).json({ message: "Gagal mengambil daftar stream" });
    }
  });

  // ── GET /api/live/streams/:id ────────────────────────────────────────────
  // Detail satu stream.
  app.get("/api/live/streams/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const result = await db.execute(sql`
        SELECT
          ls.*,
          COALESCE(
            (SELECT COUNT(*) FROM stream_viewers sv WHERE sv.stream_id = ls.id AND sv.left_at IS NULL),
            0
          ) AS live_viewer_count
        FROM live_streams ls
        WHERE ls.id = ${id}
        LIMIT 1
      `);
      if (result.rows.length === 0) return res.status(404).json({ message: "Stream tidak ditemukan" });
      const r = result.rows[0] as any;
      res.json({
        id:              r.id,
        hostUserId:      r.host_user_id,
        hostUsername:    r.host_username,
        hostDisplayName: r.host_display_name ?? null,
        hostAvatar:      r.host_avatar_url ?? null,
        title:           r.title,
        category:        r.category ?? "general",
        thumbnailUrl:    r.thumbnail_url ?? null,
        status:          r.status,
        viewerCount:     Number(r.live_viewer_count ?? 0) + getBotViewerCount(`livesolo-${r.id}`) + (r.status === 'live' ? 1 : 0),
        totalGifts:      Number(r.total_gifts ?? 0),
        startedAt:       r.started_at,
        endedAt:         r.ended_at ?? null,
      });
    } catch (err) {
      console.error("[liveSolo/stream-detail] error:", err);
      res.status(500).json({ message: "Gagal mengambil detail stream" });
    }
  });

  // ── GET /api/live/streams/:id/viewers ───────────────────────────────────
  // Daftar viewer aktif beserta avatar mereka (max 30) + badge data.
  app.get("/api/live/streams/:id/viewers", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      // Ambil info stream (host username)
      const streamInfo = await db.execute(sql`
        SELECT host_username FROM live_streams WHERE id = ${id} LIMIT 1
      `);
      const hostUsername: string = (streamInfo.rows[0] as any)?.host_username ?? '';

      const bots      = getBotViewers(`livesolo-${id}`);
      const realLimit = Math.max(0, 50 - bots.length);

      // Ambil daftar admin stream ini
      const adminRows = await db.execute(sql`
        SELECT LOWER(username) AS uname FROM live_stream_admins WHERE stream_id = ${id}
      `);
      const adminSet = new Set((adminRows.rows as any[]).map(r => r.uname));

      // Query viewer dengan badge data
      const result = await db.execute(sql`
        SELECT
          sv.username,
          u.display_name,
          up.display_picture      AS avatar_url,
          up.avatar_frame_url,
          COALESCE(up.vip_level, 0) AS vip_level,
          COALESCE(up.mig_level, 1) AS mig_level,
          COALESCE(
            (SELECT SUM(sg.amount_coins) FROM stream_gifts sg
             WHERE sg.stream_id = ${id}
               AND LOWER(sg.sender_username) = LOWER(sv.username)),
            0
          ) AS gift_total,
          COALESCE(
            (SELECT a.agency_name FROM agency_hosts ah
             JOIN agencies a ON a.id = ah.agency_id
             WHERE LOWER(ah.username) = LOWER(sv.username) AND ah.status = 'active' AND a.status = 'approved'
             LIMIT 1),
            NULL
          ) AS agency_name
        FROM stream_viewers sv
        LEFT JOIN users u ON LOWER(u.username) = LOWER(sv.username)
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE sv.stream_id = ${id}
          AND sv.left_at IS NULL
        ORDER BY gift_total DESC, sv.joined_at DESC
        LIMIT ${realLimit}
      `);

      const BASE = (process.env.IMG_BASE_URL ?? '').replace(/\/$/, '');
      const fixUrl = (url: string | null) =>
        url ? (url.startsWith('http') ? url : `${BASE}${url}`) : null;

      const realViewers = (result.rows as any[]).map(r => ({
        username:       r.username,
        displayName:    r.display_name ?? r.username,
        avatarUrl:      fixUrl(r.avatar_url),
        avatarFrameUrl: fixUrl(r.avatar_frame_url),
        vipLevel:       Number(r.vip_level ?? 0),
        migLevel:       Number(r.mig_level ?? 1),
        giftTotal:      Number(r.gift_total ?? 0),
        agencyName:     r.agency_name ?? null,
        isAdmin:        adminSet.has((r.username ?? '').toLowerCase()),
        isHost:         (r.username ?? '').toLowerCase() === hostUsername.toLowerCase(),
      }));

      const botViewers = bots.map(b => ({
        username:       b.username,
        displayName:    b.displayName,
        avatarUrl:      null,
        avatarFrameUrl: null,
        vipLevel:       0,
        migLevel:       1,
        giftTotal:      0,
        agencyName:     null,
        isAdmin:        false,
        isHost:         false,
        isBot:          true,
      }));

      res.json({ viewers: [...realViewers, ...botViewers] });
    } catch (err) {
      console.error("[liveSolo/viewers] error:", err);
      res.status(500).json({ message: "Gagal mengambil daftar viewer" });
    }
  });

  // ── POST /api/live/streams/:id/token ────────────────────────────────────
  // Host → publisher video+audio. Viewer → subscriber only.
  app.post("/api/live/streams/:id/token", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login terlebih dahulu" });
    const id = String(req.params.id);

    try {
      // Cek stream ada dan aktif
      const streamRes = await db.execute(sql`
        SELECT host_user_id, host_username, status FROM live_streams WHERE id = ${id} LIMIT 1
      `);
      if (streamRes.rows.length === 0) return res.status(404).json({ message: "Stream tidak ditemukan" });
      const stream = streamRes.rows[0] as any;
      if (stream.status !== "live") return res.status(400).json({ message: "Stream sudah berakhir" });

      // Ambil username user ini
      const userId = String(req.session.userId);
      const userRes = await db.execute(sql`SELECT username FROM users WHERE id = ${userId} LIMIT 1`);
      const username = (userRes.rows[0] as any)?.username ?? userId;

      const isHost = stream.host_user_id === req.session.userId;
      const { token, url, provider } = await generateToken(id, String(username), isHost);

      res.json({ token, url, provider, role: isHost ? "host" : "viewer" });
    } catch (err) {
      console.error("[liveSolo/token] error:", err);
      res.status(500).json({ message: "Gagal membuat token" });
    }
  });

  // ── POST /api/live/streams/:id/end ───────────────────────────────────────
  // Host akhiri live. Hanya host yang bisa.
  app.post("/api/live/streams/:id/end", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login terlebih dahulu" });
    const { id } = req.params;

    try {
      const streamRes = await db.execute(sql`
        SELECT host_user_id, status FROM live_streams WHERE id = ${id} LIMIT 1
      `);
      if (streamRes.rows.length === 0) return res.status(404).json({ message: "Stream tidak ditemukan" });
      const stream = streamRes.rows[0] as any;

      if (stream.host_user_id !== req.session.userId) {
        return res.status(403).json({ message: "Hanya host yang bisa mengakhiri stream ini" });
      }
      if (stream.status === "ended") {
        return res.json({ ok: true, alreadyEnded: true });
      }

      // Tutup semua viewer aktif
      await db.execute(sql`
        UPDATE stream_viewers
        SET left_at = NOW()
        WHERE stream_id = ${id} AND left_at IS NULL
      `);

      // Capture bot count SEBELUM di-clear (bot count termasuk di total penonton)
      const botCount = getBotViewerCount(`livesolo-${id}`);

      // Hitung ringkasan
      const summary = await db.execute(sql`
        SELECT
          COALESCE(SUM(sg.amount_coins), 0) AS total_gifts,
          COUNT(DISTINCT sv.user_id) AS total_viewers
        FROM live_streams ls
        LEFT JOIN stream_gifts   sg ON sg.stream_id = ls.id
        LEFT JOIN stream_viewers sv ON sv.stream_id = ls.id
        WHERE ls.id = ${id}
      `);
      const s = summary.rows[0] as any;

      // Total penonton = real viewers + bots + 1 (host)
      const realViewers   = Number(s.total_viewers ?? 0);
      const totalViewers  = realViewers + botCount + 1;
      const totalGiftsVal = Number(s.total_gifts ?? 0);

      await db.execute(sql`
        UPDATE live_streams
        SET status = 'ended',
            ended_at = NOW(),
            total_gifts = ${totalGiftsVal},
            viewer_count = ${totalViewers}
        WHERE id = ${id}
      `);

      // Broadcast LIVE_END ke semua viewer di room ini
      try {
        broadcastToRoom(`livesolo-${id}`, {
          type:         "LIVE_END",
          streamId:     id,
          totalGifts:   totalGiftsVal,
          totalViewers: totalViewers,
        } as any);
      } catch { /* non-fatal */ }

      // Hapus semua bot viewer untuk stream ini (setelah count di-capture)
      clearBots(`livesolo-${id}`);

      console.log(`[liveSolo] Stream ended: ${id} | viewers=${totalViewers} (real=${realViewers} bots=${botCount}+1host)`);
      res.json({ ok: true, totalGifts: totalGiftsVal, totalViewers: totalViewers });
    } catch (err) {
      console.error("[liveSolo/end] error:", err);
      res.status(500).json({ message: "Gagal mengakhiri stream" });
    }
  });

  // ── POST /api/live/streams/:id/gift ─────────────────────────────────────
  // Viewer (atau host sendiri) kirim gift. Deduct kredit sender, kredit host.
  app.post("/api/live/streams/:id/gift", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login terlebih dahulu" });
    const { id } = req.params;
    const {
      giftName   = "Gift",
      amountCoins,
      giftId,
      qty        = 1,
      isSelfGift = false,
    } = req.body as { giftName?: string; amountCoins?: number; giftId?: number; qty?: number; isSelfGift?: boolean };

    if (!amountCoins || amountCoins <= 0) {
      return res.status(400).json({ message: "Jumlah gift tidak valid" });
    }

    try {
      // Cek stream aktif
      const streamRes = await db.execute(sql`
        SELECT host_user_id, host_username, status FROM live_streams WHERE id = ${id} LIMIT 1
      `);
      if (streamRes.rows.length === 0) return res.status(404).json({ message: "Stream tidak ditemukan" });
      const stream = streamRes.rows[0] as any;
      if (stream.status !== "live") return res.status(400).json({ message: "Stream sudah berakhir" });

      // Self-gift hanya boleh dari host sendiri
      const isHost = stream.host_user_id === req.session.userId;
      if (isHost && !isSelfGift) {
        return res.status(400).json({ message: "Host tidak bisa mengirim gift ke diri sendiri" });
      }

      // Ambil username + display_name + avatar (display_picture di user_profiles)
      const senderRes = await db.execute(sql`
        SELECT u.username, u.display_name, up.display_picture AS avatar_url
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE u.id = ${req.session.userId}
        LIMIT 1
      `);
      const senderUsername    = (senderRes.rows[0] as any)?.username ?? "";
      const senderDisplayName = (senderRes.rows[0] as any)?.display_name || senderUsername;
      const senderAvatarUrl   = (senderRes.rows[0] as any)?.avatar_url ?? null;

      // Lookup gift catalog untuk data efek + harga satuan + emoji
      let giftVideoUrl: string | null = null;
      let giftLottieUrl: string | null = null;
      let giftCategory: string | null = null;
      let giftUnitPrice: number = 0;
      let giftEmoji: string = '🎁';
      let giftImageUrl: string | null = null;
      try {
        const giftQuery = giftId
          ? await db.execute(sql`SELECT video_url, lottie_url, category, price, hot_key, image_url FROM party_gifts WHERE id = ${giftId} AND is_active = true LIMIT 1`)
          : await db.execute(sql`SELECT video_url, lottie_url, category, price, hot_key, image_url FROM party_gifts WHERE name ILIKE ${giftName.trim()} AND is_active = true LIMIT 1`);
        if (giftQuery.rows.length > 0) {
          const g = giftQuery.rows[0] as any;
          giftVideoUrl  = g.video_url   ?? null;
          giftLottieUrl = g.lottie_url  ?? null;
          giftCategory  = g.category    ?? null;
          giftUnitPrice = Number(g.price ?? 0);
          giftEmoji     = g.hot_key     ?? '🎁';
          giftImageUrl  = g.image_url   ?? null;
        }
      } catch { /* non-fatal — lanjut tanpa efek */ }

      // Cek saldo sender
      const balRes = await db.execute(sql`
        SELECT balance FROM credit_accounts
        WHERE username = ${senderUsername} AND currency = 'IDR'
        LIMIT 1
      `);
      const senderBalance = Number((balRes.rows[0] as any)?.balance ?? 0);
      if (senderBalance < amountCoins) {
        return res.status(400).json({ message: "Saldo tidak cukup untuk mengirim gift ini" });
      }

      // Deduct dari sender
      await db.execute(sql`
        UPDATE credit_accounts
        SET balance = balance - ${amountCoins}, updated_at = NOW()
        WHERE username = ${senderUsername} AND currency = 'IDR' AND balance >= ${amountCoins}
      `);

      // Hitung host cut berdasarkan kategori gift:
      // - Lucky       : 0.1% dari amountCoins
      // - Luxury/Popular/Costume Set/lainnya : 30%
      const isLuckyCategory = giftCategory === 'Lucky' || giftCategory === 'lucky';
      const hostCutRate     = isLuckyCategory ? 0.001 : 0.30;
      const hostCutAmount   = Math.floor(amountCoins * hostCutRate);

      // Konversi host cut (coin) → diamond lalu kredit ke diamond_balance host.
      // Berlaku untuk viewer gift DAN self-gift (host kirim ke diri sendiri).
      // Luxury mendapat rate konversi lebih baik (10 coin = 1.5 diamond).
      // Popular/Lucky/lainnya pakai rate normal (10 coin = 1 diamond).
      const isLuxuryCategory = giftCategory === 'Luxury';
      const hostDiamonds = hostCutAmount > 0
        ? (isLuxuryCategory ? luxuryCoinToDiamond(hostCutAmount) : coinToDiamond(hostCutAmount))
        : 0;

      if (hostDiamonds > 0) {
        const giftDesc = isSelfGift
          ? `Self-gift "${giftName}" ×${qty} (${giftCategory ?? 'Gift'}) — stream #${id}`
          : `Gift dari ${senderUsername}: "${giftName}" ×${qty} (${giftCategory ?? 'Gift'}) — stream #${id}`;
        await storage.adjustDiamondBalance(
          stream.host_username,
          hostDiamonds,
          'GIFT_RECEIVED',
          giftDesc,
          `livesolo-${id}-${Date.now()}`,
        ).catch((e: any) => console.error('[livesolo/gift] diamond credit error:', e));
      }

      // Log gift (tambah kolom gift_category & host_cut jika belum ada)
      await db.execute(sql`
        ALTER TABLE stream_gifts
          ADD COLUMN IF NOT EXISTS gift_category TEXT,
          ADD COLUMN IF NOT EXISTS host_cut      INTEGER NOT NULL DEFAULT 0
      `).catch(() => {/* non-fatal */});

      await db.execute(sql`
        INSERT INTO stream_gifts (stream_id, sender_user_id, sender_username, host_user_id, gift_name, amount_coins, gift_category, host_cut)
        VALUES (${id}, ${req.session.userId}, ${senderUsername}, ${stream.host_user_id}, ${giftName}, ${amountCoins}, ${giftCategory}, ${hostCutAmount})
      `);

      // Update total_gifts di live_streams (catat jumlah gift yang dikirim spender, bukan host cut)
      await db.execute(sql`
        UPDATE live_streams SET total_gifts = total_gifts + ${amountCoins} WHERE id = ${id}
      `);

      // ── Lucky Gift Drop System ────────────────────────────────────────────
      //
      // Dua mode berdasarkan harga gift:
      //
      //  PRICE 100  → CYCLE_500: setiap 500 tap BERULANG.
      //               Reward muncul N kali sesuai combo, reward = price×combo×10.
      //               HANYA aktif jika total_gifts room > 8.000.000 coin.
      //
      //  PRICE 10   → RANDOM_PER_TAP: tiap tap ada probabilitas drop.
      //               x1/x3/x9 sering, x19/x99 jarang.
      //               Reward = price × combo × 5.
      //
      //  HARGA LAIN → RANDOM_PER_TAP dengan rate lebih rendah, reward = price×combo×4.
      //
      const milestoneHits: { milestone: number; rewardCoins: number }[] = [];

      // Konfigurasi drop — dibaca dari luckyGetConfig.json
      const PRICE100_DROPS: Record<number, number> = lcCfg.price100.dropsByCombo as any;
      const PRICE100_ROOM_THRESHOLD                 = lcCfg.price100.roomThreshold;
      const OTHER_RATES:    Record<number, number>  = lcCfg.otherPrices.ratesByCombo as any;

      // Helper: kredit reward ke sender
      const creditDrop = async (rewardCoins: number, label: number) => {
        await db.execute(sql`
          INSERT INTO credit_accounts (username, currency, balance)
          VALUES (${senderUsername}, 'IDR', ${rewardCoins})
          ON CONFLICT (username, currency)
          DO UPDATE SET balance = credit_accounts.balance + ${rewardCoins}, updated_at = NOW()
        `);
        milestoneHits.push({ milestone: label, rewardCoins });
      };

      if (isLuckyCategory && !isHost && giftUnitPrice > 0) {
        try {
          // Pastikan tabel ada + migrate kolom drop_count
          // Helper: random integer antara min dan max (inklusif)
          const randInt = (min: number, max: number) =>
            Math.floor(Math.random() * (max - min + 1)) + min;

          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS lucky_solo_counter (
              id           SERIAL PRIMARY KEY,
              stream_id    TEXT    NOT NULL,
              user_id      INTEGER NOT NULL,
              gift_price   INTEGER NOT NULL,
              combo        INTEGER NOT NULL DEFAULT 1,
              tap_count    INTEGER NOT NULL DEFAULT 0,
              claimed_100  BOOLEAN NOT NULL DEFAULT FALSE,
              claimed_200  BOOLEAN NOT NULL DEFAULT FALSE,
              claimed_500  BOOLEAN NOT NULL DEFAULT FALSE,
              drop_count   INTEGER NOT NULL DEFAULT 0,
              next_trigger INTEGER NOT NULL DEFAULT 0,
              created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(stream_id, user_id, gift_price, combo)
            )
          `);
          await db.execute(sql`
            ALTER TABLE lucky_solo_counter ADD COLUMN IF NOT EXISTS drop_count   INTEGER NOT NULL DEFAULT 0
          `);
          await db.execute(sql`
            ALTER TABLE lucky_solo_counter ADD COLUMN IF NOT EXISTS next_trigger INTEGER NOT NULL DEFAULT 0
          `);
          await db.execute(sql`
            ALTER TABLE lucky_solo_counter ADD COLUMN IF NOT EXISTS p10_phase    INTEGER NOT NULL DEFAULT 0
          `);

          // Threshold pertama berbeda per harga (dibaca dari luckyGetConfig.json)
          const firstTrigger =
            giftUnitPrice === 10  ? randInt(lcCfg.price10.phase0.thresholdMin,   lcCfg.price10.phase0.thresholdMax)  :
            giftUnitPrice === 100 ? randInt(lcCfg.price100.firstTriggerMin,       lcCfg.price100.firstTriggerMax)     :
                                    randInt(lcCfg.otherPrices.firstTriggerMin,    lcCfg.otherPrices.firstTriggerMax);

          // Upsert + increment tap_count
          await db.execute(sql`
            INSERT INTO lucky_solo_counter (stream_id, user_id, gift_price, combo, tap_count, drop_count, next_trigger, p10_phase)
            VALUES (${id}, ${req.session.userId}, ${giftUnitPrice}, ${qty}, 1, 0, ${firstTrigger}, 0)
            ON CONFLICT (stream_id, user_id, gift_price, combo)
            DO UPDATE SET
              tap_count  = lucky_solo_counter.tap_count + 1,
              updated_at = NOW()
          `);

          // Baca state terbaru (tap_count + next_trigger + p10_phase)
          const ctrRes = await db.execute(sql`
            SELECT tap_count, next_trigger, p10_phase FROM lucky_solo_counter
            WHERE stream_id  = ${id}
              AND user_id    = ${req.session.userId}
              AND gift_price = ${giftUnitPrice}
              AND combo      = ${qty}
            LIMIT 1
          `);
          const taps        = Number((ctrRes.rows[0] as any)?.tap_count    ?? 0);
          const nextTrigger = Number((ctrRes.rows[0] as any)?.next_trigger ?? firstTrigger);
          const p10Phase    = Number((ctrRes.rows[0] as any)?.p10_phase    ?? 0);

          // ── MODE A: PRICE 100 — RANDOM CYCLE (threshold acak per siklus) ────
          // Trigger saat taps >= next_trigger. Setelah trigger, set
          // next_trigger = taps + random(480, 720) → setiap siklus beda panjang.
          if (giftUnitPrice === 100 && nextTrigger > 0 && taps >= nextTrigger) {
            // Cek total coin di room
            const roomRow = await db.execute(sql`
              SELECT total_gifts FROM live_streams WHERE id = ${id} LIMIT 1
            `);
            const roomCoins = Number((roomRow.rows[0] as any)?.total_gifts ?? 0);

            if (roomCoins >= PRICE100_ROOM_THRESHOLD) {
              const dropN      = PRICE100_DROPS[qty] ?? 3;
              const reward     = giftUnitPrice * qty * lcCfg.price100.rewardMultiplier;
              for (let i = 0; i < dropN; i++) {
                await creditDrop(reward, lcCfg.price100.label);
              }
              // Set next_trigger berikutnya — panjang siklus random (dari config)
              const nextGap  = randInt(lcCfg.price100.cycleMin, lcCfg.price100.cycleMax);
              const newTrigger = taps + nextGap;
              await db.execute(sql`
                UPDATE lucky_solo_counter
                SET drop_count   = drop_count + ${dropN},
                    next_trigger = ${newTrigger},
                    updated_at   = NOW()
                WHERE stream_id  = ${id} AND user_id = ${req.session.userId}
                  AND gift_price = ${giftUnitPrice} AND combo = ${qty}
              `);
            }

          // ── MODE B: PRICE 10 — MILESTONE 100× → 200× BERULANG ─────────────
          //
          //  Fase 0 (p10_phase=0): tunggu tap >= next_trigger (acak 90–115 dari siklus mulai)
          //                        → hit = "100× Get!" reward kecil, pindah ke fase 1
          //                        → next_trigger baru = taps + randInt(90, 115)
          //
          //  Fase 1 (p10_phase=1): tunggu tap >= next_trigger (acak 90–115 setelah fase 0)
          //                        → hit = "200× Get!" reward lebih besar, reset ke fase 0
          //                        → next_trigger baru = taps + randInt(90, 115)
          //
          //  Threshold ACAK → user tidak bisa menghitung; terasa alami.
          //
          } else if (giftUnitPrice === 10) {
            if (nextTrigger > 0 && taps >= nextTrigger) {
              if (p10Phase === 0) {
                // ─ Fase 0 → 100× Get! ─
                const reward = giftUnitPrice * qty * lcCfg.price10.phase0.rewardMultiplier;
                await creditDrop(reward, lcCfg.price10.phase0.label);
                const gapNext = randInt(lcCfg.price10.phase0.thresholdMin, lcCfg.price10.phase0.thresholdMax);
                await db.execute(sql`
                  UPDATE lucky_solo_counter
                  SET p10_phase    = 1,
                      next_trigger = ${taps + gapNext},
                      drop_count   = drop_count + 1,
                      updated_at   = NOW()
                  WHERE stream_id  = ${id} AND user_id = ${req.session.userId}
                    AND gift_price = ${giftUnitPrice} AND combo = ${qty}
                `);
              } else {
                // ─ Fase 1 → 200× Get! ─
                const reward = giftUnitPrice * qty * lcCfg.price10.phase1.rewardMultiplier;
                await creditDrop(reward, lcCfg.price10.phase1.label);
                // Reset ke fase 0, threshold baru untuk siklus berikutnya
                const gapNext = randInt(lcCfg.price10.phase1.thresholdMin, lcCfg.price10.phase1.thresholdMax);
                await db.execute(sql`
                  UPDATE lucky_solo_counter
                  SET p10_phase    = 0,
                      next_trigger = ${taps + gapNext},
                      drop_count   = drop_count + 1,
                      updated_at   = NOW()
                  WHERE stream_id  = ${id} AND user_id = ${req.session.userId}
                    AND gift_price = ${giftUnitPrice} AND combo = ${qty}
                `);
              }
            }

          // ── MODE C: HARGA LAIN (20/30/50) — RANDOM PER TAP ─────────────────
          } else if (giftUnitPrice !== 100) {
            const rate   = OTHER_RATES[qty] ?? 0.04;
            const reward = giftUnitPrice * qty * lcCfg.otherPrices.rewardMultiplier;
            if (Math.random() < rate) {
              await creditDrop(reward, 0);
              await db.execute(sql`
                UPDATE lucky_solo_counter
                SET drop_count = drop_count + 1, updated_at = NOW()
                WHERE stream_id = ${id} AND user_id = ${req.session.userId}
                  AND gift_price = ${giftUnitPrice} AND combo = ${qty}
              `);
            }
          }

        } catch (e) {
          console.error('[luckyDrop] error:', e);
          /* non-fatal */
        }
      }

      // Broadcast gift event ke semua yang ada di live solo room
      try {
        broadcastToRoom(`livesolo-${id}`, {
          type:               "LIVE_GIFT",
          streamId:           id,
          senderUsername:     senderUsername,
          senderDisplayName:  senderDisplayName,
          senderAvatarUrl:    senderAvatarUrl,
          giftId:             giftId ?? null,
          giftName,
          giftEmoji:          giftEmoji,
          giftImageUrl:       giftImageUrl,
          amountCoins,
          qty:            qty ?? 1,
          isSelfGift:     !!isSelfGift,
          videoUrl:       giftVideoUrl,
          lottieUrl:      giftLottieUrl,
          giftCategory:   giftCategory,
          hostCut:        hostCutAmount,
          hostCutRate:    hostCutRate,
        } as any);
      } catch { /* non-fatal */ }

      // PK Battle scoring — add to host's score if PK is active
      try {
        const pkRow = await db.execute(sql`
          SELECT id, challenger_stream_id, opponent_stream_id
          FROM pk_battles
          WHERE status = 'active'
            AND (challenger_stream_id = ${id} OR opponent_stream_id = ${id})
          LIMIT 1
        `);
        if (pkRow.rows.length > 0) {
          const pk = pkRow.rows[0] as any;
          if (pk.challenger_stream_id === id) {
            await db.execute(sql`UPDATE pk_battles SET challenger_score = challenger_score + ${amountCoins} WHERE id = ${pk.id}`);
          } else {
            await db.execute(sql`UPDATE pk_battles SET opponent_score = opponent_score + ${amountCoins} WHERE id = ${pk.id}`);
          }
          const upd = await db.execute(sql`SELECT challenger_score, opponent_score FROM pk_battles WHERE id = ${pk.id} LIMIT 1`);
          const sc = upd.rows[0] as any;
          const scorePayload = { type: "PK_SCORE_UPDATE", battleId: Number(pk.id), challengerScore: Number(sc.challenger_score), opponentScore: Number(sc.opponent_score) };
          broadcastToRoom(`livesolo-${pk.challenger_stream_id}`, scorePayload as any);
          broadcastToRoom(`livesolo-${pk.opponent_stream_id}`, scorePayload as any);
        }
      } catch { /* non-fatal */ }

      // Broadcast LUCKY_MILESTONE ke sender jika ada milestone baru
      if (milestoneHits.length > 0) {
        try {
          broadcastToRoom(`livesolo-${id}`, {
            type:           "LUCKY_MILESTONE",
            streamId:       id,
            senderUsername: senderUsername,
            targetUserId:   req.session.userId,
            milestones:     milestoneHits,
            giftName,
            giftPrice:      giftUnitPrice,
            combo:          qty,
          } as any);
        } catch { /* non-fatal */ }
      }

      // ── JP Cring System ───────────────────────────────────────────────────
      // Cashback jackpot thresholds: 500 → 1000 → 5000 → 10000 → +10000/cycle
      let jpReward:  number | null = null;
      let jpType:    'normal' | 'jackpot' | null = null;
      let jpThresh:  number | null = null;
      try {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS solo_jp_counter (
            stream_id   INTEGER NOT NULL,
            user_id     INTEGER NOT NULL,
            total_sent  INTEGER NOT NULL DEFAULT 0,
            next_thresh INTEGER NOT NULL DEFAULT 500,
            updated_at  TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (stream_id, user_id)
          )
        `);

        await db.execute(sql`
          INSERT INTO solo_jp_counter (stream_id, user_id, total_sent, next_thresh)
          VALUES (${id}, ${req.session.userId}, ${amountCoins}, 500)
          ON CONFLICT (stream_id, user_id) DO UPDATE
          SET total_sent = solo_jp_counter.total_sent + ${amountCoins},
              updated_at = NOW()
        `);

        const ctr = await db.execute(sql`
          SELECT total_sent, next_thresh FROM solo_jp_counter
          WHERE stream_id = ${id} AND user_id = ${req.session.userId}
        `);
        const totalSent  = Number((ctr.rows[0] as any)?.total_sent  ?? 0);
        const nextThresh = Number((ctr.rows[0] as any)?.next_thresh ?? 500);

        if (totalSent >= nextThresh) {
          jpThresh = nextThresh;
          const isJackpot = Math.random() < 0.05;
          const raw = isJackpot
            ? nextThresh * (2.0 + Math.random() * 3.0)
            : nextThresh * (0.48 + Math.random() * 0.64);
          jpReward = Math.round(raw / 10) * 10;
          jpType   = isJackpot ? 'jackpot' : 'normal';

          // Credit reward coins to sender's balance
          await db.execute(sql`
            UPDATE credit_accounts
            SET balance    = balance + ${jpReward},
                updated_at = NOW()
            WHERE username = ${senderUsername} AND currency = 'IDR'
          `);

          // Log transaction (type 34 = GAME_REWARD)
          await db.execute(sql`
            INSERT INTO credit_transactions
              (username, type, amount, funded_amount, tax, running_balance, description, currency)
            VALUES
              (${senderUsername}, 34, ${jpReward}, 0, 0, 0,
               ${'JP Cring +' + jpReward + ' coin (threshold ' + nextThresh + ', stream #' + id + ')'},
               'IDR')
          `).catch(() => {});

          // Advance to next threshold
          const JP_THRESHOLDS = [500, 1_000, 5_000, 10_000];
          const idx = JP_THRESHOLDS.indexOf(nextThresh);
          const newThresh = (idx >= 0 && idx < JP_THRESHOLDS.length - 1)
            ? JP_THRESHOLDS[idx + 1]
            : Math.ceil((totalSent + 1) / 10_000) * 10_000;

          await db.execute(sql`
            UPDATE solo_jp_counter
            SET next_thresh = ${newThresh}, updated_at = NOW()
            WHERE stream_id = ${id} AND user_id = ${req.session.userId}
          `);

          console.log(`[JP Cring] ${senderUsername} +${jpReward} coins (${jpType}, threshold ${nextThresh}, stream #${id})`);
        }
      } catch (jpErr) {
        console.error('[liveSolo/jp]', jpErr);
      }

      res.json({
        ok:           true,
        giftName,
        amountCoins,
        milestoneHits,
        jpReward,
        jpType,
        jpThreshold:  jpThresh,
      });
    } catch (err) {
      console.error("[liveSolo/gift] error:", err);
      res.status(500).json({ message: "Gagal mengirim gift" });
    }
  });

  // ── POST /api/live/streams/:id/kick ─────────────────────────────────────
  // Host kick viewer dari stream. Broadcast LIVE_KICK ke room.
  app.post("/api/live/streams/:id/kick", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login" });
    const { id } = req.params;
    const { username } = req.body as { username?: string };
    if (!username) return res.status(400).json({ message: "username diperlukan" });

    try {
      const streamRes = await db.execute(sql`
        SELECT host_user_id FROM live_streams WHERE id = ${id} AND status = 'live' LIMIT 1
      `);
      if (streamRes.rows.length === 0) return res.status(404).json({ message: "Stream tidak ditemukan atau sudah berakhir" });
      const stream = streamRes.rows[0] as any;
      if (stream.host_user_id !== req.session.userId) {
        return res.status(403).json({ message: "Hanya host yang bisa kick" });
      }

      // Tandai viewer sudah left
      await db.execute(sql`
        UPDATE stream_viewers SET left_at = NOW()
        WHERE stream_id = ${id} AND LOWER(username) = LOWER(${username}) AND left_at IS NULL
      `);

      // Update viewer count
      await db.execute(sql`
        UPDATE live_streams
        SET viewer_count = (
          SELECT COUNT(*) FROM stream_viewers WHERE stream_id = ${id} AND left_at IS NULL
        )
        WHERE id = ${id}
      `);

      // Broadcast kick event ke room agar viewer modal bisa auto-close
      try {
        broadcastToRoom(`livesolo-${id}`, {
          type: "LIVE_KICK",
          streamId: id,
          username,
        } as any);
      } catch { /* non-fatal */ }

      res.json({ ok: true });
    } catch (err) {
      console.error("[liveSolo/kick] error:", err);
      res.status(500).json({ message: "Gagal kick viewer" });
    }
  });

  // ── GET /api/live/streams/:id/blocked ───────────────────────────────────
  // Daftar user yang diblok dari stream ini (host only).
  app.get("/api/live/streams/:id/blocked", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login" });
    const { id } = req.params;
    try {
      const streamRes = await db.execute(sql`SELECT host_user_id FROM live_streams WHERE id = ${id} LIMIT 1`);
      if (streamRes.rows.length === 0) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((streamRes.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa melihat daftar block" });

      const BASE = (process.env.IMG_BASE_URL ?? "").replace(/\/$/, "");
      const result = await db.execute(sql`
        SELECT user_id, username, display_name, avatar_url, blocked_at
        FROM stream_blocked_users
        WHERE stream_id = ${id}
        ORDER BY blocked_at DESC
      `);
      const blocked = (result.rows as any[]).map(r => ({
        userId:      r.user_id,
        username:    r.username,
        displayName: r.display_name ?? r.username,
        avatarUrl:   r.avatar_url
          ? (r.avatar_url.startsWith("http") ? r.avatar_url : `${BASE}${r.avatar_url}`)
          : null,
        blockedAt:   r.blocked_at,
      }));
      res.json({ blocked });
    } catch (err) {
      console.error("[liveSolo/blocked GET] error:", err);
      res.status(500).json({ message: "Gagal mengambil daftar block" });
    }
  });

  // ── POST /api/live/streams/:id/block ────────────────────────────────────
  // Host block viewer — kick dari room sekaligus blokir masuk kembali.
  app.post("/api/live/streams/:id/block", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login" });
    const { id } = req.params;
    const { username } = req.body as { username?: string };
    if (!username) return res.status(400).json({ message: "username diperlukan" });

    try {
      const streamRes = await db.execute(sql`
        SELECT host_user_id FROM live_streams WHERE id = ${id} AND status = 'live' LIMIT 1
      `);
      if (streamRes.rows.length === 0) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((streamRes.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa block" });

      // Ambil data user yang di-block untuk disimpan
      const BASE = (process.env.IMG_BASE_URL ?? "").replace(/\/$/, "");
      const userRes = await db.execute(sql`
        SELECT u.id, u.display_name, up.display_picture AS avatar_url
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE LOWER(u.username) = LOWER(${username})
        LIMIT 1
      `);
      const udata = (userRes.rows[0] as any) ?? {};
      const userId     = udata.id ?? username;
      const displayName = udata.display_name ?? username;
      const rawAvatar   = udata.avatar_url ?? null;
      const avatarUrl   = rawAvatar
        ? (rawAvatar.startsWith("http") ? rawAvatar : `${BASE}${rawAvatar}`)
        : null;

      // Insert ke blocked list (upsert — kalau sudah ada, perbarui waktu)
      await db.execute(sql`
        INSERT INTO stream_blocked_users (stream_id, user_id, username, display_name, avatar_url, blocked_by)
        VALUES (${id}, ${String(userId)}, ${username}, ${displayName}, ${avatarUrl}, ${String(req.session.userId)})
        ON CONFLICT (stream_id, user_id) DO UPDATE SET blocked_at = NOW()
      `);

      // Kick dari room (set left_at)
      await db.execute(sql`
        UPDATE stream_viewers SET left_at = NOW()
        WHERE stream_id = ${id} AND LOWER(username) = LOWER(${username}) AND left_at IS NULL
      `);

      // Update viewer count
      await db.execute(sql`
        UPDATE live_streams
        SET viewer_count = (
          SELECT COUNT(*) FROM stream_viewers WHERE stream_id = ${id} AND left_at IS NULL
        )
        WHERE id = ${id}
      `);

      // Broadcast kick event
      try {
        broadcastToRoom(`livesolo-${id}`, {
          type: "LIVE_KICK",
          streamId: id,
          username,
        } as any);
      } catch { /* non-fatal */ }

      res.json({ ok: true });
    } catch (err) {
      console.error("[liveSolo/block] error:", err);
      res.status(500).json({ message: "Gagal block viewer" });
    }
  });

  // ── DELETE /api/live/streams/:id/blocked/:userId ─────────────────────────
  // Host cabut block seorang user.
  app.delete("/api/live/streams/:id/blocked/:userId", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login" });
    const { id, userId } = req.params;
    try {
      const streamRes = await db.execute(sql`SELECT host_user_id FROM live_streams WHERE id = ${id} LIMIT 1`);
      if (streamRes.rows.length === 0) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((streamRes.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa cabut block" });

      await db.execute(sql`
        DELETE FROM stream_blocked_users WHERE stream_id = ${id} AND user_id = ${userId}
      `);
      res.json({ ok: true });
    } catch (err) {
      console.error("[liveSolo/unblock] error:", err);
      res.status(500).json({ message: "Gagal cabut block" });
    }
  });

  // ── POST /api/live/streams/:id/join ─────────────────────────────────────
  // Viewer join stream — tracking analytics.
  app.post("/api/live/streams/:id/join", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login" });
    const { id } = req.params;

    try {
      const userRes = await db.execute(sql`
        SELECT u.username, u.display_name, COALESCE(p.vip_level, 0) AS vip_level, p.display_picture,
               COALESCE(p.lifetime_topup, 0) AS lifetime_topup
        FROM users u
        LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.id = ${req.session.userId} LIMIT 1
      `);
      const username      = (userRes.rows[0] as any)?.username      ?? "";
      const displayName   = (userRes.rows[0] as any)?.display_name  ?? username;
      const vipLevel      = Number((userRes.rows[0] as any)?.vip_level     ?? 0);
      const lifetimeTopup = Number((userRes.rows[0] as any)?.lifetime_topup ?? 0);
      const hasTopup      = lifetimeTopup > 0;
      const avatarUrl     = (userRes.rows[0] as any)?.display_picture ?? null;

      // Cek apakah user diblokir dari stream ini
      const blockCheck = await db.execute(sql`
        SELECT 1 FROM stream_blocked_users
        WHERE stream_id = ${id} AND user_id = ${String(req.session.userId)}
        LIMIT 1
      `);
      if (blockCheck.rows.length > 0) {
        return res.status(403).json({ blocked: true, message: "Kamu diblokir dari live ini" });
      }

      // Upsert — kalau sudah ada dan belum left, update joined_at saja
      await db.execute(sql`
        INSERT INTO stream_viewers (stream_id, user_id, username)
        VALUES (${id}, ${req.session.userId}, ${username})
        ON CONFLICT (stream_id, user_id) DO UPDATE SET joined_at = NOW(), left_at = NULL
      `);

      // Update viewer_count di live_streams
      await db.execute(sql`
        UPDATE live_streams
        SET viewer_count = (
          SELECT COUNT(*) FROM stream_viewers
          WHERE stream_id = ${id} AND left_at IS NULL
        )
        WHERE id = ${id}
      `);

      // Broadcast viewer join ke host dan semua yang ada di room
      try {
        broadcastToRoom(`livesolo-${id}`, {
          type: "LIVE_JOIN",
          streamId: id,
          username,
          displayName,
          vipLevel,
          hasTopup,
          avatarUrl,
        } as any);
      } catch { /* non-fatal */ }

      res.json({ ok: true });
    } catch (err) {
      console.error("[liveSolo/join] error:", err);
      res.status(500).json({ message: "Gagal join stream" });
    }
  });

  // ── GET /api/live/announcement ───────────────────────────────────────────
  // Public endpoint — clients fetch current active live room announcement.
  app.get("/api/live/announcement", async (_req: Request, res: Response) => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS system_settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      const rows = await db.execute(sql`
        SELECT key, value FROM system_settings
        WHERE key IN ('live.announcement.enabled', 'live.announcement.text')
      `);
      const map: Record<string, string> = {};
      for (const r of rows.rows as any[]) map[r.key] = r.value;
      res.json({
        enabled: map['live.announcement.enabled'] === 'true',
        text:    map['live.announcement.text']    ?? '',
      });
    } catch (err) {
      console.error("[liveSolo/announcement] error:", err);
      res.status(500).json({ enabled: false, text: '' });
    }
  });

  // ── POST /api/live/announcement/internal-broadcast ────────────────────────
  // Internal endpoint called by admin panel after saving a new live announcement.
  // Broadcasts LIVE_ANNOUNCEMENT to all connected WS clients.
  // Protected by X-Internal-Token header = SESSION_SECRET env var.
  app.post("/api/live/announcement/internal-broadcast", async (req: Request, res: Response) => {
    const token    = req.headers['x-internal-token'] as string | undefined;
    const expected = process.env.SESSION_SECRET || 'migme-internal';
    if (!token || token !== expected) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const { text = '', enabled = false } = req.body as { text?: string; enabled?: boolean };
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS system_settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`
        INSERT INTO system_settings (key, value, updated_at) VALUES ('live.announcement.enabled', ${String(enabled)}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `);
      await db.execute(sql`
        INSERT INTO system_settings (key, value, updated_at) VALUES ('live.announcement.text', ${text}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `);
      if (enabled && text.trim()) {
        broadcastToAllClients({
          type: "LIVE_ANNOUNCEMENT",
          text,
        } as any);
        console.log(`[liveSolo] Announcement broadcast: ${text.slice(0, 60)}...`);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[liveSolo/announcement-broadcast] error:", err);
      res.status(500).json({ message: "Gagal broadcast pengumuman" });
    }
  });

  // ── GET /api/live/streams/:id/admins ─────────────────────────────────────
  app.get("/api/live/streams/:id/admins", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    try {
      const stream = await db.execute(sql`SELECT host_user_id FROM live_streams WHERE id = ${id} LIMIT 1`);
      if (!stream.rows.length) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((stream.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa melihat daftar admin" });

      const rows = await db.execute(sql`
        SELECT username, display_name, avatar_url, added_at
        FROM live_stream_admins WHERE stream_id = ${id} ORDER BY added_at DESC
      `);
      res.json({ admins: rows.rows });
    } catch (err) {
      console.error("[liveSolo/admins-get] error:", err);
      res.status(500).json({ message: "Gagal ambil daftar admin" });
    }
  });

  // ── POST /api/live/streams/:id/admins ─────────────────────────────────────
  app.post("/api/live/streams/:id/admins", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    const { username } = req.body as { username?: string };
    if (!username?.trim()) return res.status(400).json({ message: "Username tidak boleh kosong" });

    try {
      const stream = await db.execute(sql`SELECT host_user_id FROM live_streams WHERE id = ${id} AND status = 'live' LIMIT 1`);
      if (!stream.rows.length) return res.status(404).json({ message: "Stream tidak ditemukan atau sudah berakhir" });
      if ((stream.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa menambah admin" });

      const userRes = await db.execute(sql`
        SELECT u.username, u.display_name, up.display_picture
        FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE LOWER(u.username) = LOWER(${username.trim()}) LIMIT 1
      `);
      if (!userRes.rows.length) return res.status(404).json({ message: "User tidak ditemukan" });
      const user = userRes.rows[0] as any;

      await db.execute(sql`
        INSERT INTO live_stream_admins (stream_id, username, display_name, avatar_url, added_by)
        VALUES (${id}, ${user.username}, ${user.display_name ?? null}, ${user.display_picture ?? null}, ${req.session.userId})
        ON CONFLICT (stream_id, username) DO NOTHING
      `);
      res.json({ ok: true, admin: { username: user.username, displayName: user.display_name ?? null, avatarUrl: user.display_picture ?? null } });
    } catch (err) {
      console.error("[liveSolo/admins-add] error:", err);
      res.status(500).json({ message: "Gagal tambah admin" });
    }
  });

  // ── DELETE /api/live/streams/:id/admins/:username ─────────────────────────
  app.delete("/api/live/streams/:id/admins/:username", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id, username } = req.params;
    try {
      const stream = await db.execute(sql`SELECT host_user_id FROM live_streams WHERE id = ${id} LIMIT 1`);
      if (!stream.rows.length) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((stream.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa menghapus admin" });

      await db.execute(sql`DELETE FROM live_stream_admins WHERE stream_id = ${id} AND LOWER(username) = LOWER(${username})`);
      res.json({ ok: true });
    } catch (err) {
      console.error("[liveSolo/admins-remove] error:", err);
      res.status(500).json({ message: "Gagal hapus admin" });
    }
  });

  // ── POST /api/live/streams/:id/leave ────────────────────────────────────
  // Viewer leave stream — tracking analytics.
  app.post("/api/live/streams/:id/leave", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Kamu harus login" });
    const { id } = req.params;

    try {
      await db.execute(sql`
        UPDATE stream_viewers SET left_at = NOW()
        WHERE stream_id = ${id} AND user_id = ${req.session.userId} AND left_at IS NULL
      `);

      await db.execute(sql`
        UPDATE live_streams
        SET viewer_count = (
          SELECT COUNT(*) FROM stream_viewers
          WHERE stream_id = ${id} AND left_at IS NULL
        )
        WHERE id = ${id}
      `);

      res.json({ ok: true });
    } catch (err) {
      console.error("[liveSolo/leave] error:", err);
      res.status(500).json({ message: "Gagal leave stream" });
    }
  });

  // ─── KOMAL SEATS — Audio guest seats in Solo Live ─────────────────────────

  // Ensure komal tables exist (lazy, one-time init)
  let komalTablesReady = false;
  async function ensureKomalTables() {
    if (komalTablesReady) return;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS live_komal_active (
        stream_id    TEXT PRIMARY KEY,
        activated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS live_komal_seats (
        stream_id    TEXT    NOT NULL,
        seat_num     INT     NOT NULL CHECK (seat_num BETWEEN 1 AND 3),
        username     TEXT,
        display_name TEXT,
        avatar_url   TEXT,
        is_muted     BOOLEAN NOT NULL DEFAULT false,
        joined_at    TIMESTAMPTZ,
        PRIMARY KEY (stream_id, seat_num)
      )
    `);
    komalTablesReady = true;
  }

  // Helper: get all 3 seat rows for a stream
  async function getKomalSeats(streamId: string) {
    await ensureKomalTables();
    const rows = await db.execute(sql`
      SELECT seat_num, username, display_name, avatar_url, is_muted, joined_at
      FROM live_komal_seats
      WHERE stream_id = ${streamId}
      ORDER BY seat_num
    `);
    // Fill in empty seats for 1-3
    const map: Record<number, any> = {};
    for (const r of rows.rows as any[]) map[r.seat_num] = r;
    return [1, 2, 3].map(n => ({
      seatNum:     n,
      username:    map[n]?.username    ?? null,
      displayName: map[n]?.display_name ?? null,
      avatarUrl:   map[n]?.avatar_url  ?? null,
      isMuted:     map[n]?.is_muted    ?? false,
      joinedAt:    map[n]?.joined_at   ?? null,
    }));
  }

  // ── GET /api/live/streams/:id/komal ─────────────────────────────────────
  app.get("/api/live/streams/:id/komal", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await ensureKomalTables();
      const activeRow = await db.execute(sql`
        SELECT stream_id FROM live_komal_active WHERE stream_id = ${id} LIMIT 1
      `);
      const active = activeRow.rows.length > 0;
      const seats  = await getKomalSeats(id);
      res.json({ active, seats });
    } catch (err) {
      console.error("[komal/get] error:", err);
      res.status(500).json({ message: "Gagal ambil status Komal" });
    }
  });

  // ── POST /api/live/streams/:id/komal/activate ────────────────────────────
  app.post("/api/live/streams/:id/komal/activate", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    try {
      const streamRow = await db.execute(sql`
        SELECT host_user_id FROM live_streams WHERE id = ${id} AND status = 'live' LIMIT 1
      `);
      if (!streamRow.rows.length) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((streamRow.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa mengaktifkan Komal" });

      await ensureKomalTables();
      await db.execute(sql`
        INSERT INTO live_komal_active (stream_id) VALUES (${id})
        ON CONFLICT (stream_id) DO NOTHING
      `);

      broadcastToRoom(`livesolo-${id}`, { type: "KOMAL_ACTIVATED", streamId: id });
      const seats = await getKomalSeats(id);
      res.json({ ok: true, seats });
    } catch (err) {
      console.error("[komal/activate] error:", err);
      res.status(500).json({ message: "Gagal aktifkan Komal" });
    }
  });

  // ── POST /api/live/streams/:id/komal/deactivate ──────────────────────────
  app.post("/api/live/streams/:id/komal/deactivate", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    try {
      const streamRow = await db.execute(sql`
        SELECT host_user_id FROM live_streams WHERE id = ${id} LIMIT 1
      `);
      if (!streamRow.rows.length) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((streamRow.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa menonaktifkan Komal" });

      await ensureKomalTables();
      await db.execute(sql`DELETE FROM live_komal_seats WHERE stream_id = ${id}`);
      await db.execute(sql`DELETE FROM live_komal_active WHERE stream_id = ${id}`);

      broadcastToRoom(`livesolo-${id}`, { type: "KOMAL_DEACTIVATED", streamId: id });
      res.json({ ok: true });
    } catch (err) {
      console.error("[komal/deactivate] error:", err);
      res.status(500).json({ message: "Gagal nonaktifkan Komal" });
    }
  });

  // ── POST /api/live/streams/:id/komal/token ───────────────────────────────
  // Viewer mendapatkan LiveKit token dengan publish permission (audio-only)
  app.post("/api/live/streams/:id/komal/token", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    try {
      await ensureKomalTables();
      const activeRow = await db.execute(sql`
        SELECT stream_id FROM live_komal_active WHERE stream_id = ${id} LIMIT 1
      `);
      if (!activeRow.rows.length) return res.status(400).json({ message: "Komal belum aktif" });

      const userRow = await db.execute(sql`
        SELECT u.username FROM users u WHERE u.id = ${req.session.userId} LIMIT 1
      `);
      if (!userRow.rows.length) return res.status(404).json({ message: "User tidak ditemukan" });
      const username = (userRow.rows[0] as any).username;

      const tokenInfo = await generateToken(id, `komal-${username}`, true);
      res.json({ ok: true, token: tokenInfo.token, url: tokenInfo.url, provider: tokenInfo.provider });
    } catch (err) {
      console.error("[komal/token] error:", err);
      res.status(500).json({ message: "Gagal buat token Komal" });
    }
  });

  // ── POST /api/live/streams/:id/komal/seats/:n/join ───────────────────────
  app.post("/api/live/streams/:id/komal/seats/:n/join", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id, n } = req.params;
    const seatNum = parseInt(n);
    if (isNaN(seatNum) || seatNum < 1 || seatNum > 3)
      return res.status(400).json({ message: "Seat tidak valid (1-3)" });

    try {
      await ensureKomalTables();
      const activeRow = await db.execute(sql`
        SELECT stream_id FROM live_komal_active WHERE stream_id = ${id} LIMIT 1
      `);
      if (!activeRow.rows.length) return res.status(400).json({ message: "Komal belum aktif" });

      // Check seat is empty
      const existing = await db.execute(sql`
        SELECT username FROM live_komal_seats
        WHERE stream_id = ${id} AND seat_num = ${seatNum}
        LIMIT 1
      `);
      if (existing.rows.length > 0 && (existing.rows[0] as any).username)
        return res.status(409).json({ message: "Seat sudah terisi" });

      // Check viewer not already on another seat
      const userRow = await db.execute(sql`
        SELECT u.username, u.display_name, up.display_picture
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE u.id = ${req.session.userId} LIMIT 1
      `);
      if (!userRow.rows.length) return res.status(404).json({ message: "User tidak ditemukan" });
      const user = userRow.rows[0] as any;

      const onOther = await db.execute(sql`
        SELECT seat_num FROM live_komal_seats
        WHERE stream_id = ${id} AND LOWER(username) = LOWER(${user.username})
        LIMIT 1
      `);
      if (onOther.rows.length > 0)
        return res.status(409).json({ message: "Kamu sudah ada di Komal seat" });

      await db.execute(sql`
        INSERT INTO live_komal_seats (stream_id, seat_num, username, display_name, avatar_url, is_muted, joined_at)
        VALUES (${id}, ${seatNum}, ${user.username}, ${user.display_name ?? null}, ${user.display_picture ?? null}, false, NOW())
        ON CONFLICT (stream_id, seat_num) DO UPDATE
          SET username = EXCLUDED.username,
              display_name = EXCLUDED.display_name,
              avatar_url = EXCLUDED.avatar_url,
              is_muted = false,
              joined_at = NOW()
      `);

      const seats = await getKomalSeats(id);
      broadcastToRoom(`livesolo-${id}`, {
        type:    "KOMAL_UPDATE",
        streamId: id,
        seats,
        event:   "JOIN",
        seatNum,
        username: user.username,
      });
      res.json({ ok: true, seats });
    } catch (err) {
      console.error("[komal/seat-join] error:", err);
      res.status(500).json({ message: "Gagal join Komal seat" });
    }
  });

  // ── POST /api/live/streams/:id/komal/seats/:n/leave ─────────────────────
  app.post("/api/live/streams/:id/komal/seats/:n/leave", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id, n } = req.params;
    const seatNum = parseInt(n);
    if (isNaN(seatNum) || seatNum < 1 || seatNum > 3)
      return res.status(400).json({ message: "Seat tidak valid (1-3)" });

    try {
      await ensureKomalTables();
      const seatRow = await db.execute(sql`
        SELECT username FROM live_komal_seats
        WHERE stream_id = ${id} AND seat_num = ${seatNum} LIMIT 1
      `);
      if (!seatRow.rows.length) return res.json({ ok: true });

      const username = (seatRow.rows[0] as any).username;

      // Only the seat holder or host can leave/kick
      const streamRow = await db.execute(sql`
        SELECT host_user_id FROM live_streams WHERE id = ${id} LIMIT 1
      `);
      const isHost = streamRow.rows.length > 0 &&
        (streamRow.rows[0] as any).host_user_id === req.session.userId;
      const selfRow = await db.execute(sql`
        SELECT username FROM users WHERE id = ${req.session.userId} LIMIT 1
      `);
      const myUsername = selfRow.rows.length > 0 ? (selfRow.rows[0] as any).username : null;
      const isSelf = myUsername && username && myUsername.toLowerCase() === username.toLowerCase();

      if (!isHost && !isSelf)
        return res.status(403).json({ message: "Tidak diizinkan" });

      await db.execute(sql`
        DELETE FROM live_komal_seats WHERE stream_id = ${id} AND seat_num = ${seatNum}
      `);

      const seats = await getKomalSeats(id);
      broadcastToRoom(`livesolo-${id}`, {
        type:    "KOMAL_UPDATE",
        streamId: id,
        seats,
        event:   "LEAVE",
        seatNum,
        username,
      });
      res.json({ ok: true, seats });
    } catch (err) {
      console.error("[komal/seat-leave] error:", err);
      res.status(500).json({ message: "Gagal leave Komal seat" });
    }
  });

  // ── POST /api/live/streams/:id/komal/seats/:n/mute ──────────────────────
  // Host only — mute/unmute a komal guest
  app.post("/api/live/streams/:id/komal/seats/:n/mute", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id, n } = req.params;
    const seatNum = parseInt(n);
    const { muted } = req.body as { muted?: boolean };
    if (isNaN(seatNum) || seatNum < 1 || seatNum > 3)
      return res.status(400).json({ message: "Seat tidak valid" });

    try {
      const streamRow = await db.execute(sql`
        SELECT host_user_id FROM live_streams WHERE id = ${id} LIMIT 1
      `);
      if (!streamRow.rows.length) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((streamRow.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa mute Komal" });

      await ensureKomalTables();
      const isMuted = muted !== false;
      await db.execute(sql`
        UPDATE live_komal_seats SET is_muted = ${isMuted}
        WHERE stream_id = ${id} AND seat_num = ${seatNum}
      `);

      const seats = await getKomalSeats(id);
      broadcastToRoom(`livesolo-${id}`, {
        type:    "KOMAL_UPDATE",
        streamId: id,
        seats,
        event:   "MUTE",
        seatNum,
        isMuted,
      });
      res.json({ ok: true, seats });
    } catch (err) {
      console.error("[komal/mute] error:", err);
      res.status(500).json({ message: "Gagal mute Komal" });
    }
  });

  // ── POST /api/live/streams/:id/komal/raise-hand ───────────────────────────
  // Viewer raises hand to request joining Komal — broadcasts to host
  app.post("/api/live/streams/:id/komal/raise-hand", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    try {
      await ensureKomalTables();
      const activeRow = await db.execute(sql`
        SELECT stream_id FROM live_komal_active WHERE stream_id = ${id} LIMIT 1
      `);
      if (!activeRow.rows.length) return res.status(400).json({ message: "Komal belum aktif" });

      const userRow = await db.execute(sql`
        SELECT u.username, u.display_name, up.display_picture
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE u.id = ${req.session.userId} LIMIT 1
      `);
      if (!userRow.rows.length) return res.status(404).json({ message: "User tidak ditemukan" });
      const user = userRow.rows[0] as any;

      // Check viewer not already on a seat
      const onSeat = await db.execute(sql`
        SELECT seat_num FROM live_komal_seats
        WHERE stream_id = ${id} AND LOWER(username) = LOWER(${user.username}) LIMIT 1
      `);
      if (onSeat.rows.length > 0) return res.status(409).json({ message: "Kamu sudah di Komal seat" });

      broadcastToRoom(`livesolo-${id}`, {
        type:        "KOMAL_HAND_RAISE",
        streamId:    id,
        username:    user.username,
        displayName: user.display_name ?? null,
        avatarUrl:   user.display_picture ?? null,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[komal/raise-hand] error:", err);
      res.status(500).json({ message: "Gagal raise hand" });
    }
  });

  // ── POST /api/live/streams/:id/komal/raise-hand/approve ──────────────────
  // Host only — approve a hand raise; auto-assigns next available seat
  app.post("/api/live/streams/:id/komal/raise-hand/approve", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    const { username } = req.body as { username?: string };
    if (!username) return res.status(400).json({ message: "username diperlukan" });

    try {
      const streamRow = await db.execute(sql`
        SELECT host_user_id FROM live_streams WHERE id = ${id} LIMIT 1
      `);
      if (!streamRow.rows.length) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((streamRow.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa approve" });

      await ensureKomalTables();

      // Get the user's profile
      const userRow = await db.execute(sql`
        SELECT u.username, u.display_name, up.display_picture
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE LOWER(u.username) = LOWER(${username}) LIMIT 1
      `);
      if (!userRow.rows.length) return res.status(404).json({ message: "User tidak ditemukan" });
      const user = userRow.rows[0] as any;

      // Find next available seat (1–3)
      const takenRows = await db.execute(sql`
        SELECT seat_num FROM live_komal_seats WHERE stream_id = ${id}
      `);
      const taken = (takenRows.rows as any[]).map(r => r.seat_num as number);
      const nextSeat = [1, 2, 3].find(n => !taken.includes(n));
      if (!nextSeat) return res.status(409).json({ message: "Semua seat sudah penuh" });

      await db.execute(sql`
        INSERT INTO live_komal_seats (stream_id, seat_num, username, display_name, avatar_url, is_muted, joined_at)
        VALUES (${id}, ${nextSeat}, ${user.username}, ${user.display_name ?? null}, ${user.display_picture ?? null}, false, NOW())
        ON CONFLICT (stream_id, seat_num) DO UPDATE
          SET username    = EXCLUDED.username,
              display_name= EXCLUDED.display_name,
              avatar_url  = EXCLUDED.avatar_url,
              is_muted    = false,
              joined_at   = NOW()
      `);

      const seats = await getKomalSeats(id);
      broadcastToRoom(`livesolo-${id}`, {
        type:     "KOMAL_UPDATE",
        streamId: id,
        seats,
        event:    "JOIN",
        seatNum:  nextSeat,
        username: user.username,
      });
      broadcastToRoom(`livesolo-${id}`, {
        type:     "KOMAL_HAND_RAISE_APPROVED",
        streamId: id,
        username: user.username,
        seatNum:  nextSeat,
      });
      res.json({ ok: true, seatNum: nextSeat, seats });
    } catch (err) {
      console.error("[komal/raise-hand/approve] error:", err);
      res.status(500).json({ message: "Gagal approve" });
    }
  });

  // ── POST /api/live/streams/:id/komal/raise-hand/reject ───────────────────
  // Host only — reject a hand raise request
  app.post("/api/live/streams/:id/komal/raise-hand/reject", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    const { username } = req.body as { username?: string };
    if (!username) return res.status(400).json({ message: "username diperlukan" });

    try {
      const streamRow = await db.execute(sql`
        SELECT host_user_id FROM live_streams WHERE id = ${id} LIMIT 1
      `);
      if (!streamRow.rows.length) return res.status(404).json({ message: "Stream tidak ditemukan" });
      if ((streamRow.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa reject" });

      broadcastToRoom(`livesolo-${id}`, {
        type:     "KOMAL_HAND_RAISE_REJECTED",
        streamId: id,
        username,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[komal/raise-hand/reject] error:", err);
      res.status(500).json({ message: "Gagal reject" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PK BATTLE ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  async function ensurePKTable() {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pk_battles (
        id SERIAL PRIMARY KEY,
        challenger_stream_id TEXT NOT NULL,
        opponent_stream_id   TEXT NOT NULL,
        challenger_user_id   INTEGER,
        opponent_user_id     INTEGER,
        challenger_username  TEXT,
        opponent_username    TEXT,
        challenger_display_name TEXT,
        opponent_display_name   TEXT,
        challenger_avatar    TEXT,
        opponent_avatar      TEXT,
        status               TEXT DEFAULT 'pending',
        challenger_score     INTEGER DEFAULT 0,
        opponent_score       INTEGER DEFAULT 0,
        duration_seconds     INTEGER DEFAULT 300,
        winner               TEXT,
        started_at           TIMESTAMPTZ,
        ended_at             TIMESTAMPTZ,
        created_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  // ── GET /api/live/streams/:id/pk/state ──────────────────────────────────────
  app.get("/api/live/streams/:id/pk/state", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await ensurePKTable();
      const row = await db.execute(sql`
        SELECT * FROM pk_battles
        WHERE (challenger_stream_id = ${id} OR opponent_stream_id = ${id})
          AND status IN ('pending','active')
        ORDER BY created_at DESC LIMIT 1
      `);
      if (!row.rows.length) return res.json({ active: false });
      const pk = row.rows[0] as any;
      res.json({ active: pk.status === 'active', pending: pk.status === 'pending', battle: pk });
    } catch (err) {
      console.error("[pk/state]", err);
      res.status(500).json({ message: "Error" });
    }
  });

  // ── POST /api/live/streams/:id/pk/challenge ──────────────────────────────────
  app.post("/api/live/streams/:id/pk/challenge", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    const { opponentStreamId } = req.body as { opponentStreamId?: string };
    if (!opponentStreamId) return res.status(400).json({ message: "opponentStreamId diperlukan" });
    if (opponentStreamId === id) return res.status(400).json({ message: "Tidak bisa tantang diri sendiri" });

    try {
      await ensurePKTable();
      // Check no existing active/pending PK for either stream
      const existing = await db.execute(sql`
        SELECT id FROM pk_battles
        WHERE status IN ('pending','active')
          AND (challenger_stream_id IN (${id},${opponentStreamId}) OR opponent_stream_id IN (${id},${opponentStreamId}))
        LIMIT 1
      `);
      if (existing.rows.length > 0) return res.status(409).json({ message: "Salah satu stream sudah dalam PK" });

      // Get challenger info
      const challengerRow = await db.execute(sql`
        SELECT ls.id, ls.host_user_id, u.username, u.display_name, up.display_picture
        FROM live_streams ls
        JOIN users u ON u.id = ls.host_user_id
        LEFT JOIN user_profiles up ON up.user_id = ls.host_user_id
        WHERE ls.id = ${id} AND ls.status = 'live' LIMIT 1
      `);
      if (!challengerRow.rows.length) return res.status(404).json({ message: "Stream tidak ditemukan atau tidak live" });
      if ((challengerRow.rows[0] as any).host_user_id !== req.session.userId)
        return res.status(403).json({ message: "Hanya host yang bisa challenge PK" });
      const ch = challengerRow.rows[0] as any;

      // Get opponent info
      const opponentRow = await db.execute(sql`
        SELECT ls.id, ls.host_user_id, u.username, u.display_name, up.display_picture
        FROM live_streams ls
        JOIN users u ON u.id = ls.host_user_id
        LEFT JOIN user_profiles up ON up.user_id = ls.host_user_id
        WHERE ls.id = ${opponentStreamId} AND ls.status = 'live' LIMIT 1
      `);
      if (!opponentRow.rows.length) return res.status(404).json({ message: "Stream lawan tidak ditemukan" });
      const op = opponentRow.rows[0] as any;

      const inserted = await db.execute(sql`
        INSERT INTO pk_battles
          (challenger_stream_id, opponent_stream_id, challenger_user_id, opponent_user_id,
           challenger_username, opponent_username, challenger_display_name, opponent_display_name,
           challenger_avatar, opponent_avatar, status)
        VALUES (${id}, ${opponentStreamId}, ${ch.host_user_id}, ${op.host_user_id},
                ${ch.username}, ${op.username}, ${ch.display_name ?? null}, ${op.display_name ?? null},
                ${ch.display_picture ?? null}, ${op.display_picture ?? null}, 'pending')
        RETURNING id
      `);
      const battleId = Number((inserted.rows[0] as any).id);

      broadcastToRoom(`livesolo-${opponentStreamId}`, {
        type: "PK_CHALLENGE_RECEIVED", battleId,
        challengerStreamId: id,
        challengerUsername: ch.username,
        challengerDisplayName: ch.display_name ?? null,
        challengerAvatar: ch.display_picture ?? null,
      } as any);

      res.json({ ok: true, battleId });
    } catch (err) {
      console.error("[pk/challenge]", err);
      res.status(500).json({ message: "Gagal kirim tantangan PK" });
    }
  });

  // ── POST /api/live/streams/:id/pk/accept ─────────────────────────────────────
  app.post("/api/live/streams/:id/pk/accept", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    const { battleId } = req.body as { battleId?: number };
    if (!battleId) return res.status(400).json({ message: "battleId diperlukan" });

    try {
      await ensurePKTable();
      const pkRow = await db.execute(sql`
        SELECT * FROM pk_battles WHERE id = ${battleId} AND opponent_stream_id = ${id} AND status = 'pending' LIMIT 1
      `);
      if (!pkRow.rows.length) return res.status(404).json({ message: "Battle tidak ditemukan" });
      const pk = pkRow.rows[0] as any;

      const endAt = new Date(Date.now() + pk.duration_seconds * 1000).toISOString();
      await db.execute(sql`
        UPDATE pk_battles SET status = 'active', started_at = NOW() WHERE id = ${battleId}
      `);

      const payload = {
        type: "PK_STARTED", battleId: Number(battleId),
        challengerStreamId: pk.challenger_stream_id,
        opponentStreamId:   pk.opponent_stream_id,
        challengerUsername: pk.challenger_username,
        opponentUsername:   pk.opponent_username,
        challengerDisplayName: pk.challenger_display_name,
        opponentDisplayName:   pk.opponent_display_name,
        challengerAvatar:   pk.challenger_avatar,
        opponentAvatar:     pk.opponent_avatar,
        durationSeconds:    Number(pk.duration_seconds),
        endAt,
        challengerScore:    0,
        opponentScore:      0,
      };
      broadcastToRoom(`livesolo-${pk.challenger_stream_id}`, payload as any);
      broadcastToRoom(`livesolo-${pk.opponent_stream_id}`, payload as any);

      // Start auto-end timer
      const tid = setTimeout(() => endPKBattle(Number(battleId)), Number(pk.duration_seconds) * 1000);
      pkTimers.set(Number(battleId), tid);

      res.json({ ok: true, battle: payload });
    } catch (err) {
      console.error("[pk/accept]", err);
      res.status(500).json({ message: "Gagal accept PK" });
    }
  });

  // ── POST /api/live/streams/:id/pk/decline ────────────────────────────────────
  app.post("/api/live/streams/:id/pk/decline", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    const { battleId } = req.body as { battleId?: number };
    if (!battleId) return res.status(400).json({ message: "battleId diperlukan" });

    try {
      await ensurePKTable();
      const pkRow = await db.execute(sql`
        SELECT challenger_stream_id FROM pk_battles
        WHERE id = ${battleId} AND opponent_stream_id = ${id} AND status = 'pending' LIMIT 1
      `);
      if (!pkRow.rows.length) return res.status(404).json({ message: "Battle tidak ditemukan" });
      const pk = pkRow.rows[0] as any;

      await db.execute(sql`UPDATE pk_battles SET status = 'declined', ended_at = NOW() WHERE id = ${battleId}`);
      broadcastToRoom(`livesolo-${pk.challenger_stream_id}`, { type: "PK_DECLINED", battleId: Number(battleId) } as any);
      res.json({ ok: true });
    } catch (err) {
      console.error("[pk/decline]", err);
      res.status(500).json({ message: "Gagal decline PK" });
    }
  });

  // ── POST /api/live/streams/:id/pk/cancel ─────────────────────────────────────
  app.post("/api/live/streams/:id/pk/cancel", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    const { id } = req.params;
    const { battleId } = req.body as { battleId?: number };
    if (!battleId) return res.status(400).json({ message: "battleId diperlukan" });

    try {
      await ensurePKTable();
      const pkRow = await db.execute(sql`
        SELECT opponent_stream_id FROM pk_battles
        WHERE id = ${battleId} AND challenger_stream_id = ${id} AND status = 'pending' LIMIT 1
      `);
      if (!pkRow.rows.length) return res.status(404).json({ message: "Battle tidak ditemukan" });
      const pk = pkRow.rows[0] as any;

      await db.execute(sql`UPDATE pk_battles SET status = 'cancelled', ended_at = NOW() WHERE id = ${battleId}`);
      broadcastToRoom(`livesolo-${pk.opponent_stream_id}`, { type: "PK_CANCELLED", battleId: Number(battleId) } as any);
      res.json({ ok: true });
    } catch (err) {
      console.error("[pk/cancel]", err);
      res.status(500).json({ message: "Gagal cancel PK" });
    }
  });

  // ── GET /api/live/pk/live-hosts — list hosts sedang live (untuk picker PK) ──
  app.get("/api/live/pk/live-hosts", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Login dulu" });
    try {
      const rows = await db.execute(sql`
        SELECT ls.id, u.username, u.display_name, up.display_picture,
               ls.total_viewers, ls.title
        FROM live_streams ls
        JOIN users u ON u.id = ls.host_user_id
        LEFT JOIN user_profiles up ON up.user_id = ls.host_user_id
        WHERE ls.status = 'live' AND ls.host_user_id != ${req.session.userId}
        ORDER BY ls.total_viewers DESC
        LIMIT 50
      `);
      res.json({
        hosts: rows.rows.map((r: any) => ({
          id:          String(r.id),
          username:    r.username,
          displayName: r.display_name ?? null,
          avatarUrl:   r.display_picture ?? null,
          viewerCount: Number(r.total_viewers ?? 0),
          title:       r.title ?? '',
        })),
      });
    } catch (err) {
      console.error("[pk/live-hosts]", err);
      res.status(500).json({ message: "Error" });
    }
  });
}
