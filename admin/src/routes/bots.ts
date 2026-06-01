import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

// Daftar bot game yang terdaftar di tabel `bots` (definisi game, bukan sesi
// runtime). Sesi runtime di-track in-memory oleh main server (BotServiceI),
// jadi yang bisa diandalkan untuk panel admin adalah katalog game ini.
router.get("/list", async (_req, res) => {
  try {
    const bots = await db.execute(sql`
      SELECT
        id,
        game,
        display_name,
        description,
        command_name,
        type,
        leaderboards,
        sort_order,
        group_id,
        status
      FROM bots
      ORDER BY sort_order ASC, id ASC
    `);
    res.json({ bots: bots.rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal memuat daftar bot", bots: [] });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const total = await db.execute(sql`SELECT COUNT(*)::int AS total FROM bots`);
    const active = await db.execute(sql`SELECT COUNT(*)::int AS total FROM bots WHERE status = 1`);
    const byGroup = await db.execute(sql`
      SELECT group_id, COUNT(*)::int AS total
      FROM bots
      GROUP BY group_id
      ORDER BY group_id ASC
    `);
    res.json({
      totalBots: (total.rows[0] as any)?.total ?? 0,
      activeBots: (active.rows[0] as any)?.total ?? 0,
      byGroup: byGroup.rows,
    });
  } catch {
    res.json({ totalBots: 0, activeBots: 0, byGroup: [] });
  }
});

// Toggle status bot (1 = aktif, 0 = nonaktif).
router.post("/:id/toggle", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "ID tidak valid" });
  try {
    const result = await db.execute(sql`
      UPDATE bots SET status = CASE WHEN status = 1 THEN 0 ELSE 1 END
      WHERE id = ${id}
      RETURNING id, status
    `);
    if (result.rows.length === 0) return res.status(404).json({ error: "Bot tidak ditemukan" });
    res.json({ ok: true, bot: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal mengubah status" });
  }
});

export default router;
