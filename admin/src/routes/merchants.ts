import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const { page = "1", limit = "20", search = "" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const searchClause = search
    ? sql`AND (m.username ILIKE ${"%" + search + "%"} OR m.display_name ILIKE ${"%" + search + "%"})`
    : sql``;

  const merchants = await db.execute(sql`
    SELECT id, username, display_name, description, category, logo_url, website_url,
           status, username_color, username_color_type, merchant_type, mentor,
           referrer, total_points, created_at
    FROM merchants m
    WHERE 1=1 ${searchClause}
    ORDER BY total_points DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  const count = await db.execute(sql`
    SELECT COUNT(*) as total FROM merchants m WHERE 1=1 ${searchClause}
  `);

  res.json({
    merchants: merchants.rows,
    total: parseInt((count.rows[0] as any).total),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

router.post("/", async (req, res) => {
  const { username, displayName, merchantType, description, category, websiteUrl, usernameColor, mentor, referrer } = req.body;
  if (!username || !displayName) {
    return res.status(400).json({ error: "Username dan Display Name wajib diisi" });
  }
  try {
    const existing = await db.execute(sql`SELECT id FROM merchants WHERE username = ${username}`);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Username merchant sudah terdaftar" });
    }
    const result = await db.execute(sql`
      INSERT INTO merchants (username, display_name, merchant_type, description, category, website_url, username_color, mentor, referrer, status)
      VALUES (
        ${username},
        ${displayName},
        ${merchantType || 1},
        ${description || null},
        ${category || null},
        ${websiteUrl || null},
        ${usernameColor || '#990099'},
        ${mentor || null},
        ${referrer || null},
        1
      )
      RETURNING id, username, display_name
    `);
    res.json({ success: true, merchant: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menambahkan merchant" });
  }
});

router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  await db.execute(sql`UPDATE merchants SET status = ${status} WHERE id = ${id}`);
  res.json({ success: true });
});

router.get("/tags", async (req, res) => {
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const tags = await db.execute(sql`
    SELECT id, merchant_username, tagged_username, type, expiry, status, amount, currency, created_at
    FROM merchant_tags
    ORDER BY created_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  const count = await db.execute(sql`SELECT COUNT(*) as total FROM merchant_tags`);

  res.json({
    tags: tags.rows,
    total: parseInt((count.rows[0] as any).total),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

export default router;
