import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";
import { uploadWithFallback } from "../imageUpload.js";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";

const router = Router();
router.use(requireAdmin);

// ─── PARTY GIFTS ─────────────────────────────────────────────────────────────

// GET /api/party-gifts
router.get("/gifts", async (_req, res) => {
  const result = await db.execute(sql`
    SELECT id, name, emoji, price, category, image_url, lottie_url, video_url,
           is_active, is_premium, sort_order, created_at
    FROM party_gifts
    ORDER BY sort_order ASC, created_at ASC
  `);
  res.json({ gifts: result.rows });
});

// POST /api/party-gifts
router.post("/gifts", async (req, res) => {
  const { name, emoji, price, category, isPremium, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: "Nama gift wajib diisi" });
  try {
    const result = await db.execute(sql`
      INSERT INTO party_gifts (name, emoji, price, category, is_premium, sort_order)
      VALUES (
        ${name},
        ${emoji || "🎁"},
        ${parseFloat(price) || 0},
        ${category || "Populer"},
        ${!!isPremium},
        ${parseInt(sortOrder) || 99}
      )
      RETURNING *
    `);
    res.json({ success: true, gift: result.rows[0] });
  } catch (e: any) {
    if (e.message?.includes("unique") || e.message?.includes("duplicate")) {
      return res.status(400).json({ error: "Nama gift sudah ada" });
    }
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/party-gifts/:id
router.patch("/gifts/:id", async (req, res) => {
  const { name, emoji, price, category, isPremium, sortOrder, isActive } = req.body;
  const id = req.params.id;
  try {
    await db.execute(sql`
      UPDATE party_gifts SET
        name       = COALESCE(${name || null}, name),
        emoji      = COALESCE(${emoji || null}, emoji),
        price      = COALESCE(${price !== undefined ? parseFloat(price) : null}, price),
        category   = COALESCE(${category || null}, category),
        is_premium = COALESCE(${isPremium !== undefined ? !!isPremium : null}, is_premium),
        sort_order = COALESCE(${sortOrder !== undefined ? parseInt(sortOrder) : null}, sort_order),
        is_active  = COALESCE(${isActive !== undefined ? !!isActive : null}, is_active)
      WHERE id = ${id}
    `);
    const updated = await db.execute(sql`SELECT * FROM party_gifts WHERE id = ${id} LIMIT 1`);
    res.json({ success: true, gift: updated.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/party-gifts/:id
router.delete("/gifts/:id", async (req, res) => {
  await db.execute(sql`DELETE FROM party_gifts WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

// POST /api/party-gifts/:id/upload-image — upload ke self-hosted storage
router.post("/gifts/:id/upload-image", async (req, res) => {
  const { base64Data, mimeType } = req.body;
  if (!base64Data) return res.status(400).json({ error: "Data gambar wajib diisi" });

  const sizeInBytes = Math.round(base64Data.length * 0.75);
  if (sizeInBytes > 5 * 1024 * 1024) {
    return res.status(413).json({ error: "Gambar terlalu besar. Maksimal 5MB." });
  }

  const gift = await db.execute(sql`SELECT * FROM party_gifts WHERE id = ${req.params.id} LIMIT 1`);
  if (!gift.rows.length) return res.status(404).json({ error: "Gift tidak ditemukan" });
  const g = gift.rows[0] as any;

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png",
    "image/gif": "gif", "image/webp": "webp",
  };
  const ext      = extMap[mimeType] ?? "png";
  const safeName = String(g.name).replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    const { url: imageUrl } = await uploadWithFallback({
      base64Data,
      mimeType:  mimeType ?? "image/png",
      fileName:  `party_gift_${safeName}.${ext}`,
      folder:    "/migme/party-gifts",
    });
    await db.execute(sql`UPDATE party_gifts SET image_url = ${imageUrl} WHERE id = ${req.params.id}`);
    res.json({ success: true, imageUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload gambar gagal" });
  }
});

// DELETE /api/party-gifts/:id/image
router.delete("/gifts/:id/image", async (req, res) => {
  await db.execute(sql`UPDATE party_gifts SET image_url = NULL WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

// POST /api/party-gifts/:id/upload-lottie — Lottie JSON ke self-hosted storage
router.post("/gifts/:id/upload-lottie", async (req, res) => {
  const { lottieJson } = req.body;
  if (!lottieJson) return res.status(400).json({ error: "Data Lottie JSON wajib diisi" });

  const gift = await db.execute(sql`SELECT id, name FROM party_gifts WHERE id = ${req.params.id} LIMIT 1`);
  if (!gift.rows.length) return res.status(404).json({ error: "Gift tidak ditemukan" });
  const g = gift.rows[0] as any;

  const jsonStr  = typeof lottieJson === "string" ? lottieJson : JSON.stringify(lottieJson);
  const safeName = String(g.name ?? g.id).replace(/[^a-zA-Z0-9_-]/g, "_");
  const base64   = Buffer.from(jsonStr).toString("base64");

  try {
    const { url: lottieUrl } = await uploadWithFallback({
      base64Data: base64,
      mimeType:   "application/json",
      fileName:   `party_gift_${safeName}.json`,
      folder:     "/migme/party-gifts/lottie",
    });
    await db.execute(sql`UPDATE party_gifts SET lottie_url = ${lottieUrl} WHERE id = ${req.params.id}`);
    res.json({ success: true, lottieUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload Lottie gagal" });
  }
});

// DELETE /api/party-gifts/:id/lottie
router.delete("/gifts/:id/lottie", async (req, res) => {
  await db.execute(sql`UPDATE party_gifts SET lottie_url = NULL WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

// POST /api/party-gifts/:id/upload-video — upload ke self-hosted storage
router.post("/gifts/:id/upload-video", async (req, res) => {
  const { base64Data, mimeType } = req.body;
  if (!base64Data) return res.status(400).json({ error: "Data video wajib diisi" });

  const sizeInBytes = Math.round(base64Data.length * 0.75);
  if (sizeInBytes > 20 * 1024 * 1024) {
    return res.status(413).json({ error: "Video terlalu besar. Maksimal 20MB." });
  }

  const gift = await db.execute(sql`SELECT * FROM party_gifts WHERE id = ${req.params.id} LIMIT 1`);
  if (!gift.rows.length) return res.status(404).json({ error: "Gift tidak ditemukan" });
  const g = gift.rows[0] as any;

  const extMap: Record<string, string> = {
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  };
  const ext      = extMap[mimeType] ?? "mp4";
  const safeName = String(g.name).replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    const { url: videoUrl } = await uploadWithFallback({
      base64Data,
      mimeType:  mimeType ?? "video/mp4",
      fileName:  `party_gift_video_${safeName}.${ext}`,
      folder:    "/migme/party-gifts/videos",
    });
    await db.execute(sql`UPDATE party_gifts SET video_url = ${videoUrl} WHERE id = ${req.params.id}`);
    res.json({ success: true, videoUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload video gagal" });
  }
});

// POST /api/party/gifts/:id/convert-video — FFmpeg chroma/color-key → transparent WebM VP9
router.post("/gifts/:id/convert-video", async (req, res) => {
  const {
    base64Data, mimeType,
    chromaColor = "#00ff00",
    similarity  = 0.3,
    blend       = 0.05,
    filterMode  = "chromakey",
  } = req.body;
  if (!base64Data) return res.status(400).json({ error: "Data video wajib diisi" });

  const sizeInBytes = Math.round((base64Data as string).length * 0.75);
  if (sizeInBytes > 50 * 1024 * 1024) {
    return res.status(413).json({ error: "Video terlalu besar. Maksimal 50MB." });
  }

  const gift = await db.execute(sql`SELECT * FROM party_gifts WHERE id = ${req.params.id} LIMIT 1`);
  if (!gift.rows.length) return res.status(404).json({ error: "Gift tidak ditemukan" });
  const g = gift.rows[0] as any;

  const ts     = Date.now();
  const tmpIn  = join(tmpdir(), `gift_in_${ts}.mp4`);
  const tmpOut = join(tmpdir(), `gift_out_${ts}.webm`);

  try {
    const buffer = Buffer.from(base64Data as string, "base64");
    await writeFile(tmpIn, buffer);

    const sim      = Math.min(0.9, Math.max(0.01, Number(similarity)));
    const blendVal = Math.min(0.3,  Math.max(0.0,  Number(blend)));
    const colorHex = String(chromaColor).replace("#", "0x");

    let vf: string;
    if (filterMode === "checkerboard") {
      const s1 = Math.min(0.9, sim);
      const s2 = Math.min(0.9, sim * 0.85);
      vf = [
        `colorkey=color=0x808080:similarity=${s1.toFixed(3)}:blend=${blendVal}`,
        `colorkey=color=0xcccccc:similarity=${(s2 * 0.7).toFixed(3)}:blend=${blendVal}`,
        `colorkey=color=0xffffff:similarity=${s2.toFixed(3)}:blend=${blendVal}`,
        `format=yuva420p`,
      ].join(",");
    } else {
      const mode = filterMode === "colorkey" ? "colorkey" : "chromakey";
      vf = `${mode}=color=${colorHex}:similarity=${sim.toFixed(3)}:blend=${blendVal},format=yuva420p`;
    }

    await new Promise<void>((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-i", tmpIn,
        "-vf", vf,
        "-c:v", "libvpx-vp9",
        "-auto-alt-ref", "0",
        "-b:v", "0",
        "-crf", "30",
        "-an",
        "-y", tmpOut,
      ]);
      let stderr = "";
      ff.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      ff.on("close", (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg error (code ${code}): ${stderr.slice(-600)}`));
      });
      ff.on("error", (err: Error) => reject(err));
    });

    const webmBuffer = await readFile(tmpOut);
    const webmBase64 = webmBuffer.toString("base64");
    const safeName   = String(g.name).replace(/[^a-zA-Z0-9_-]/g, "_");

    const { url: videoUrl } = await uploadWithFallback({
      base64Data: webmBase64,
      mimeType:   "video/webm",
      fileName:   `party_gift_video_${safeName}_transparent.webm`,
      folder:     "/migme/party-gifts/videos",
    });

    await db.execute(sql`UPDATE party_gifts SET video_url = ${videoUrl} WHERE id = ${req.params.id}`);
    res.json({ success: true, videoUrl });
  } catch (e: any) {
    console.error("[convert-video]", e);
    res.status(500).json({ error: e.message ?? "Konversi video gagal" });
  } finally {
    try { await unlink(tmpIn);  } catch {}
    try { await unlink(tmpOut); } catch {}
  }
});

// DELETE /api/party-gifts/:id/video
router.delete("/gifts/:id/video", async (req, res) => {
  await db.execute(sql`UPDATE party_gifts SET video_url = NULL WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

// ─── PARTY ROOMS ─────────────────────────────────────────────────────────────

// GET /api/party/rooms
router.get("/rooms", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT r.id, r.name, r.description, r.creator_username,
             r.color, r.max_seats, r.is_active, r.is_locked, r.created_at,
             COUNT(s.id) FILTER (WHERE s.user_id IS NOT NULL) AS occupied_seats,
             up.display_picture AS creator_avatar
      FROM party_rooms r
      LEFT JOIN party_seats s ON s.party_room_id = r.id
      LEFT JOIN user_profiles up ON up.user_id = r.creator_id
      GROUP BY r.id, up.display_picture
      ORDER BY r.created_at DESC
    `);
    res.json({ rooms: result.rows });
  } catch (err: any) {
    console.error("[admin/party/rooms] GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/party/rooms/:id
router.delete("/rooms/:id", async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM party_seats WHERE party_room_id = ${req.params.id}`);
    await db.execute(sql`DELETE FROM party_rooms WHERE id = ${req.params.id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/party/income/daily
router.get("/income/daily", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'Asia/Jakarta') AS tgl,
        COUNT(*)::int                                AS transaksi,
        COALESCE(SUM(coin_amount), 0)::bigint        AS total_coin,
        COALESCE(SUM(diamond_amount), 0)::bigint     AS total_diamond,
        COUNT(DISTINCT room_id)::int                 AS jumlah_room
      FROM party_income_log
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at AT TIME ZONE 'Asia/Jakarta')
      ORDER BY tgl DESC
    `);
    const summary = await db.execute(sql`
      SELECT
        COALESCE(SUM(coin_amount), 0)::bigint    AS total_coin_today,
        COALESCE(SUM(diamond_amount), 0)::bigint AS total_diamond_today
      FROM party_income_log
      WHERE created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta'
    `);
    res.json({ daily: rows.rows, today: summary.rows[0] ?? { total_coin_today: 0, total_diamond_today: 0 } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/party/income/rooms
router.get("/income/rooms", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        l.room_id,
        COALESCE(pr.name, l.room_id)             AS room_name,
        pr.creator_username,
        pr.is_active,
        COUNT(l.id)::int                          AS transaksi,
        COALESCE(SUM(l.coin_amount), 0)::bigint   AS total_coin,
        COALESCE(SUM(l.diamond_amount), 0)::bigint AS total_diamond,
        MAX(l.created_at)                         AS last_activity
      FROM party_income_log l
      LEFT JOIN party_rooms pr ON pr.id = l.room_id
      GROUP BY l.room_id, pr.name, pr.creator_username, pr.is_active
      ORDER BY total_coin DESC
      LIMIT 100
    `);
    res.json({ rooms: rows.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PARTY STICKERS ──────────────────────────────────────────────────────────

// GET /api/party/stickers
router.get("/stickers", async (_req, res) => {
  const result = await db.execute(sql`
    SELECT id, name, lottie_url, is_active, sort_order, created_at
    FROM party_stickers
    ORDER BY sort_order ASC, id ASC
  `);
  res.json({ stickers: result.rows });
});

// POST /api/party/stickers
router.post("/stickers", async (req, res) => {
  const { name, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: "Nama sticker wajib diisi" });
  try {
    const result = await db.execute(sql`
      INSERT INTO party_stickers (name, sort_order)
      VALUES (${name}, ${parseInt(sortOrder) || 99})
      RETURNING *
    `);
    res.json({ success: true, sticker: result.rows[0] });
  } catch (e: any) {
    if (e.message?.includes("unique") || e.message?.includes("duplicate")) {
      return res.status(400).json({ error: "Nama sticker sudah ada" });
    }
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/party/stickers/:id
router.patch("/stickers/:id", async (req, res) => {
  const { name, sortOrder, isActive } = req.body;
  try {
    await db.execute(sql`
      UPDATE party_stickers SET
        name       = COALESCE(${name || null}, name),
        sort_order = COALESCE(${sortOrder !== undefined ? parseInt(sortOrder) : null}, sort_order),
        is_active  = COALESCE(${isActive !== undefined ? !!isActive : null}, is_active)
      WHERE id = ${req.params.id}
    `);
    const updated = await db.execute(sql`SELECT * FROM party_stickers WHERE id = ${req.params.id} LIMIT 1`);
    res.json({ success: true, sticker: updated.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/party/stickers/:id
router.delete("/stickers/:id", async (req, res) => {
  await db.execute(sql`DELETE FROM party_stickers WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

// POST /api/party/stickers/:id/upload-lottie — upload ke self-hosted storage
router.post("/stickers/:id/upload-lottie", async (req, res) => {
  const { lottieJson } = req.body;
  if (!lottieJson) return res.status(400).json({ error: "Data Lottie JSON wajib diisi" });

  const sticker = await db.execute(sql`SELECT id, name FROM party_stickers WHERE id = ${req.params.id} LIMIT 1`);
  if (!sticker.rows.length) return res.status(404).json({ error: "Sticker tidak ditemukan" });
  const s = sticker.rows[0] as any;

  const jsonStr  = typeof lottieJson === "string" ? lottieJson : JSON.stringify(lottieJson);
  const safeName = String(s.name).replace(/[^a-zA-Z0-9_-]/g, "_");
  const base64   = Buffer.from(jsonStr).toString("base64");

  try {
    const { url: lottieUrl } = await uploadWithFallback({
      base64Data: base64,
      mimeType:   "application/json",
      fileName:   `party_sticker_${safeName}.json`,
      folder:     "/migme/party-stickers",
    });
    await db.execute(sql`UPDATE party_stickers SET lottie_url = ${lottieUrl} WHERE id = ${req.params.id}`);
    res.json({ success: true, lottieUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload Lottie gagal" });
  }
});

// DELETE /api/party/stickers/:id/lottie
router.delete("/stickers/:id/lottie", async (req, res) => {
  await db.execute(sql`UPDATE party_stickers SET lottie_url = NULL WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

// GET /api/party/livekit-status — proxy ke main backend (public endpoint)
router.get("/livekit-status", async (_req, res) => {
  const MAIN_APP_URL = process.env.MAIN_APP_URL || "http://localhost:5000";
  try {
    const r = await fetch(`${MAIN_APP_URL}/api/party/livekit-mode`);
    if (!r.ok) return res.status(r.status).json({ error: `Main backend error: ${r.status}` });
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(503).json({ error: `Tidak bisa reach main backend: ${e.message}` });
  }
});

// POST /api/party/livekit-switch — proxy ke main backend switch-provider
router.post("/livekit-switch", async (req, res) => {
  const MAIN_APP_URL = process.env.MAIN_APP_URL || "http://localhost:5000";
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "migme-internal-admin-2024";
  try {
    const r = await fetch(`${MAIN_APP_URL}/api/admin/party/switch-provider`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (e: any) {
    res.status(503).json({ error: `Tidak bisa reach main backend: ${e.message}` });
  }
});

// GET /api/party-stats
router.get("/stats", async (_req, res) => {
  const [totalGifts, activeGifts, premiumGifts, totalRooms, activeRooms, categories] = await Promise.all([
    db.execute(sql`SELECT COUNT(*) as count FROM party_gifts`),
    db.execute(sql`SELECT COUNT(*) as count FROM party_gifts WHERE is_active = true`),
    db.execute(sql`SELECT COUNT(*) as count FROM party_gifts WHERE is_premium = true`),
    db.execute(sql`SELECT COUNT(*) as count FROM party_rooms`),
    db.execute(sql`SELECT COUNT(*) as count FROM party_rooms WHERE is_active = true`),
    db.execute(sql`SELECT category, COUNT(*) as count FROM party_gifts GROUP BY category ORDER BY count DESC`),
  ]);
  res.json({
    totalGifts:   (totalGifts.rows[0] as any).count,
    activeGifts:  (activeGifts.rows[0] as any).count,
    premiumGifts: (premiumGifts.rows[0] as any).count,
    totalRooms:   (totalRooms.rows[0] as any).count,
    activeRooms:  (activeRooms.rows[0] as any).count,
    categories:   categories.rows,
  });
});

export default router;
