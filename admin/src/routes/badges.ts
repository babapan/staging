import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";
import { uploadWithFallback } from "../imageUpload.js";

const router = Router();
router.use(requireAdmin);

const VALID_KINDS = ["game_win", "gift_sender", "gift_received", "top_level", "event_champion"];

// GET /api/badges — list all badges
router.get("/", async (_req, res) => {
  const result = await db.execute(sql`
    SELECT id, name, description, icon_url, avatar_frame_url,
           slot_kind, slot_game_type, slot_rank, slot_period
    FROM badges
    ORDER BY slot_kind NULLS LAST, slot_game_type NULLS LAST, slot_rank NULLS LAST, id ASC
  `);
  res.json({ badges: result.rows });
});

// POST /api/badges — create badge
router.post("/", async (req, res) => {
  const { name, description, slotKind, slotGameType, slotRank, slotPeriod } = req.body;
  if (!name) return res.status(400).json({ error: "Nama badge wajib diisi" });

  const kind = slotKind || null;
  let gameType: string | null = null;
  let rank: number | null = null;
  let period: string | null = null;

  if (kind) {
    if (!VALID_KINDS.includes(kind)) {
      return res.status(400).json({ error: `Slot kind tidak valid` });
    }
    if (kind !== "event_champion") {
      rank = parseInt(slotRank);
      if (![1, 2, 3].includes(rank)) {
        return res.status(400).json({ error: "Slot rank harus 1, 2, atau 3" });
      }
      period = String(slotPeriod || "ALL_TIME").toUpperCase();
      if (!["DAILY", "WEEKLY", "ALL_TIME"].includes(period)) {
        return res.status(400).json({ error: "Slot period harus DAILY/WEEKLY/ALL_TIME" });
      }
      if (kind === "game_win") {
        gameType = String(slotGameType || "").trim().toLowerCase() || null;
        if (!gameType) return res.status(400).json({ error: "Game type wajib untuk slot game_win" });
      }
    } else {
      rank = slotRank ? parseInt(slotRank) : null;
      gameType = String(slotGameType || "").trim() || null;
      period = null;
    }
  }

  try {
    const result = await db.execute(sql`
      INSERT INTO badges (name, description, slot_kind, slot_game_type, slot_rank, slot_period)
      VALUES (${name}, ${description || ""}, ${kind}, ${gameType}, ${rank}, ${period})
      RETURNING *
    `);
    res.json({ success: true, badge: result.rows[0] });
  } catch (e: any) {
    if (e.message?.includes("badges_slot_unique") || e.message?.includes("duplicate")) {
      return res.status(400).json({ error: "Slot ini sudah dipakai badge lain" });
    }
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/badges/:id — update badge metadata + slot + avatarFrameUrl
router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, slotKind, slotGameType, slotRank, slotPeriod, avatarFrameUrl } = req.body;

  const kind = slotKind === "" || slotKind === null ? null : (slotKind || undefined);
  let gameType: string | null | undefined = undefined;
  let rank: number | null | undefined = undefined;
  let period: string | null | undefined = undefined;

  if (kind === null) {
    gameType = null; rank = null; period = null;
  } else if (kind !== undefined) {
    if (!VALID_KINDS.includes(kind)) {
      return res.status(400).json({ error: `Slot kind tidak valid` });
    }
    if (kind === "event_champion") {
      rank = slotRank ? parseInt(slotRank) : null;
      gameType = String(slotGameType || "").trim() || null;
      period = null;
    } else {
      rank = parseInt(slotRank);
      if (![1, 2, 3].includes(rank)) {
        return res.status(400).json({ error: "Slot rank harus 1, 2, atau 3" });
      }
      period = String(slotPeriod || "ALL_TIME").toUpperCase();
      gameType = kind === "game_win"
        ? (String(slotGameType || "").trim().toLowerCase() || null)
        : null;
      if (kind === "game_win" && !gameType) {
        return res.status(400).json({ error: "Game type wajib untuk slot game_win" });
      }
    }
  }

  const frameUrl: string | null | undefined =
    avatarFrameUrl === null ? null :
    avatarFrameUrl !== undefined ? String(avatarFrameUrl) :
    undefined;

  try {
    await db.execute(sql`
      UPDATE badges SET
        name        = COALESCE(${name        ?? null}, name),
        description = COALESCE(${description ?? null}, description),
        slot_kind      = ${kind     === undefined ? sql`slot_kind`      : kind},
        slot_game_type = ${gameType === undefined ? sql`slot_game_type` : gameType},
        slot_rank      = ${rank     === undefined ? sql`slot_rank`      : rank},
        slot_period    = ${period   === undefined ? sql`slot_period`    : period},
        avatar_frame_url = ${frameUrl === undefined ? sql`avatar_frame_url` : frameUrl}
      WHERE id = ${id}
    `);
    const updated = await db.execute(sql`SELECT * FROM badges WHERE id = ${id} LIMIT 1`);
    res.json({ success: true, badge: updated.rows[0] });
  } catch (e: any) {
    if (e.message?.includes("badges_slot_unique") || e.message?.includes("duplicate")) {
      return res.status(400).json({ error: "Slot ini sudah dipakai badge lain" });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/badges/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.execute(sql`DELETE FROM badges_rewarded WHERE badge_id = ${id}`);
  await db.execute(sql`DELETE FROM badges WHERE id = ${id}`);
  res.json({ success: true });
});

// ─── Manual badge awards ──────────────────────────────────────────────────────

router.get("/:id/awards", async (req, res) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "ID badge tidak valid" });
  const rows = await db.execute(sql`
    SELECT id, username, created_at
    FROM badges_rewarded
    WHERE badge_id = ${id}
    ORDER BY created_at DESC
  `);
  res.json({ awards: rows.rows });
});

router.post("/:id/award", async (req, res) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "ID badge tidak valid" });
  const username = String(req.body?.username || "").trim();
  if (!username) return res.status(400).json({ error: "Username wajib diisi" });

  const badgeRow = await db.execute(sql`SELECT id, name FROM badges WHERE id = ${id} LIMIT 1`);
  if (!badgeRow.rows.length) return res.status(404).json({ error: "Badge tidak ditemukan" });

  const userRow = await db.execute(sql`SELECT id, username FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1`);
  if (!userRow.rows.length) return res.status(404).json({ error: `User '${username}' tidak ditemukan` });
  const realUsername = (userRow.rows[0] as any).username as string;

  const existing = await db.execute(sql`
    SELECT id FROM badges_rewarded
    WHERE badge_id = ${id} AND LOWER(username) = LOWER(${realUsername})
    LIMIT 1
  `);
  if (existing.rows.length) {
    return res.status(409).json({ error: `${realUsername} sudah memiliki badge ini` });
  }

  await db.execute(sql`
    INSERT INTO badges_rewarded (username, badge_id, created_at)
    VALUES (${realUsername}, ${id}, NOW())
  `);
  res.json({ success: true, username: realUsername, badgeId: id });
});

router.delete("/:id/award/:username", async (req, res) => {
  const id = parseInt(req.params.id);
  const username = String(req.params.username || "").trim();
  if (Number.isNaN(id) || !username) {
    return res.status(400).json({ error: "Parameter tidak valid" });
  }
  await db.execute(sql`
    DELETE FROM badges_rewarded
    WHERE badge_id = ${id} AND LOWER(username) = LOWER(${username})
  `);
  res.json({ success: true });
});

// POST /api/badges/:id/upload — upload badge icon ke self-hosted storage
router.post("/:id/upload", async (req, res) => {
  const id = parseInt(req.params.id);
  const { base64Data, mimeType } = req.body;
  if (!base64Data) return res.status(400).json({ error: "Data gambar wajib diisi" });

  const row = await db.execute(sql`SELECT * FROM badges WHERE id = ${id} LIMIT 1`);
  if (!row.rows.length) return res.status(404).json({ error: "Badge tidak ditemukan" });
  const b = row.rows[0] as any;

  const sizeBytes = Math.round(base64Data.length * 0.75);
  if (sizeBytes > 5 * 1024 * 1024) {
    return res.status(413).json({ error: "Gambar terlalu besar. Maksimal 5MB." });
  }

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  };
  const ext      = extMap[mimeType] ?? "png";
  const safeName = String(b.name).replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    const { url: imageUrl } = await uploadWithFallback({
      base64Data,
      mimeType:  mimeType ?? "image/png",
      fileName:  `badge_${safeName}.${ext}`,
      folder:    "/migme/badges",
    });
    await db.execute(sql`UPDATE badges SET icon_url = ${imageUrl} WHERE id = ${id}`);
    res.json({ success: true, imageUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload gambar gagal" });
  }
});

// POST /api/badges/:id/upload-frame — upload avatar frame PNG ke self-hosted storage
router.post("/:id/upload-frame", async (req, res) => {
  const id = parseInt(req.params.id);
  const { base64Data, mimeType } = req.body;
  if (!base64Data) return res.status(400).json({ error: "Data frame wajib diisi" });

  const row = await db.execute(sql`SELECT * FROM badges WHERE id = ${id} LIMIT 1`);
  if (!row.rows.length) return res.status(404).json({ error: "Badge tidak ditemukan" });
  const b = row.rows[0] as any;

  const sizeBytes = Math.round(base64Data.length * 0.75);
  if (sizeBytes > 5 * 1024 * 1024) {
    return res.status(413).json({ error: "Frame terlalu besar. Maksimal 5MB." });
  }

  const safeName = String(b.name).replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    const { url: frameUrl } = await uploadWithFallback({
      base64Data,
      mimeType:  mimeType ?? "image/png",
      fileName:  `frame_${safeName}.png`,
      folder:    "/migme/frames",
    });
    await db.execute(sql`UPDATE badges SET avatar_frame_url = ${frameUrl} WHERE id = ${id}`);
    res.json({ success: true, frameUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload frame gagal" });
  }
});

// GET /api/badges/games — list game types
router.get("/games/list", async (_req, res) => {
  res.json({
    games: [
      { value: "lowcard",  label: "LowCard" },
      { value: "dice",     label: "Dice" },
      { value: "cricket",  label: "Cricket" },
      { value: "football", label: "Football" },
      { value: "warriors", label: "Warriors" },
      { value: "pelakor",  label: "Pelakor (Tebak Hati)" },
    ],
  });
});

export default router;
