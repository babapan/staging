import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin } from "../auth.js";
import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function ensureAdminLogsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_activity_logs (
      id SERIAL PRIMARY KEY,
      action VARCHAR(20) NOT NULL,
      target_user_id INTEGER NOT NULL,
      target_username VARCHAR(255) NOT NULL,
      performed_by VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

ensureAdminLogsTable().catch(console.error);

const router = Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const { page = "1", limit = "20", search = "" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const searchClause = search
    ? sql`AND (u.username ILIKE ${"%" + search + "%"} OR u.email ILIKE ${"%" + search + "%"})`
    : sql``;

  const users = await db.execute(sql`
    SELECT u.id, u.username, u.display_name, u.email, u.email_verified,
           u.is_admin, u.is_super_admin, u.is_suspended, u.created_at,
           p.mig_level, p.country, p.display_picture,
           ca.balance, ca.currency
    FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    LEFT JOIN credit_accounts ca ON ca.username = u.username
    WHERE 1=1 ${searchClause}
    ORDER BY u.created_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  const count = await db.execute(sql`
    SELECT COUNT(*) as total FROM users u
    WHERE 1=1 ${searchClause}
  `);

  res.json({
    users: users.rows,
    total: parseInt((count.rows[0] as any).total),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

router.get("/admin-logs", async (req, res) => {
  const { limit = "50" } = req.query as Record<string, string>;

  try {
    const logs = await db.execute(sql`
      SELECT id, action, target_user_id, target_username, performed_by, created_at
      FROM admin_activity_logs
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)}
    `);
    res.json({ logs: logs.rows });
  } catch {
    res.json({ logs: [] });
  }
});

// ── PUT /rename — admin ganti username user yang sudah ada ──────────────────
router.put("/rename", async (req, res) => {
  const { old_username, new_username } = req.body as { old_username?: string; new_username?: string };
  if (!old_username || !new_username)
    return res.status(400).json({ error: "old_username dan new_username wajib diisi" });

  const oldU = old_username.trim();
  const newU = new_username.trim();

  if (newU.length < 1 || newU.length > 18)
    return res.status(400).json({ error: "Username baru harus 1–18 karakter" });

  try {
    // Pastikan user lama ada
    const existing = await db.execute(sql`SELECT id, username, display_name, email FROM users WHERE LOWER(username) = LOWER(${oldU}) LIMIT 1`);
    if ((existing.rows as any[]).length === 0)
      return res.status(404).json({ error: `User @${oldU} tidak ditemukan` });

    // Pastikan username baru belum dipakai
    const taken = await db.execute(sql`SELECT id FROM users WHERE LOWER(username) = LOWER(${newU}) LIMIT 1`);
    if ((taken.rows as any[]).length > 0)
      return res.status(409).json({ error: `Username @${newU} sudah dipakai` });

    const user = (existing.rows as any[])[0];

    // Update di semua tabel penting
    await db.execute(sql`UPDATE users                  SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`);
    await db.execute(sql`UPDATE wall_posts             SET author_username = ${newU}         WHERE LOWER(author_username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE messages               SET sender_username = ${newU}         WHERE LOWER(sender_username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE contacts               SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE contact_groups         SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE user_settings          SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE user_privacy_settings  SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE user_reputation        SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE chatrooms              SET owner_username = ${newU}         WHERE LOWER(owner_username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE party_rooms            SET creator_username = ${newU}       WHERE LOWER(creator_username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE credit_accounts        SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE diamond_transactions   SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE host_salary_contracts  SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE host_salary_weekly_logs SET username = ${newU}             WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE badges_rewarded        SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});
    await db.execute(sql`UPDATE friendships            SET username = ${newU}               WHERE LOWER(username) = LOWER(${oldU})`).catch(() => {});

    const admin = (req as any).admin;
    return res.json({ success: true, old_username: oldU, new_username: newU, user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/special", async (req, res) => {
  const { username, displayName, email, password, country, gender } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, dan password wajib diisi" });
  }
  if (username.length < 1 || username.length > 18) {
    return res.status(400).json({ error: "Username harus 1-18 karakter" });
  }

  try {
    const existUser = await db.execute(sql`SELECT id FROM users WHERE username = ${username} OR email = ${email} LIMIT 1`);
    if (existUser.rows.length > 0) {
      return res.status(409).json({ error: "Username atau email sudah terdaftar" });
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await db.execute(sql`
      INSERT INTO users (username, display_name, email, password, email_verified)
      VALUES (${username}, ${displayName || username}, ${email}, ${hashedPassword}, true)
      RETURNING id, username, display_name, email
    `);

    const userId = (newUser.rows[0] as any).id;
    await db.execute(sql`
      INSERT INTO user_profiles (user_id, country, gender)
      VALUES (${userId}, ${country || null}, ${gender || null})
    `);

    res.status(201).json({ success: true, user: newUser.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal membuat akun" });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const user = await db.execute(sql`
    SELECT u.id, u.username, u.display_name, u.email, u.email_verified,
           u.is_admin, u.is_suspended, u.created_at,
           p.mig_level, p.country, p.city, p.gender, p.about_me, p.display_picture,
           ca.balance, ca.currency, ca.funded_balance
    FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    LEFT JOIN credit_accounts ca ON ca.username = u.username
    WHERE u.id = ${id}
    LIMIT 1
  `);

  if (!user.rows.length) return res.status(404).json({ error: "User tidak ditemukan" });
  res.json(user.rows[0]);
});

router.patch("/:id/suspend", async (req, res) => {
  const { id } = req.params;
  const { isSuspended } = req.body;

  await db.execute(sql`
    UPDATE users SET is_suspended = ${!!isSuspended} WHERE id = ${id}
  `);
  res.json({ success: true });
});

// ── IP-based investigation ───────────────────────────────────────────────────
// Returns the IPs ever observed for {username} along with all OTHER users that
// have shared any of those IPs. Used by the admin panel "Cek IP" button to
// drive bulk suspend.
router.get("/:username/ip-related", async (req, res) => {
  try {
    const { username } = req.params;

    // Make sure the table exists — first call to this endpoint after a fresh
    // deploy may hit it before any user has logged in.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_ip_log (
        id          BIGSERIAL PRIMARY KEY,
        username    TEXT NOT NULL,
        ip_address  TEXT NOT NULL,
        first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        hit_count   INTEGER     NOT NULL DEFAULT 1
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ip_log_unique ON user_ip_log(username, ip_address)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_ip_log_ip ON user_ip_log(ip_address)`);

    const ipsRes = await db.execute(sql`
      SELECT ip_address, MAX(last_seen) AS last_seen
      FROM user_ip_log
      WHERE username = ${username}
      GROUP BY ip_address
      ORDER BY last_seen DESC
    `);
    const ips: string[] = ipsRes.rows.map((r: any) => r.ip_address);

    if (ips.length === 0) {
      return res.json({ username, ips: [], related: [] });
    }

    // Find every other username that shares any of those IPs, joined with
    // user account info so the UI can show id / status and pick targets.
    const relatedRes = await db.execute(sql`
      SELECT l.username,
             ARRAY_AGG(DISTINCT l.ip_address) AS shared_ips,
             SUM(l.hit_count)::int          AS hit_count,
             MAX(l.last_seen)               AS last_seen,
             u.id                           AS user_id,
             u.is_suspended,
             u.is_admin,
             u.email,
             u.created_at
      FROM user_ip_log l
      LEFT JOIN users u ON u.username = l.username
      WHERE l.ip_address = ANY(${ips})
        AND l.username  <> ${username}
      GROUP BY l.username, u.id, u.is_suspended, u.is_admin, u.email, u.created_at
      ORDER BY last_seen DESC
    `);

    res.json({
      username,
      ips: ipsRes.rows,
      related: relatedRes.rows,
    });
  } catch (err: any) {
    console.error("[users] ip-related error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// Bulk suspend / unsuspend by user id. Body: { userIds: number[], isSuspended: boolean }
router.post("/suspend-bulk", async (req, res) => {
  try {
    const { userIds, isSuspended } = req.body as { userIds?: (number | string)[]; isSuspended?: boolean };
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "userIds harus berupa array non-kosong" });
    }
    const ids = userIds.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return res.status(400).json({ error: "Tidak ada userId valid" });
    }
    const suspend = isSuspended !== false; // default true
    const performedBy = (req as any).adminUser?.username || "unknown";

    await db.execute(sql`
      UPDATE users SET is_suspended = ${suspend} WHERE id = ANY(${ids})
    `);

    // Log every affected user (best-effort)
    try {
      const action = suspend ? "bulk_suspend" : "bulk_unsuspend";
      const targets = await db.execute(sql`
        SELECT id, username FROM users WHERE id = ANY(${ids})
      `);
      for (const row of targets.rows as any[]) {
        await db.execute(sql`
          INSERT INTO admin_activity_logs (action, target_user_id, target_username, performed_by)
          VALUES (${action}, ${row.id}, ${row.username}, ${performedBy})
        `);
      }
    } catch (logErr) {
      console.error("[users] bulk suspend log error:", logErr);
    }

    res.json({ success: true, affected: ids.length });
  } catch (err: any) {
    console.error("[users] suspend-bulk error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

router.post("/disconnect-by-ip", async (req, res) => {
  try {
    const { usernames, cooldownMs } = req.body as { usernames?: string[]; cooldownMs?: number };
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: "usernames harus berupa array non-kosong" });
    }
    const performedBy = (req as any).adminUser?.username || "unknown";
    const blockMs = typeof cooldownMs === "number" && cooldownMs > 0
      ? cooldownMs
      : 60 * 60 * 1000;

    const MAIN_APP_URL = process.env.MAIN_APP_URL || "http://localhost:5000";
    const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "migme-internal-admin-2024";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let upstream: any = null;
    let upstreamErr: string | null = null;
    try {
      const r = await fetch(`${MAIN_APP_URL}/api/system/admin/disconnect-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
        body: JSON.stringify({ usernames, cooldownMs: blockMs }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      upstream = await r.json().catch(() => ({}));
      if (!r.ok) upstreamErr = upstream?.error || `HTTP ${r.status}`;
    } catch (e: any) {
      clearTimeout(timer);
      upstreamErr = e?.message || String(e);
    }

    // Best-effort audit log per affected user
    try {
      const targets = await db.execute(sql`
        SELECT id, username FROM users WHERE username = ANY(${usernames})
      `);
      for (const row of targets.rows as any[]) {
        await db.execute(sql`
          INSERT INTO admin_activity_logs (action, target_user_id, target_username, performed_by)
          VALUES ('disconnect_ip', ${row.id}, ${row.username}, ${performedBy})
        `);
      }
    } catch (logErr) {
      console.error("[users] disconnect-by-ip log error:", logErr);
    }

    if (upstreamErr) {
      return res.status(502).json({ error: `Gagal menghubungi server utama: ${upstreamErr}` });
    }
    return res.json({ success: true, blockMs, upstream });
  } catch (err: any) {
    console.error("[users] disconnect-by-ip error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── PATCH /:id/super-admin — toggle Super Admin (Super Admin only) ────────────
router.patch("/:id/super-admin", requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { isSuperAdmin } = req.body;
  const performedBy = (req as any).adminUser?.username || "unknown";

  await db.execute(sql`
    UPDATE users SET is_super_admin = ${!!isSuperAdmin} WHERE id = ${id}
  `);

  try {
    const targetUser = await db.execute(sql`
      SELECT username FROM users WHERE id = ${id} LIMIT 1
    `);
    const targetUsername = (targetUser.rows[0] as any)?.username || "unknown";
    const action = isSuperAdmin ? "grant_super" : "revoke_super";

    await db.execute(sql`
      INSERT INTO admin_activity_logs (action, target_user_id, target_username, performed_by)
      VALUES (${action}, ${parseInt(id)}, ${targetUsername}, ${performedBy})
    `);
  } catch (logErr) {
    console.error("Failed to write admin log:", logErr);
  }

  res.json({ success: true });
});

router.patch("/:id/admin", async (req, res) => {
  const { id } = req.params;
  const { isAdmin } = req.body;
  const performedBy = (req as any).adminUser?.username || "unknown";

  await db.execute(sql`
    UPDATE users SET is_admin = ${!!isAdmin} WHERE id = ${id}
  `);

  try {
    const targetUser = await db.execute(sql`
      SELECT username FROM users WHERE id = ${id} LIMIT 1
    `);
    const targetUsername = (targetUser.rows[0] as any)?.username || "unknown";
    const action = isAdmin ? "grant" : "revoke";

    await db.execute(sql`
      INSERT INTO admin_activity_logs (action, target_user_id, target_username, performed_by)
      VALUES (${action}, ${parseInt(id)}, ${targetUsername}, ${performedBy})
    `);
  } catch (logErr) {
    console.error("Failed to write admin log:", logErr);
  }

  res.json({ success: true });
});

// ── Device registration management ───────────────────────────────────────────
// NOTE: These must be declared BEFORE /:id and /:username wildcards to avoid route conflicts.
router.get("/:username/devices", async (req, res) => {
  try {
    const { username } = req.params;
    const result = await db.execute(sql`
      SELECT dr.device_id, COUNT(*) AS account_count,
             ARRAY_AGG(dr.username ORDER BY dr.registered_at) AS usernames,
             MAX(dr.registered_at) AS last_at
      FROM device_registrations dr
      WHERE dr.device_id IN (
        SELECT device_id FROM device_registrations WHERE username = ${username}
      )
      GROUP BY dr.device_id
      ORDER BY last_at DESC
    `);
    res.json({ devices: result.rows });
  } catch (err) {
    console.error("[users] GET devices error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/devices/:deviceId", async (req, res) => {
  try {
    const { deviceId } = req.params;
    await db.execute(sql`DELETE FROM device_registrations WHERE device_id = ${deviceId}`);
    res.json({ success: true, message: "Registrasi perangkat berhasil direset" });
  } catch (err) {
    console.error("[users] DELETE device error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await db.execute(sql`DELETE FROM users WHERE id = ${id}`);
  res.json({ success: true });
});

export default router;
