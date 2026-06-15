import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";
import { uploadFile } from "../imageUpload.js";

const router = Router();
router.use(requireAdmin);

let initialized = false;
async function ensureTable(): Promise<void> {
  if (initialized) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS home_banners (
      id          SERIAL PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT '',
      image_url   TEXT NOT NULL,
      link_url    TEXT NOT NULL DEFAULT '',
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  initialized = true;
}

// GET /api/banners — list all
router.get("/", async (_req, res) => {
  try {
    await ensureTable();
    const result = await db.execute(sql`
      SELECT * FROM home_banners ORDER BY sort_order ASC, created_at ASC
    `);
    res.json({ banners: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal memuat banner" });
  }
});

// POST /api/banners/upload-image — upload image ke self-hosted storage
router.post("/upload-image", async (req, res) => {
  const { base64Data, mimeType, fileName: rawName } = req.body ?? {};
  if (!base64Data) return res.status(400).json({ error: "base64Data wajib diisi" });

  const sizeBytes = Math.round(base64Data.length * 0.75);
  if (sizeBytes > 5 * 1024 * 1024) {
    return res.status(413).json({ error: "Gambar terlalu besar. Maksimal 5MB." });
  }

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png",
    "image/gif": "gif",  "image/webp": "webp",
  };
  const ext      = extMap[mimeType ?? ""] ?? "png";
  const ts       = Date.now();
  const fileName = rawName ? String(rawName).replace(/[^a-zA-Z0-9._-]/g, "_") : `banner_${ts}.${ext}`;

  try {
    const { url } = await uploadFile({
      base64Data,
      mimeType: mimeType ?? "image/png",
      fileName,
      subfolder: "banners",
    });
    res.json({ imageUrl: url });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload gambar gagal" });
  }
});

// POST /api/banners — create
router.post("/", async (req, res) => {
  try {
    await ensureTable();
    const { title, image_url, link_url, is_active, sort_order } = req.body ?? {};
    if (!image_url) return res.status(400).json({ error: "image_url wajib diisi" });
    const result = await db.execute(sql`
      INSERT INTO home_banners (title, image_url, link_url, is_active, sort_order)
      VALUES (
        ${String(title || '')},
        ${String(image_url)},
        ${String(link_url || '')},
        ${is_active !== false},
        ${Number(sort_order) || 0}
      )
      RETURNING *
    `);
    res.json({ banner: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal membuat banner" });
  }
});

// PATCH /api/banners/:id — update fields
router.patch("/:id", async (req, res) => {
  try {
    await ensureTable();
    const id   = parseInt(req.params.id, 10);
    const body = req.body ?? {};

    if (body.is_active  !== undefined) await db.execute(sql`UPDATE home_banners SET is_active  = ${Boolean(body.is_active)}  WHERE id = ${id}`);
    if (body.title      !== undefined) await db.execute(sql`UPDATE home_banners SET title      = ${String(body.title)}       WHERE id = ${id}`);
    if (body.image_url  !== undefined) await db.execute(sql`UPDATE home_banners SET image_url  = ${String(body.image_url)}   WHERE id = ${id}`);
    if (body.link_url   !== undefined) await db.execute(sql`UPDATE home_banners SET link_url   = ${String(body.link_url)}    WHERE id = ${id}`);
    if (body.sort_order !== undefined) await db.execute(sql`UPDATE home_banners SET sort_order = ${Number(body.sort_order)}  WHERE id = ${id}`);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal update banner" });
  }
});

// DELETE /api/banners/:id
router.delete("/:id", async (req, res) => {
  try {
    await ensureTable();
    const id = parseInt(req.params.id, 10);
    await db.execute(sql`DELETE FROM home_banners WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal hapus banner" });
  }
});

export default router;
