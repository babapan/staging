import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";
import { uploadWithFallback } from "../imageUpload.js";

const router = Router();
router.use(requireAdmin);

// GET /api/stickers/packs — list all packs with sticker counts
router.get("/packs", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT ep.*, COUNT(e.id)::int AS sticker_count
      FROM emoticon_packs ep
      LEFT JOIN emoticons e ON e.emoticon_pack_id = ep.id
      GROUP BY ep.id
      ORDER BY ep.sort_order ASC NULLS LAST, ep.id ASC
    `);
    res.json({ packs: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stickers/packs/:id — get pack with stickers
router.get("/packs/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const pack = await db.execute(sql`SELECT * FROM emoticon_packs WHERE id = ${id} LIMIT 1`);
    if (!pack.rows.length) return res.status(404).json({ error: "Pack tidak ditemukan" });
    const stickers = await db.execute(sql`SELECT * FROM emoticons WHERE emoticon_pack_id = ${id} ORDER BY id ASC`);
    res.json({ pack: pack.rows[0], stickers: stickers.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stickers/packs — create pack
router.post("/packs", async (req, res) => {
  const { name, type, description, price, sortOrder, forSale, status } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Nama pack wajib diisi" });
  try {
    const result = await db.execute(sql`
      INSERT INTO emoticon_packs (name, type, description, price, sort_order, for_sale, status, version)
      VALUES (
        ${name.trim()},
        ${type !== undefined ? parseInt(type) : 1},
        ${description || null},
        ${price !== undefined ? parseFloat(price) : 0},
        ${sortOrder ? parseInt(sortOrder) : null},
        ${forSale !== undefined ? (forSale ? 1 : 0) : 1},
        ${status !== undefined ? parseInt(status) : 1},
        1
      )
      RETURNING *
    `);
    res.json({ success: true, pack: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/stickers/packs/:id — update pack
router.patch("/packs/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, type, description, price, sortOrder, forSale, status } = req.body;
  try {
    await db.execute(sql`
      UPDATE emoticon_packs SET
        name        = COALESCE(${name?.trim() || null}, name),
        type        = COALESCE(${type !== undefined ? parseInt(type) : null}, type),
        description = COALESCE(${description !== undefined ? (description || null) : null}, description),
        price       = COALESCE(${price !== undefined ? parseFloat(price) : null}, price),
        sort_order  = COALESCE(${sortOrder !== undefined ? parseInt(sortOrder) : null}, sort_order),
        for_sale    = COALESCE(${forSale !== undefined ? (forSale ? 1 : 0) : null}, for_sale),
        status      = COALESCE(${status !== undefined ? parseInt(status) : null}, status)
      WHERE id = ${id}
    `);
    const updated = await db.execute(sql`SELECT * FROM emoticon_packs WHERE id = ${id} LIMIT 1`);
    res.json({ success: true, pack: updated.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/stickers/packs/:id — delete pack and all its stickers
router.delete("/packs/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.execute(sql`DELETE FROM emoticons WHERE emoticon_pack_id = ${id}`);
    await db.execute(sql`DELETE FROM emoticon_packs WHERE id = ${id}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stickers/emoticons — create sticker
router.post("/emoticons", async (req, res) => {
  const { emoticonPackId, alias, type } = req.body;
  if (!emoticonPackId || !alias?.trim()) return res.status(400).json({ error: "Pack ID dan alias wajib diisi" });
  try {
    const result = await db.execute(sql`
      INSERT INTO emoticons (emoticon_pack_id, type, alias, width, height, location, location_png)
      VALUES (${parseInt(emoticonPackId)}, ${type !== undefined ? parseInt(type) : 0}, ${alias.trim()}, 0, 0, '', '')
      RETURNING *
    `);
    res.json({ success: true, sticker: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/stickers/emoticons/:id — update sticker (or clear image)
router.patch("/emoticons/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { alias, type, clearImage } = req.body;
  try {
    if (clearImage) {
      await db.execute(sql`UPDATE emoticons SET location_png = '', location = '' WHERE id = ${id}`);
    } else {
      await db.execute(sql`
        UPDATE emoticons SET
          alias = COALESCE(${alias?.trim() || null}, alias),
          type  = COALESCE(${type !== undefined ? parseInt(type) : null}, type)
        WHERE id = ${id}
      `);
    }
    const updated = await db.execute(sql`SELECT * FROM emoticons WHERE id = ${id} LIMIT 1`);
    res.json({ success: true, sticker: updated.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/stickers/emoticons/:id — delete sticker
router.delete("/emoticons/:id", async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM emoticons WHERE id = ${parseInt(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stickers/emoticons/:id/upload — upload sticker image ke self-hosted storage
router.post("/emoticons/:id/upload", async (req, res) => {
  const id = parseInt(req.params.id);
  const { base64Data, mimeType } = req.body;
  if (!base64Data) return res.status(400).json({ error: "Data gambar wajib diisi" });

  const sizeInBytes = Math.round(base64Data.length * 0.75);
  if (sizeInBytes > 5 * 1024 * 1024) return res.status(413).json({ error: "Gambar terlalu besar. Maksimal 5MB." });

  const sticker = await db.execute(sql`SELECT * FROM emoticons WHERE id = ${id} LIMIT 1`);
  if (!sticker.rows.length) return res.status(404).json({ error: "Stiker tidak ditemukan" });
  const s = sticker.rows[0] as any;

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  };
  const ext      = extMap[mimeType] ?? "png";
  const safeName = String(s.alias).replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    const { url: imageUrl } = await uploadWithFallback({
      base64Data,
      mimeType:  mimeType ?? "image/png",
      fileName:  `sticker_${s.emoticon_pack_id}_${safeName}.${ext}`,
      folder:    `/migme/stickers/pack_${s.emoticon_pack_id}`,
    });

    await db.execute(sql`
      UPDATE emoticons SET location_png = ${imageUrl}, location = ${imageUrl} WHERE id = ${id}
    `);
    res.json({ success: true, imageUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload gambar gagal" });
  }
});

export default router;
