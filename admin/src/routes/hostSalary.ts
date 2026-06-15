import { Router, Request, Response } from "express";
  import { db } from "../db.js";
  import { sql } from "drizzle-orm";
  import { requireAdmin } from "../auth.js";

  const router = Router();
  router.use(requireAdmin);

  export const SALARY_LEVELS: Record<string, {
    label: string; target_coin: number; target_diamond: number;
    valid_days: number; valid_hours: number;
    salary_diamond: number; reward_diamond: number; idr_per_diamond: number;
  }> = {
    A1: { label:'A1', target_coin:120000, target_diamond:0, valid_days:5, valid_hours:10, salary_diamond:14400, reward_diamond:0, idr_per_diamond:2 },
    S1: { label:'S1', target_coin:600000, target_diamond:0, valid_days:5, valid_hours:15, salary_diamond:50000, reward_diamond:0, idr_per_diamond:2 },
  };

  async function ensureTables() {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS host_salary_contracts (id SERIAL PRIMARY KEY, username VARCHAR(60) NOT NULL, agency_name VARCHAR(120) NOT NULL DEFAULT '', room_voice_name VARCHAR(120) NOT NULL DEFAULT '', salary_level VARCHAR(10) NOT NULL DEFAULT 'A1', status VARCHAR(20) NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), notes TEXT)`).catch(()=>{});
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_hsc_username ON host_salary_contracts (username)`).catch(()=>{});
    await db.execute(sql`CREATE TABLE IF NOT EXISTS host_salary_weekly_logs (id SERIAL PRIMARY KEY, contract_id INTEGER NOT NULL REFERENCES host_salary_contracts(id) ON DELETE CASCADE, username VARCHAR(60) NOT NULL, salary_level VARCHAR(10) NOT NULL, week_start DATE NOT NULL, week_end DATE NOT NULL, jam_live_aktual NUMERIC(6,2) NOT NULL DEFAULT 0, coin_aktual BIGINT NOT NULL DEFAULT 0, target_terpenuhi BOOLEAN NOT NULL DEFAULT FALSE, salary_diamond BIGINT NOT NULL DEFAULT 0, reward_diamond BIGINT NOT NULL DEFAULT 0, total_diamond_earned BIGINT NOT NULL DEFAULT 0, payment_status VARCHAR(20) NOT NULL DEFAULT 'pending', paid_at TIMESTAMPTZ, paid_by_admin VARCHAR(60), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(()=>{});
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_hswl_week ON host_salary_weekly_logs (contract_id, week_start)`).catch(()=>{});
  }

  function getWeekRange(date: Date): { start: Date; end: Date } {
    const WIB = 7 * 3600 * 1000;
    const localMs = date.getTime() + WIB;
    const day = new Date(localMs).getUTCDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monMs = localMs + diffToMon * 86400000;
    const sunMs = monMs + 6 * 86400000;
    const toMidnight = (ms: number) => {
      const d = new Date(ms - WIB);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    };
    return { start: toMidnight(monMs), end: toMidnight(sunMs + 86400000 - 1) };
  }

  async function fetchActuals(username: string, weekStart: Date, weekEnd: Date) {
    // ── Coin: total coin_amount dari gift di room milik host ──────────────────
    // LOWER() untuk case-insensitive match
    const coinRes = await db.execute(sql`
      SELECT COALESCE(SUM(pil.coin_amount),0) AS total_coin
      FROM party_income_log pil
      JOIN party_rooms pr ON pr.id = pil.room_id
      WHERE LOWER(pr.creator_username) = LOWER(${username})
        AND pil.created_at >= ${weekStart.toISOString()}
        AND pil.created_at <  ${weekEnd.toISOString()}
    `).catch(() => ({ rows: [] as Record<string,unknown>[] }));
    const coinActual = Number((coinRes.rows[0] as any)?.total_coin ?? 0);

    // ── Jam live: dari party_live_sessions (source of truth sesungguhnya) ─────
    // Sesi yang sudah selesai: pakai duration_seconds
    // Sesi yang masih berjalan (ended_at IS NULL): hitung EXTRACT(EPOCH FROM NOW()-started_at)
    const liveRes = await db.execute(sql`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN ended_at IS NOT NULL THEN COALESCE(duration_seconds, 0)
            ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER)
          END
        ), 0) AS total_seconds,
        COUNT(DISTINCT DATE(started_at AT TIME ZONE 'Asia/Jakarta')) AS active_days
      FROM party_live_sessions
      WHERE LOWER(username) = LOWER(${username})
        AND started_at >= ${weekStart.toISOString()}
        AND started_at <  ${weekEnd.toISOString()}
    `).catch(() => ({ rows: [] as Record<string,unknown>[] }));

    const totalSeconds = Number((liveRes.rows[0] as any)?.total_seconds ?? 0);
    const activeDays   = Number((liveRes.rows[0] as any)?.active_days ?? 0);
    const jamLiveAktual = parseFloat((totalSeconds / 3600).toFixed(2));

    return { coinActual, activeDays, jamLiveAktual };
  }

  router.get('/levels', (_req: Request, res: Response) => {
    res.json({ levels: SALARY_LEVELS });
  });

  router.get('/contracts', async (req: Request, res: Response) => {
    await ensureTables();
    try {
      const status = req.query.status as string | undefined;
      const { start: weekStart, end: weekEnd } = getWeekRange(new Date());
      const weekStartStr = weekStart.toISOString().split('T')[0];

      // Ambil semua kontrak + data log minggu ini (untuk payment_status & log_id)
      const rows = await db.execute(sql`
        SELECT
          hsc.*,
          wl.payment_status AS this_week_pay_status,
          wl.id             AS this_week_log_id
        FROM host_salary_contracts hsc
        LEFT JOIN host_salary_weekly_logs wl
          ON wl.contract_id = hsc.id AND wl.week_start = ${weekStartStr}::DATE
        WHERE (${status ?? null}::TEXT IS NULL OR hsc.status = ${status ?? null})
        ORDER BY hsc.created_at DESC
      `);

      // Hitung live actuals secara real-time untuk setiap kontrak (jam live & coin)
      const contracts = await Promise.all((rows.rows as any[]).map(async r => {
        const level = SALARY_LEVELS[r.salary_level as string] ?? SALARY_LEVELS['A1'];
        const { coinActual, activeDays, jamLiveAktual } = await fetchActuals(r.username as string, weekStart, weekEnd);
        const coinMet    = coinActual  >= level.target_coin;
        const hoursMet   = jamLiveAktual >= level.valid_hours;
        const daysMet    = activeDays  >= level.valid_days;
        const targetMet  = coinMet && (hoursMet || daysMet);
        const salaryDiam = targetMet ? level.salary_diamond : 0;
        const rewardDiam = targetMet ? level.reward_diamond : 0;
        return {
          ...r,
          level_details:        level,
          this_week_coin:       coinActual,
          this_week_hours:      jamLiveAktual,
          this_week_active_days: activeDays,
          this_week_diamond:    salaryDiam + rewardDiam,
          this_week_met:        targetMet,
          this_week_coin_met:   coinMet,
          this_week_hours_met:  hoursMet,
          this_week_days_met:   daysMet,
        };
      }));

      res.json({ contracts, week_start: weekStartStr, week_end: weekEnd.toISOString().split('T')[0] });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/contracts', async (req: Request, res: Response) => {
    await ensureTables();
    const { username, agency_name, room_voice_name, salary_level, notes } = req.body;
    if (!username || !salary_level)
      return res.status(400).json({ error: 'username dan salary_level wajib diisi' });
    if (!SALARY_LEVELS[salary_level as string])
      return res.status(400).json({ error: 'salary_level tidak valid. Pilih: A1 atau S1' });
    const userCheck = await db.execute(sql`SELECT username FROM users WHERE username = ${username} LIMIT 1`);
    if ((userCheck.rows as any[]).length === 0)
      return res.status(400).json({ error: `User @${username} tidak ditemukan` });
    try {
      const result = await db.execute(sql`
        INSERT INTO host_salary_contracts (username, agency_name, room_voice_name, salary_level, notes)
        VALUES (${username}, ${agency_name ?? ''}, ${room_voice_name ?? ''}, ${salary_level}, ${notes ?? null})
        ON CONFLICT (username) DO UPDATE SET
          agency_name     = EXCLUDED.agency_name,
          room_voice_name = EXCLUDED.room_voice_name,
          salary_level    = EXCLUDED.salary_level,
          notes           = EXCLUDED.notes,
          status          = 'active',
          updated_at      = NOW()
        RETURNING *
      `);
      res.json({ contract: (result.rows as any[])[0] });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.patch('/contracts/:id', async (req: Request, res: Response) => {
    await ensureTables();
    const { id } = req.params;
    const { status, agency_name, room_voice_name, salary_level, notes } = req.body;
    if (status && !['active', 'inactive'].includes(status as string))
      return res.status(400).json({ error: 'status harus active atau inactive' });
    if (salary_level && !SALARY_LEVELS[salary_level as string])
      return res.status(400).json({ error: 'salary_level tidak valid' });
    try {
      await db.execute(sql`
        UPDATE host_salary_contracts SET
          status          = COALESCE(${status ?? null}, status),
          agency_name     = COALESCE(${agency_name ?? null}, agency_name),
          room_voice_name = COALESCE(${room_voice_name ?? null}, room_voice_name),
          salary_level    = COALESCE(${salary_level ?? null}, salary_level),
          notes           = COALESCE(${notes ?? null}, notes),
          updated_at      = NOW()
        WHERE id = ${Number(id)}
      `);
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/weekly-report', async (req: Request, res: Response) => {
    await ensureTables();
    try {
      const startParam = req.query.start as string | undefined;
      const endParam   = req.query.end   as string | undefined;
      let weekStart: Date, weekEnd: Date;
      if (startParam && endParam) {
        weekStart = new Date(startParam);
        weekEnd   = new Date(endParam);
      } else {
        const range = getWeekRange(new Date());
        weekStart = range.start;
        weekEnd   = range.end;
      }
      const contracts = await db.execute(sql`SELECT * FROM host_salary_contracts WHERE status = 'active'`);
      const results: unknown[] = [];
      for (const c of contracts.rows as any[]) {
        const level = SALARY_LEVELS[c.salary_level as string] ?? SALARY_LEVELS['A1'];
        // fetchActuals sekarang menghitung jamLiveAktual dari party_live_sessions
        const { coinActual, activeDays, jamLiveAktual } = await fetchActuals(c.username as string, weekStart, weekEnd);
        const coinMet       = coinActual >= level.target_coin;
        const hoursMet      = jamLiveAktual >= level.valid_hours;
        const daysMet       = activeDays >= level.valid_days;
        const targetMet     = coinMet && (hoursMet || daysMet);
        const salaryDiamond = targetMet ? level.salary_diamond : 0;
        const rewardDiamond = targetMet ? level.reward_diamond : 0;
        const totalDiamond  = salaryDiamond + rewardDiamond;
        await db.execute(sql`
          INSERT INTO host_salary_weekly_logs
            (contract_id, username, salary_level, week_start, week_end,
             jam_live_aktual, coin_aktual, target_terpenuhi,
             salary_diamond, reward_diamond, total_diamond_earned)
          VALUES
            (${c.id}, ${c.username}, ${c.salary_level},
             ${weekStart.toISOString().split('T')[0]}::DATE,
             ${weekEnd.toISOString().split('T')[0]}::DATE,
             ${jamLiveAktual}, ${coinActual}, ${targetMet},
             ${salaryDiamond}, ${rewardDiamond}, ${totalDiamond})
          ON CONFLICT (contract_id, week_start) DO UPDATE SET
            jam_live_aktual      = EXCLUDED.jam_live_aktual,
            coin_aktual          = EXCLUDED.coin_aktual,
            target_terpenuhi     = EXCLUDED.target_terpenuhi,
            salary_diamond       = EXCLUDED.salary_diamond,
            reward_diamond       = EXCLUDED.reward_diamond,
            total_diamond_earned = EXCLUDED.total_diamond_earned
        `);
        results.push({
          username: c.username, agency_name: c.agency_name,
          room_voice_name: c.room_voice_name, salary_level: c.salary_level,
          week_start: weekStart.toISOString().split('T')[0],
          week_end:   weekEnd.toISOString().split('T')[0],
          jam_live_aktual: jamLiveAktual, coin_aktual: coinActual,
          active_days: activeDays, coin_met: coinMet, hours_met: hoursMet, days_met: daysMet,
          target_terpenuhi: targetMet, salary_diamond: salaryDiamond,
          reward_diamond: rewardDiamond, total_diamond_earned: totalDiamond,
          level_details: level,
        });
      }
      res.json({ week_start: weekStart.toISOString().split('T')[0], week_end: weekEnd.toISOString().split('T')[0], results });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/history/:username', async (req: Request, res: Response) => {
    await ensureTables();
    try {
      const rows = await db.execute(sql`
        SELECT wl.*, hsc.agency_name, hsc.room_voice_name
        FROM host_salary_weekly_logs wl
        JOIN host_salary_contracts hsc ON hsc.id = wl.contract_id
        WHERE wl.username = ${req.params.username}
        ORDER BY wl.week_start DESC LIMIT 52
      `);
      res.json({ history: rows.rows });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/weekly-logs/:id/pay', async (req: Request, res: Response) => {
    await ensureTables();
    const { id } = req.params;
    const admin = (req as any).adminUser;
    try {
      const row = await db.execute(sql`SELECT * FROM host_salary_weekly_logs WHERE id = ${Number(id)} LIMIT 1`);
      const log = (row.rows as any[])[0];
      if (!log) return res.status(404).json({ error: 'Log tidak ditemukan' });
      if (log.payment_status === 'paid') return res.status(400).json({ error: 'Sudah dibayar' });
      await db.execute(sql`UPDATE host_salary_weekly_logs SET payment_status='paid', paid_at=NOW(), paid_by_admin=${admin.username} WHERE id=${Number(id)}`);
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  export default router;
  