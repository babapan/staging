import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";
import { uploadWithFallback } from "../imageUpload.js";
import { randomUUID } from "crypto";

const router = Router();
router.use(requireAdmin);

// GET /api/shop-frames — list all frames
router.get("/", async (_req, res) => {
  const frames = await db.execute(sql`
    SELECT id, name, image_url, category, price_1d, price_7d, price_30d,
           is_active, sort_order, frame_type, created_at
    FROM shop_frames
    ORDER BY sort_order ASC, created_at DESC
  `);
  res.json({ frames: frames.rows });
});

// GET /api/shop-frames/:id
router.get("/:id", async (req, res) => {
  const frame = await db.execute(sql`SELECT * FROM shop_frames WHERE id = ${req.params.id} LIMIT 1`);
  if (!frame.rows.length) return res.status(404).json({ error: "Frame tidak ditemukan" });
  res.json(frame.rows[0]);
});

// POST /api/shop-frames — create frame
router.post("/", async (req, res) => {
  const { name, category, price1d, price7d, price30d, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: "Nama frame wajib diisi" });

  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO shop_frames (id, name, image_url, category, price_1d, price_7d, price_30d, sort_order)
    VALUES (
      ${id}, ${name}, '', ${category || 'Bingkai'},
      ${parseInt(price1d || '880000')},
      ${parseInt(price7d || '5544000')},
      ${parseInt(price30d || '21120000')},
      ${parseInt(sortOrder || '0')}
    )
  `);
  res.json({ success: true, id });
});

// PATCH /api/shop-frames/:id — update frame
router.patch("/:id", async (req, res) => {
  const { name, category, price1d, price7d, price30d, sortOrder, isActive } = req.body;
  await db.execute(sql`
    UPDATE shop_frames
    SET name       = COALESCE(${name ?? null}, name),
        category   = COALESCE(${category ?? null}, category),
        price_1d   = COALESCE(${price1d != null ? parseInt(price1d) : null}, price_1d),
        price_7d   = COALESCE(${price7d != null ? parseInt(price7d) : null}, price_7d),
        price_30d  = COALESCE(${price30d != null ? parseInt(price30d) : null}, price_30d),
        sort_order = COALESCE(${sortOrder != null ? parseInt(sortOrder) : null}, sort_order),
        is_active  = COALESCE(${isActive != null ? isActive : null}, is_active),
        updated_at = NOW()
    WHERE id = ${req.params.id}
  `);
  res.json({ success: true });
});

// POST /api/shop-frames/:id/upload — upload frame image atau lottie JSON ke self-hosted storage
router.post("/:id/upload", async (req, res) => {
  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "base64 dan mimeType wajib diisi" });

  const frameId  = req.params.id;
  const isLottie = mimeType === "application/json";

  if (isLottie) {
    let jsonText: string;
    try {
      jsonText = Buffer.from(base64, "base64").toString("utf-8");
      JSON.parse(jsonText);
    } catch {
      return res.status(400).json({ error: "File JSON tidak valid" });
    }
    const lottieUrl = `/api/shop/frames/${frameId}/lottie`;
    await db.execute(sql`
      UPDATE shop_frames
      SET image_url   = ${lottieUrl},
          frame_type  = 'lottie',
          lottie_json = ${jsonText},
          updated_at  = NOW()
      WHERE id = ${frameId}
    `);
    return res.json({ success: true, imageUrl: lottieUrl, frameType: "lottie" });
  }

  const ext      = mimeType.split("/")[1] || "png";
  const imageKey = `shop_frame_${frameId}`;

  try {
    const { url: imageUrl } = await uploadWithFallback({
      base64Data: base64,
      mimeType,
      fileName:   `shop_frame_${frameId}.${ext}`,
      folder:     "/shop/frames/",
    });

    await db.execute(sql`
      UPDATE shop_frames
      SET image_url  = ${imageUrl},
          frame_type = 'image',
          updated_at = NOW()
      WHERE id = ${frameId}
    `);
    res.json({ success: true, imageUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload frame gagal" });
  }
});

// DELETE /api/shop-frames/:id
router.delete("/:id", async (req, res) => {
  await db.execute(sql`DELETE FROM shop_frames WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

export default router;
