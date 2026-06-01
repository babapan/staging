import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

// GET /api/leaderboard/entries?type=&period=&search=&limit=&offset=
router.get("/entries", async (req, res) => {
  const {
    type = "",
    period = "WEEKLY",
    search = "",
    limit = "50",
    offset = "0",
  } = req.query as Record<string, string>;

  try {
    const searchClause = search ? sql`AND username ILIKE ${"%" + search + "%"}` : sql``;
    const typeClause   = type   ? sql`AND leaderboard_type = ${type}`           : sql``;

    const rows = await db.execute(sql`
      SELECT id, leaderboard_type, period, username, score, updated_at
      FROM leaderboard_entries
      WHERE period = ${period}
        ${typeClause}
        ${searchClause}
      ORDER BY score DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `);

    const countRes = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM leaderboard_entries
      WHERE period = ${period}
        ${typeClause}
        ${searchClause}
    `);

    res.json({
      entries: rows.rows,
      total: parseInt((countRes.rows[0] as any).total),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaderboard/user/:username — semua skor semua type/period untuk satu user
router.get("/user/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const rows = await db.execute(sql`
      SELECT id, leaderboard_type, period, score, updated_at
      FROM leaderboard_entries
      WHERE username = ${username}
      ORDER BY leaderboard_type ASC, period ASC
    `);
    res.json({ username, entries: rows.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leaderboard/entries/:id — koreksi skor (set nilai baru)
router.patch("/entries/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { score, reason } = req.body as { score: number; reason?: string };

  if (isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });
  if (typeof score !== "number" || score < 0) {
    return res.status(400).json({ error: "Score harus angka >= 0" });
  }

  try {
    const old = await db.execute(sql`
      SELECT id, leaderboard_type, period, username, score
      FROM leaderboard_entries WHERE id = ${id} LIMIT 1
    `);
    if (!old.rows[0]) return res.status(404).json({ error: "Entry tidak ditemukan" });

    const entry = old.rows[0] as any;
    await db.execute(sql`
      UPDATE leaderboard_entries
      SET score = ${score}, updated_at = NOW()
      WHERE id = ${id}
    `);

    console.log(`[admin/leaderboard] KOREKSI: ${entry.username} ${entry.leaderboard_type}/${entry.period} ${entry.score} → ${score}${reason ? ` (${reason})` : ''}`);

    res.json({ success: true, old: entry.score, new: score });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leaderboard/entries/:id — reset skor ke 0 (hapus entry)
router.delete("/entries/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });

  try {
    const old = await db.execute(sql`
      SELECT username, leaderboard_type, period, score FROM leaderboard_entries WHERE id = ${id} LIMIT 1
    `);
    if (!old.rows[0]) return res.status(404).json({ error: "Entry tidak ditemukan" });

    const entry = old.rows[0] as any;
    await db.execute(sql`DELETE FROM leaderboard_entries WHERE id = ${id}`);

    console.log(`[admin/leaderboard] HAPUS: ${entry.username} ${entry.leaderboard_type}/${entry.period} score=${entry.score}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leaderboard/recalc — recalculate skor dari diamond_transactions
// Hanya untuk PARTY_GIFT_RECEIVED & GIFT_RECEIVED pada period tertentu.
router.post("/recalc", async (req, res) => {
  const { username, period = "WEEKLY" } = req.body as { username: string; period?: string };
  if (!username) return res.status(400).json({ error: "Username wajib diisi" });

  const validPeriods = ["DAILY", "WEEKLY", "MONTHLY", "ALL_TIME"];
  if (!validPeriods.includes(period)) {
    return res.status(400).json({ error: `Period tidak valid. Pilih: ${validPeriods.join(", ")}` });
  }

  try {
    // Hitung total diamond dari transaksi dalam periode yg sesuai
    let since: string;
    const now = new Date();
    if (period === "DAILY") {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (period === "WEEKLY") {
      const day = now.getDay(); // 0=Sun
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      since = new Date(now.getFullYear(), now.getMonth(), diff).toISOString();
    } else if (period === "MONTHLY") {
      since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } else {
      since = "1970-01-01T00:00:00.000Z";
    }

    const txRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM diamond_transactions
      WHERE username = ${username}
        AND type = 'GIFT_RECEIVED'
        AND amount > 0
        AND created_at >= ${since}
    `);
    const recalcScore = parseFloat((txRes.rows[0] as any)?.total ?? 0);

    // Update PARTY_GIFT_RECEIVED dan GIFT_RECEIVED
    for (const lbType of ["LB:Party:GiftReceived:", "LB:GiftReceived:"]) {
      const existing = await db.execute(sql`
        SELECT id FROM leaderboard_entries
        WHERE leaderboard_type = ${lbType} AND period = ${period} AND username = ${username}
        LIMIT 1
      `);
      if (existing.rows[0]) {
        await db.execute(sql`
          UPDATE leaderboard_entries
          SET score = ${recalcScore}, updated_at = NOW()
          WHERE leaderboard_type = ${lbType} AND period = ${period} AND username = ${username}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO leaderboard_entries (leaderboard_type, period, username, score)
          VALUES (${lbType}, ${period}, ${username}, ${recalcScore})
        `);
      }
    }

    console.log(`[admin/leaderboard] RECALC: ${username} period=${period} → ${recalcScore} diamonds`);
    res.json({ success: true, username, period, recalcScore });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
