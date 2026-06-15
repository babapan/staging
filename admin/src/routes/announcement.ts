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

const KEYS = {
  enabled: "login.announcement.enabled",
  title:   "login.announcement.title",
  body:    "login.announcement.body",
  imageUrl:"login.announcement.image_url",
  version: "login.announcement.version",
};

async function getSetting(key: string, fallback = ""): Promise<string> {
  const r = await db.execute(sql`SELECT value FROM system_settings WHERE key = ${key} LIMIT 1`);
  if (!r.rows.length) return fallback;
  return String((r.rows[0] as any).value ?? fallback);
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `);
}

router.get("/", async (_req, res) => {
  try {
    await ensureTable();
    const [enabled, title, body, imageUrl, version] = await Promise.all([
      getSetting(KEYS.enabled, "false"),
      getSetting(KEYS.title, ""),
      getSetting(KEYS.body, ""),
      getSetting(KEYS.imageUrl, ""),
      getSetting(KEYS.version, "0"),
    ]);
    res.json({
      enabled: enabled === "true",
      title,
      body,
      imageUrl,
      version: parseInt(version, 10) || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal memuat pengumuman" });
  }
});

router.put("/", async (req, res) => {
  try {
    await ensureTable();
    const { enabled, title, body, imageUrl } = req.body ?? {};
    const enabledStr = String(enabled === true || enabled === "true");
    const titleStr = String(title ?? "").slice(0, 200);
    const bodyStr  = String(body ?? "").slice(0, 4000);
    const imgStr   = String(imageUrl ?? "").slice(0, 1000);

    if (enabledStr === "true" && !bodyStr.trim()) {
      return res.status(400).json({ error: "Isi pengumuman wajib jika diaktifkan" });
    }

    // Bump version so the app knows to re-show the popup once per published edit.
    const cur = parseInt(await getSetting(KEYS.version, "0"), 10) || 0;
    const next = cur + 1;

    await Promise.all([
      setSetting(KEYS.enabled, enabledStr),
      setSetting(KEYS.title,   titleStr),
      setSetting(KEYS.body,    bodyStr),
      setSetting(KEYS.imageUrl,imgStr),
      setSetting(KEYS.version, String(next)),
    ]);

    res.json({
      ok: true,
      enabled: enabledStr === "true",
      title: titleStr,
      body: bodyStr,
      imageUrl: imgStr,
      version: next,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal menyimpan pengumuman" });
  }
});

// ─── Live Room Announcement ────────────────────────────────────────────────────
const LIVE_KEYS = {
  enabled: "live.announcement.enabled",
  text:    "live.announcement.text",
};

router.get("/live", async (_req, res) => {
  try {
    await ensureTable();
    const [enabled, text] = await Promise.all([
      getSetting(LIVE_KEYS.enabled, "false"),
      getSetting(LIVE_KEYS.text,    ""),
    ]);
    res.json({ enabled: enabled === "true", text });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal memuat pengumuman live" });
  }
});

router.put("/live", async (req, res) => {
  try {
    await ensureTable();
    const { enabled, text } = req.body ?? {};
    const enabledStr = String(enabled === true || enabled === "true");
    const textStr    = String(text ?? "").slice(0, 2000);

    if (enabledStr === "true" && !textStr.trim()) {
      return res.status(400).json({ error: "Teks pengumuman wajib jika diaktifkan" });
    }

    await Promise.all([
      setSetting(LIVE_KEYS.enabled, enabledStr),
      setSetting(LIVE_KEYS.text,    textStr),
    ]);

    // Trigger broadcast on main backend so all live viewers see it instantly
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:5000";
    const token      = process.env.SESSION_SECRET || "migme-internal";
    try {
      await fetch(`${backendUrl}/api/live/announcement/internal-broadcast`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-internal-token": token },
        body:    JSON.stringify({ enabled: enabledStr === "true", text: textStr }),
      });
    } catch { /* non-fatal — DB already saved */ }

    res.json({ ok: true, enabled: enabledStr === "true", text: textStr });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal menyimpan pengumuman live" });
  }
});

export default router;
