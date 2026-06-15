import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";
import { uploadWithFallback } from "../imageUpload.js";
import { randomUUID } from "crypto";

const router = Router();
router.use(requireAdmin);

// GET /api/shop-entry-effects — list all effects
router.get("/", async (_req, res) => {
  const effects = await db.execute(sql`
    SELECT id, name, lottie_url, price_1d, price_7d, price_30d,
           is_active, sort_order, created_at
    FROM shop_entry_effects
    ORDER BY sort_order ASC, created_at DESC
  `);
  res.json({ effects: effects.rows });
});

// GET /api/shop-entry-effects/:id
router.get("/:id", async (req, res) => {
  const effect = await db.execute(sql`SELECT * FROM shop_entry_effects WHERE id = ${req.params.id} LIMIT 1`);
  if (!effect.rows.length) return res.status(404).json({ error: "Efek tidak ditemukan" });
  res.json(effect.rows[0]);
});

// POST /api/shop-entry-effects — create effect
router.post("/", async (req, res) => {
  const { name, price1d, price7d, price30d, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: "Nama efek wajib diisi" });

  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO shop_entry_effects (id, name, lottie_url, price_1d, price_7d, price_30d, sort_order)
    VALUES (
      ${id}, ${name}, '',
      ${parseInt(price1d || '880000')},
      ${parseInt(price7d || '5544000')},
      ${parseInt(price30d || '21120000')},
      ${parseInt(sortOrder || '0')}
    )
  `);
  res.json({ success: true, id });
});

// PATCH /api/shop-entry-effects/:id — update effect
router.patch("/:id", async (req, res) => {
  const { name, price1d, price7d, price30d, sortOrder, isActive } = req.body;
  await db.execute(sql`
    UPDATE shop_entry_effects
    SET name       = COALESCE(${name ?? null}, name),
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

// POST /api/shop-entry-effects/:id/upload — upload Lottie JSON
router.post("/:id/upload", async (req, res) => {
  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "base64 dan mimeType wajib diisi" });

  const effectId = req.params.id;
  const isLottie = mimeType === "application/json";

  if (isLottie) {
    let jsonText: string;
    try {
      jsonText = Buffer.from(base64, "base64").toString("utf-8");
      JSON.parse(jsonText);
    } catch {
      return res.status(400).json({ error: "File JSON tidak valid" });
    }
    const lottieUrl = `/api/shop/entry-effects/${effectId}/lottie`;
    await db.execute(sql`
      UPDATE shop_entry_effects
      SET lottie_url  = ${lottieUrl},
          lottie_json = ${jsonText},
          updated_at  = NOW()
      WHERE id = ${effectId}
    `);
    return res.json({ success: true, lottieUrl });
  }

  // image fallback (PNG preview thumbnail)
  const ext = mimeType.split("/")[1] || "png";
  try {
    const { url: imageUrl } = await uploadWithFallback({
      base64Data: base64,
      mimeType,
      fileName: `entry_effect_${effectId}.${ext}`,
      folder: "/shop/entry-effects/",
    });
    await db.execute(sql`
      UPDATE shop_entry_effects
      SET lottie_url = ${imageUrl},
          updated_at = NOW()
      WHERE id = ${effectId}
    `);
    res.json({ success: true, lottieUrl: imageUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload gagal" });
  }
});

// DELETE /api/shop-entry-effects/:id
router.delete("/:id", async (req, res) => {
  await db.execute(sql`DELETE FROM shop_entry_effects WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

export default router;
