import { db } from "./db.js";
import { sql } from "drizzle-orm";
import type { Request } from "express";

let initialized = false;

async function ensureTable(): Promise<void> {
  if (initialized) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id            BIGSERIAL PRIMARY KEY,
      username      TEXT,
      ip            TEXT,
      user_agent    TEXT,
      success       BOOLEAN NOT NULL DEFAULT FALSE,
      reason        TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_created_at
      ON admin_login_attempts (created_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip_created
      ON admin_login_attempts (ip, created_at DESC)
  `);
  initialized = true;
}

export function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
}

export async function recordLoginAttempt(opts: {
  username: string | null | undefined;
  ip: string;
  userAgent?: string;
  success: boolean;
  reason?: string;
}): Promise<void> {
  try {
    await ensureTable();
    await db.execute(sql`
      INSERT INTO admin_login_attempts (username, ip, user_agent, success, reason)
      VALUES (
        ${opts.username ?? null},
        ${opts.ip ?? null},
        ${opts.userAgent ?? null},
        ${opts.success},
        ${opts.reason ?? null}
      )
    `);
  } catch (err) {
    console.warn("[Admin Panel] Failed to record login attempt:", err);
  }
}

export async function listLoginAttempts(opts: {
  page: number;
  limit: number;
  onlyFailed?: boolean;
}): Promise<{ rows: any[]; total: number }> {
  await ensureTable();
  const offset = (opts.page - 1) * opts.limit;
  const where = opts.onlyFailed ? sql`WHERE success = FALSE` : sql``;
  const rows = await db.execute(sql`
    SELECT id, username, ip, user_agent, success, reason, created_at
    FROM admin_login_attempts
    ${where}
    ORDER BY created_at DESC
    LIMIT ${opts.limit} OFFSET ${offset}
  `);
  const count = await db.execute(sql`
    SELECT COUNT(*)::int AS total FROM admin_login_attempts ${where}
  `);
  return {
    rows: rows.rows,
    total: (count.rows[0] as any)?.total ?? 0,
  };
}

export async function getLoginAttemptStats(): Promise<{
  total24h: number;
  failed24h: number;
  uniqueIps24h: number;
  topIps: Array<{ ip: string; failed_count: number }>;
}> {
  await ensureTable();
  const total = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN success = FALSE THEN 1 ELSE 0 END)::int AS failed,
      COUNT(DISTINCT ip)::int AS unique_ips
    FROM admin_login_attempts
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `);
  const top = await db.execute(sql`
    SELECT ip, COUNT(*)::int AS failed_count
    FROM admin_login_attempts
    WHERE success = FALSE AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY ip
    ORDER BY failed_count DESC
    LIMIT 5
  `);
  const row = total.rows[0] as any;
  return {
    total24h: row?.total ?? 0,
    failed24h: row?.failed ?? 0,
    uniqueIps24h: row?.unique_ips ?? 0,
    topIps: top.rows as any,
  };
}
