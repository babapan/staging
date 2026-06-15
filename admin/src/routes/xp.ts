/**
 * /api/xp — Admin endpoints for live-tuning XP awards & chat throttle.
 *
 * Reads/writes the `system_settings` table with keys prefixed `xp.*`.
 * The Server backend reloads its in-memory cache automatically (TTL 15 s).
 */

import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

interface XpConfig {
  chatRoomMessage: number;
  privateMessage:  number;
  giftSent:        number;
  giftReceived:    number;
  photoUploaded:   number;
  referral:        number;
  phoneCallSecond: number;
  gamePlayed:      number;
  gameWon:         number;
  chatThrottleMinGapMs:  number;
  chatThrottlePerMinCap: number;
}

const XP_DEFAULTS: XpConfig = {
  chatRoomMessage: 3,
  privateMessage:  1,
  giftSent:        50,
  giftReceived:    50,
  photoUploaded:   100,
  referral:        33,
  phoneCallSecond: 1,
  gamePlayed:      8,
  gameWon:         35,
  chatThrottleMinGapMs:  4000,
  chatThrottlePerMinCap: 12,
};

let initialized = false;
async function ensureTable(): Promise<void> {
  if (initialized) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS system_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  initialized = true;
}

function parseNum(v: string | undefined, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

router.get("/", async (_req, res) => {
  try {
    await ensureTable();
    const r = await db.execute(sql`
      SELECT key, value FROM system_settings WHERE key LIKE 'xp.%'
    `);
    const map = new Map<string, string>();
    for (const row of r.rows as Array<{ key: string; value: string }>) {
      map.set(row.key, row.value);
    }
    const cfg: XpConfig = { ...XP_DEFAULTS };
    for (const k of Object.keys(XP_DEFAULTS) as Array<keyof XpConfig>) {
      cfg[k] = parseNum(map.get(`xp.${k}`), XP_DEFAULTS[k]);
    }
    res.json({ config: cfg, defaults: XP_DEFAULTS });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to load XP config" });
  }
});

router.put("/", async (req, res) => {
  try {
    await ensureTable();
    const patch = req.body ?? {};
    const validKeys = Object.keys(XP_DEFAULTS) as Array<keyof XpConfig>;
    const written: Record<string, number> = {};

    for (const k of validKeys) {
      if (patch[k] == null) continue;
      const n = Number(patch[k]);
      if (!Number.isFinite(n) || n < 0) continue;
      const fullKey = `xp.${k}`;
      const valStr  = String(n);
      await db.execute(sql`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (${fullKey}, ${valStr}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `);
      written[k] = n;
    }

    // Echo current full config back
    const r = await db.execute(sql`
      SELECT key, value FROM system_settings WHERE key LIKE 'xp.%'
    `);
    const map = new Map<string, string>();
    for (const row of r.rows as Array<{ key: string; value: string }>) {
      map.set(row.key, row.value);
    }
    const cfg: XpConfig = { ...XP_DEFAULTS };
    for (const k of validKeys) {
      cfg[k] = parseNum(map.get(`xp.${k}`), XP_DEFAULTS[k]);
    }
    res.json({ ok: true, config: cfg, written });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to save XP config" });
  }
});

router.post("/reset", async (_req, res) => {
  try {
    await ensureTable();
    await db.execute(sql`DELETE FROM system_settings WHERE key LIKE 'xp.%'`);
    res.json({ ok: true, config: XP_DEFAULTS });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to reset XP config" });
  }
});

export default router;
