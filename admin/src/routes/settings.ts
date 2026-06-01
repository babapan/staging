import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

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

const FLOOD_DEFAULTS: Record<string, string> = {
  "chat.flood.enabled": "true",
  "chat.flood.maxMessages": "5",
  "chat.flood.windowMs": "3000",
  "chat.flood.action": "disconnect",
};

router.get("/flood", async (_req, res) => {
  try {
    await ensureTable();
    const r = await db.execute(sql`
      SELECT key, value FROM system_settings WHERE key LIKE 'chat.flood.%'
    `);
    const settings: Record<string, string> = { ...FLOOD_DEFAULTS };
    for (const row of r.rows as Array<{ key: string; value: string }>) {
      settings[row.key] = row.value;
    }
    res.json({ settings });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal memuat setting" });
  }
});

router.put("/flood", async (req, res) => {
  try {
    await ensureTable();
    const { enabled, maxMessages, windowMs, action } = req.body ?? {};

    const enabledStr = String(enabled === true || enabled === "true");
    const maxN = Math.min(100, Math.max(1, parseInt(String(maxMessages ?? "5"), 10) || 5));
    const winMs = Math.min(60000, Math.max(500, parseInt(String(windowMs ?? "3000"), 10) || 3000));
    const act = action === "warn" ? "warn" : "disconnect";

    const updates: Array<[string, string]> = [
      ["chat.flood.enabled", enabledStr],
      ["chat.flood.maxMessages", String(maxN)],
      ["chat.flood.windowMs", String(winMs)],
      ["chat.flood.action", act],
    ];
    for (const [k, v] of updates) {
      await db.execute(sql`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (${k}, ${v}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `);
    }
    res.json({ ok: true, settings: {
      "chat.flood.enabled": enabledStr,
      "chat.flood.maxMessages": String(maxN),
      "chat.flood.windowMs": String(winMs),
      "chat.flood.action": act,
    }});
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal menyimpan setting" });
  }
});

// ─── Registration toggle ──────────────────────────────────────────────────────
router.get("/registration", async (_req, res) => {
  try {
    await ensureTable();
    const r = await db.execute(sql`
      SELECT value FROM system_settings WHERE key = 'registration.enabled'
    `);
    const rows = (r.rows ?? r) as Array<{ value: string }>;
    const enabled = rows.length === 0 ? true : rows[0].value === "true";
    res.json({ enabled });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal memuat setting" });
  }
});

router.put("/registration", async (req, res) => {
  try {
    await ensureTable();
    const enabled = req.body?.enabled === true || req.body?.enabled === "true";
    await db.execute(sql`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('registration.enabled', ${String(enabled)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `);
    res.json({ ok: true, enabled });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal menyimpan setting" });
  }
});

export default router;
