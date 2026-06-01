import { Router } from "express";
import { db, pool } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const { page = "1", limit = "20", search = "" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const searchClause = search
    ? sql`AND (c.name ILIKE ${"%" + search + "%"} OR c.description ILIKE ${"%" + search + "%"})`
    : sql``;

  const chatrooms = await db.execute(sql`
    SELECT c.id, c.name, c.description, c.category_id, c.current_participants,
           c.max_participants, c.color, c.language, c.allow_kick, c.adult_only,
           c.user_owned, c.type, c.status, c.created_by, c.created_at
    FROM chatrooms c
    WHERE 1=1 ${searchClause}
    ORDER BY c.created_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  const count = await db.execute(sql`
    SELECT COUNT(*) as total FROM chatrooms c WHERE 1=1 ${searchClause}
  `);

  res.json({
    chatrooms: chatrooms.rows,
    total: parseInt((count.rows[0] as any).total),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

router.post("/", async (req, res) => {
  try {
    const {
      name, description, category_id, max_participants,
      language, color, allow_kick, adult_only, user_owned, owner,
    } = req.body as Record<string, any>;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Nama room wajib diisi" });
    }
    if (!category_id) {
      return res.status(400).json({ error: "Kategori wajib dipilih" });
    }

    const safeName = String(name).trim();

    const existing = await pool.query(
      `SELECT id FROM chatrooms WHERE lower(name) = lower($1) LIMIT 1`,
      [safeName]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: `Room dengan nama "${safeName}" sudah ada` });
    }

    let ownerId: string | null = null;
    if (owner && String(owner).trim()) {
      const userRes = await pool.query(
        `SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1`,
        [String(owner).trim()]
      );
      if (!userRes.rows.length) {
        return res.status(404).json({ error: `User "${owner}" tidak ditemukan` });
      }
      ownerId = userRes.rows[0].id;
    }

    const result = await pool.query(
      `INSERT INTO chatrooms
         (id, name, description, category_id, max_participants, color, language,
          allow_kick, adult_only, user_owned, type, status, current_participants, created_by, created_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 1, 0, $10, NOW())
       RETURNING *`,
      [
        safeName,
        description ? String(description).trim() : null,
        parseInt(category_id),
        parseInt(max_participants) || 25,
        color || '#4CAF50',
        language || 'id',
        allow_kick !== false,
        adult_only === true || adult_only === 'true',
        user_owned === true || user_owned === 'true',
        ownerId,
      ]
    );

    res.json({ success: true, chatroom: result.rows[0], message: `Room "${safeName}" berhasil dibuat` });
  } catch (err) {
    console.error("[chatrooms] POST error:", err);
    res.status(500).json({ error: "Gagal membuat chatroom" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { max_participants, created_by, category_id } = req.body as Record<string, any>;

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (max_participants !== undefined) {
      setClauses.push(`max_participants = $${idx++}`);
      values.push(parseInt(max_participants));
    }
    if (category_id !== undefined) {
      setClauses.push(`category_id = $${idx++}`);
      values.push(parseInt(category_id));
    }
    if (created_by !== undefined) {
      if (created_by === null || created_by === '') {
        setClauses.push(`created_by = $${idx++}`);
        values.push(null);
      } else {
        const userRes = await pool.query(
          `SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1`,
          [created_by]
        );
        if (!userRes.rows.length) {
          return res.status(404).json({ error: `User "${created_by}" tidak ditemukan` });
        }
        setClauses.push(`created_by = $${idx++}`);
        values.push(userRes.rows[0].id);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: "Tidak ada field yang diperbarui" });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE chatrooms SET ${setClauses.join(', ')} WHERE id = $${idx}
       RETURNING id, name, max_participants, created_by, category_id`,
      values
    );

    if (!result.rows.length) return res.status(404).json({ error: "Chatroom tidak ditemukan" });
    res.json({ success: true, chatroom: result.rows[0], message: "Chatroom berhasil diperbarui" });
  } catch (err) {
    console.error("[chatrooms] PUT error:", err);
    res.status(500).json({ error: "Gagal memperbarui chatroom" });
  }
});

router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  await db.execute(sql`
    UPDATE chatrooms SET status = ${status} WHERE id = ${id}
  `);
  res.json({ success: true });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await db.execute(sql`DELETE FROM chatrooms WHERE id = ${id}`);
  res.json({ success: true });
});

router.get("/messages/:chatroomId", async (req, res) => {
  const { chatroomId } = req.params;
  const { page = "1", limit = "50" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const messages = await db.execute(sql`
    SELECT id, chatroom_id, sender_username, text, is_system, created_at
    FROM chatroom_messages
    WHERE chatroom_id = ${chatroomId}
    ORDER BY created_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  res.json({ messages: messages.rows });
});

export default router;
