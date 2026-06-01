import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agencies (
      id            SERIAL PRIMARY KEY,
      agency_name   VARCHAR(120) NOT NULL,
      logo_url      TEXT,
      whatsapp      VARCHAR(30) NOT NULL,
      country       VARCHAR(60) NOT NULL,
      member_count  INTEGER NOT NULL DEFAULT 0,
      commission    INTEGER NOT NULL DEFAULT 10,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending',
      notes         TEXT,
      registered_by VARCHAR(60),
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at   TIMESTAMPTZ,
      reviewed_by   VARCHAR(60)
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agencies_status ON agencies (status)`);
  // Safe add for existing tables
  await db.execute(sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS registered_by VARCHAR(60)`).catch(() => {});
  // Commission payments: platform → agency owner
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agency_commission_payments (
      id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id           INTEGER NOT NULL,
      owner_username      TEXT NOT NULL,
      total_host_earned   BIGINT NOT NULL,
      commission_diamonds BIGINT NOT NULL,
      paid_by_admin       TEXT NOT NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  // Add period & type columns (safe for existing tables)
  await db.execute(sql`
    ALTER TABLE agency_commission_payments
      ADD COLUMN IF NOT EXISTS period_start  TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS period_end    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS payment_type  VARCHAR(20) NOT NULL DEFAULT 'manual'
  `).catch(() => {});
  // Payroll run log
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agency_payroll_runs (
      id               SERIAL PRIMARY KEY,
      run_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      period_start     TIMESTAMPTZ NOT NULL,
      period_end       TIMESTAMPTZ NOT NULL,
      agencies_paid    INTEGER     NOT NULL DEFAULT 0,
      total_diamonds   BIGINT      NOT NULL DEFAULT 0,
      triggered_by     VARCHAR(60) NOT NULL DEFAULT 'cron'
    )
  `).catch(() => {});
}
ensureTable().catch(console.error);

// ── GET /api/agencies ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { status = "all", search = "", page = "1", limit = "20" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const statusClause = status !== "all"
    ? sql`AND a.status = ${status}`
    : sql``;
  const searchClause = search
    ? sql`AND a.agency_name ILIKE ${"%" + search + "%"}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT a.id, a.agency_name, a.logo_url, a.whatsapp, a.country, a.member_count,
           a.commission, a.status, a.notes, a.registered_by, a.registered_at, a.reviewed_at, a.reviewed_by,
           COALESCE((
             SELECT SUM(dt.amount)
             FROM agency_hosts ah
             JOIN diamond_transactions dt ON LOWER(dt.username) = LOWER(ah.username)
             WHERE ah.agency_id = a.id AND dt.type = 'GIFT_RECEIVED'
           ), 0) AS total_host_earned
    FROM agencies a
    WHERE 1=1 ${statusClause} ${searchClause}
    ORDER BY registered_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  const countResult = await db.execute(sql`
    SELECT COUNT(*) as total FROM agencies a
    WHERE 1=1 ${statusClause} ${searchClause}
  `);

  const statsResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status='pending')  AS pending,
      COUNT(*) FILTER (WHERE status='approved') AS approved,
      COUNT(*) FILTER (WHERE status='rejected') AS rejected,
      COUNT(*) AS total
    FROM agencies
  `);

  res.json({
    agencies: rows.rows,
    total: parseInt((countResult.rows[0] as any)?.total ?? "0"),
    stats: statsResult.rows[0],
  });
});

// ── GET /api/agencies/export ───────────────────────────────────────────────────
// Admin: export all agencies as CSV
router.get("/export", async (req, res) => {
  const { status = "all" } = req.query as Record<string, string>;
  const statusClause = status !== "all" ? sql`WHERE a.status = ${status}` : sql`WHERE 1=1`;

  try {
    const rows = await db.execute(sql`
      SELECT
        a.id, a.agency_name, a.registered_by, a.whatsapp, a.country,
        a.member_count, a.commission, a.status, a.notes,
        a.agency_code, a.registered_at, a.reviewed_at, a.reviewed_by,
        COALESCE((
          SELECT COUNT(*) FROM agency_hosts ah WHERE ah.agency_id = a.id AND ah.status = 'active'
        ), 0) AS active_hosts,
        COALESCE((
          SELECT SUM(dt.amount)
          FROM agency_hosts ah
          JOIN diamond_transactions dt ON LOWER(dt.username) = LOWER(ah.username)
          WHERE ah.agency_id = a.id AND dt.type = 'GIFT_RECEIVED'
        ), 0) AS total_host_earned,
        COALESCE((
          SELECT SUM(commission_diamonds)
          FROM agency_commission_payments WHERE agency_id = a.id
        ), 0) AS commission_paid
      FROM agencies a
      ${statusClause}
      ORDER BY a.registered_at DESC
    `);

    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('id-ID') : '';
    const escCsv  = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const headers = [
      'ID', 'Agency Name', 'Owner Username', 'Agency Code', 'WhatsApp', 'Country',
      'Status', 'Commission %', 'Member Count', 'Active Hosts',
      'Total Host Earned (Diamond)', 'Commission Paid (Diamond)', 'Commission Owed (Diamond)',
      'Notes', 'Registered At', 'Reviewed At', 'Reviewed By'
    ];

    const lines = [
      headers.join(','),
      ...rows.rows.map((a: any) => {
        const totalEarned = Number(a.total_host_earned ?? 0);
        const commPaid    = Number(a.commission_paid ?? 0);
        const commEarned  = Math.floor(totalEarned * 0.1);
        const commOwed    = Math.max(0, commEarned - commPaid);
        return [
          a.id, a.agency_name, a.registered_by ?? '', a.agency_code ?? '',
          a.whatsapp, a.country, a.status, a.commission, a.member_count,
          a.active_hosts, totalEarned, commPaid, commOwed,
          a.notes ?? '', fmtDate(a.registered_at), fmtDate(a.reviewed_at), a.reviewed_by ?? '',
        ].map(escCsv).join(',');
      })
    ];

    const csvContent = lines.join('\n');
    const filename = `agencies-export-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvContent);
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

// ── GET /api/agencies/join-requests ───────────────────────────────────────────
// Admin: view all join requests (optionally filtered by status)
router.get("/join-requests", async (req, res) => {
  const { status = "pending" } = req.query as Record<string, string>;
  const statusClause = status === "all" ? sql`` : sql`WHERE r.status = ${status}`;
  try {
    const result = await db.execute(sql`
      SELECT r.id, r.username, r.status, r.message, r.requested_at, r.reviewed_at, r.reviewed_by,
             a.agency_name, a.id AS agency_id, a.agency_code
      FROM agency_join_requests r
      JOIN agencies a ON a.id = r.agency_id
      ${statusClause}
      ORDER BY r.requested_at DESC
      LIMIT 200
    `);
    res.json({ requests: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

// ── PATCH /api/agencies/join-requests/:id ─────────────────────────────────────
// Admin: approve or reject a join request
router.patch("/join-requests/:id", async (req, res) => {
  const { status, notes } = req.body as { status: string; notes?: string };
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const adminUser = (req as any).adminUser?.username ?? "admin";
  try {
    const reqRow = await db.execute(sql`
      SELECT r.id, r.username, r.agency_id, a.agency_name
      FROM agency_join_requests r
      JOIN agencies a ON a.id = r.agency_id
      WHERE r.id = ${req.params.id} LIMIT 1
    `);
    if (!reqRow.rows.length) return res.status(404).json({ error: "Request tidak ditemukan" });
    const row = reqRow.rows[0] as any;

    await db.execute(sql`
      UPDATE agency_join_requests
      SET status = ${status}, reviewed_at = NOW(), reviewed_by = ${adminUser}
      WHERE id = ${req.params.id}
    `);

    if (status === 'approved') {
      await db.execute(sql`
        INSERT INTO agency_hosts (agency_id, username, role, status)
        VALUES (${row.agency_id}, ${row.username}, 'host', 'active')
        ON CONFLICT (agency_id, username) DO UPDATE SET status = 'active'
      `);
      await db.execute(sql`
        UPDATE agencies SET member_count = member_count + 1 WHERE id = ${row.agency_id}
      `);
    }

    try {
      const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:5000";
      await fetch(`${BACKEND_URL}/api/agency/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: row.username,
          subject:  status === 'approved' ? "Permintaan Join Disetujui!" : "Permintaan Join Ditolak",
          message:  status === 'approved'
            ? `Selamat! Kamu diterima sebagai host di agency "${row.agency_name}".`
            : `Maaf, permintaan join ke agency "${row.agency_name}" ditolak.${notes ? ' Alasan: ' + notes : ''}`,
        }),
      }).catch(() => {});
    } catch {}

    res.json({ success: true, status });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

// ── GET /api/agencies/:id ─────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const row = await db.execute(sql`SELECT * FROM agencies WHERE id = ${parseInt(req.params.id)} LIMIT 1`);
  if (!row.rows.length) return res.status(404).json({ error: "Agency not found" });
  res.json(row.rows[0]);
});

// ── POST /api/agencies ────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { agency_name, logo_url, whatsapp, country, member_count, commission, notes, registered_by } = req.body;
  if (!agency_name || !whatsapp || !country) {
    return res.status(400).json({ error: "agency_name, whatsapp and country are required" });
  }
  const result = await db.execute(sql`
    INSERT INTO agencies (agency_name, logo_url, whatsapp, country, member_count, commission, notes, registered_by)
    VALUES (${agency_name}, ${logo_url ?? null}, ${whatsapp}, ${country},
            ${parseInt(member_count) || 0}, 10, ${notes ?? null},
            ${registered_by?.trim() || null})
    RETURNING *
  `);
  res.json({ agency: result.rows[0] });
});

// ── POST /api/agencies/send-diamond ──────────────────────────────────────────
// Super Admin only: manually sends diamonds to a user (agency owner).
router.post("/send-diamond", requireSuperAdmin, async (req, res) => {
  const { username, amount, message } = req.body as { username?: string; amount?: number; message?: string };
  const adminUser = (req as any).adminUser?.username ?? "admin";

  if (!username?.trim()) return res.status(400).json({ error: "Username wajib diisi" });
  const diamonds = Math.floor(Number(amount));
  if (!diamonds || diamonds <= 0) return res.status(400).json({ error: "Jumlah diamond harus lebih dari 0" });
  if (diamonds > 10_000_000) return res.status(400).json({ error: "Maksimal 10,000,000 diamond per transfer" });

  // Verify user exists
  const userRow = await db.execute(sql`
    SELECT username, diamond_balance FROM users WHERE LOWER(username) = LOWER(${username.trim()}) LIMIT 1
  `);
  if (!userRow.rows.length) return res.status(404).json({ error: `User "@${username.trim()}" tidak ditemukan` });

  const realUsername = (userRow.rows[0] as any).username as string;
  const refId = `ADMIN-DT-${Date.now()}`;
  const desc  = (message?.trim() || `Transfer diamond dari admin`) + ` (by ${adminUser})`;

  try {
    const updateRes = await db.execute(sql`
      UPDATE users
      SET diamond_balance = COALESCE(diamond_balance, 0) + ${diamonds}
      WHERE LOWER(username) = LOWER(${realUsername})
      RETURNING diamond_balance
    `);
    const newBalance = Number((updateRes.rows[0] as any)?.diamond_balance ?? 0);
    await db.execute(sql`
      INSERT INTO diamond_transactions (username, type, amount, description, reference, running_balance)
      VALUES (${realUsername}, 'ADMIN_TRANSFER', ${diamonds}, ${desc}, ${refId}, ${newBalance})
    `);

    res.json({
      success: true,
      message: `💎 ${diamonds.toLocaleString('id-ID')} berhasil dikirim ke @${realUsername}`,
      username: realUsername,
      diamondsSent: diamonds,
      newBalance,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

// ── PATCH /api/agencies/:id/status ───────────────────────────────────────────
router.patch("/:id/status", async (req, res) => {
  const { status, notes } = req.body as { status: string; notes?: string };
  const adminUser = (req as any).adminUser?.username ?? "admin";
  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  // Fetch agency first to get registered_by and name
  const agencyRow = await db.execute(sql`
    SELECT agency_name, registered_by FROM agencies WHERE id = ${parseInt(req.params.id)} LIMIT 1
  `);
  const agency = agencyRow.rows[0] as any;

  await db.execute(sql`
    UPDATE agencies
    SET status = ${status}, notes = ${notes ?? null},
        reviewed_at = NOW(), reviewed_by = ${adminUser}
    WHERE id = ${parseInt(req.params.id)}
  `);

  // Send in-app notification to the user who registered (if we have their username)
  if (agency?.registered_by) {
    const username = agency.registered_by as string;
    const agencyName = agency.agency_name as string;

    let message = "";
    if (status === "approved") {
      message = `Selamat! Pendaftaran agency "${agencyName}" kamu telah disetujui. Kamu sekarang resmi menjadi partner agency max99.`;
    } else if (status === "rejected") {
      const reason = notes?.trim() ? ` Alasan: ${notes.trim()}` : "";
      message = `Maaf, pendaftaran agency "${agencyName}" tidak dapat kami setujui saat ini.${reason}`;
    } else {
      message = `Status pendaftaran agency "${agencyName}" telah diperbarui menjadi: ${status}.`;
    }

    // Call main backend (port 5000) to enqueue the in-app notification
    const backendUrl = process.env.MAIN_BACKEND_URL ?? "http://127.0.0.1:5000";
    fetch(`${backendUrl}/api/agency/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, subject: "max99 official", message }),
    }).catch((err: Error) => console.error("[agency-notify] Failed to send notification:", err.message));
  }

  res.json({ success: true });
});

// ── PATCH /api/agencies/:id ───────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const { agency_name, logo_url, whatsapp, country, member_count, commission, notes, registered_by } = req.body;
  await db.execute(sql`
    UPDATE agencies
    SET agency_name  = COALESCE(${agency_name ?? null}, agency_name),
        logo_url     = COALESCE(${logo_url ?? null}, logo_url),
        whatsapp     = COALESCE(${whatsapp ?? null}, whatsapp),
        country      = COALESCE(${country ?? null}, country),
        member_count = COALESCE(${member_count != null ? parseInt(member_count) : null}, member_count),
        commission   = 10,
        notes        = COALESCE(${notes ?? null}, notes),
        registered_by = COALESCE(${registered_by?.trim() || null}, registered_by)
    WHERE id = ${parseInt(req.params.id)}
  `);
  res.json({ success: true });
});

// ── DELETE /api/agencies/:id ──────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  await db.execute(sql`DELETE FROM agencies WHERE id = ${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ── GET /api/agencies/:id/hosts ───────────────────────────────────────────────
// Returns all hosts + commission stats for an agency (admin view)
router.get("/:id/hosts", async (req, res) => {
  const agencyId = parseInt(req.params.id, 10);
  if (isNaN(agencyId)) return res.status(400).json({ error: "Invalid agency ID" });

  try {
    // Get agency owner username
    const agRes = await db.execute(sql`
      SELECT registered_by, agency_name FROM agencies WHERE id = ${agencyId} LIMIT 1
    `);
    const ownerUsername = (agRes.rows[0] as any)?.registered_by ?? null;

    const hostsRes = await db.execute(sql`
      SELECT
        h.username, h.role, h.status, h.added_at,
        COALESCE(SUM(CASE WHEN dt.type = 'GIFT_RECEIVED' THEN dt.amount ELSE 0 END), 0) AS total_earned,
        up.display_picture AS avatar_url,
        COALESCE((
          SELECT ROUND(EXTRACT(EPOCH FROM SUM(
            CASE WHEN r.is_active THEN NOW() - r.created_at
                 ELSE r.updated_at - r.created_at END
          ))/3600, 1)
          FROM party_rooms r
          WHERE LOWER(r.creator_username) = LOWER(h.username)
        ), 0) AS party_hours,
        COALESCE((
          SELECT COUNT(*) FROM party_rooms r
          WHERE LOWER(r.creator_username) = LOWER(h.username)
        ), 0) AS party_count
      FROM agency_hosts h
      LEFT JOIN users u ON LOWER(u.username) = LOWER(h.username)
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN diamond_transactions dt
        ON LOWER(dt.username) = LOWER(h.username) AND dt.type = 'GIFT_RECEIVED'
      WHERE h.agency_id = ${agencyId}
      GROUP BY h.username, h.role, h.status, h.added_at, up.display_picture
      ORDER BY total_earned DESC
    `);

    const hosts = hostsRes.rows.map((r: any) => ({
      username:     r.username,
      role:         r.role,
      status:       r.status,
      added_at:     r.added_at,
      total_earned: Number(r.total_earned ?? 0),
      avatar_url:   r.avatar_url ?? null,
      party_hours:  Number(r.party_hours ?? 0),
      party_count:  Number(r.party_count ?? 0),
    }));

    const totalEarned      = hosts.reduce((a, h) => a + h.total_earned, 0);
    const commissionEarned = Math.floor(totalEarned * 0.1);

    const commPaidRes = await db.execute(sql`
      SELECT COALESCE(SUM(commission_diamonds), 0) AS total_paid
      FROM agency_commission_payments WHERE agency_id = ${agencyId}
    `);
    const commissionPaid = Number((commPaidRes.rows[0] as any)?.total_paid ?? 0);
    const commissionOwed = Math.max(0, commissionEarned - commissionPaid);

    res.json({ hosts, totalEarned, commissionEarned, commissionPaid, commissionOwed, ownerUsername });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

// ── POST /api/agencies/:id/pay-commission ─────────────────────────────────────
// Admin pays agency commission (10% of host earnings) to agency owner's diamond balance
router.post("/:id/pay-commission", async (req, res) => {
  const agencyId = parseInt(req.params.id, 10);
  if (isNaN(agencyId)) return res.status(400).json({ error: "Invalid agency ID" });

  try {
    const agRes = await db.execute(sql`
      SELECT id, registered_by, agency_name FROM agencies WHERE id = ${agencyId} LIMIT 1
    `);
    if (!agRes.rows.length) return res.status(404).json({ error: "Agency tidak ditemukan" });
    const ownerUsername = (agRes.rows[0] as any).registered_by as string | null;
    const agencyName    = (agRes.rows[0] as any).agency_name as string;
    if (!ownerUsername) return res.status(400).json({ error: "Agency belum memiliki owner username (registered_by kosong)" });

    // Total host earnings
    const earnedRes = await db.execute(sql`
      SELECT COALESCE(SUM(dt.amount), 0) AS total_earned
      FROM agency_hosts h
      JOIN diamond_transactions dt ON LOWER(dt.username) = LOWER(h.username) AND dt.type = 'GIFT_RECEIVED'
      WHERE h.agency_id = ${agencyId}
    `);
    const totalEarned      = Number((earnedRes.rows[0] as any)?.total_earned ?? 0);
    const commissionEarned = Math.floor(totalEarned * 0.1);

    const commPaidRes = await db.execute(sql`
      SELECT COALESCE(SUM(commission_diamonds), 0) AS total_paid
      FROM agency_commission_payments WHERE agency_id = ${agencyId}
    `);
    const commissionPaid = Number((commPaidRes.rows[0] as any)?.total_paid ?? 0);
    const commissionOwed = Math.max(0, commissionEarned - commissionPaid);

    if (commissionOwed <= 0) {
      return res.status(400).json({ error: "Tidak ada komisi yang perlu dibayar untuk agency ini." });
    }

    const adminUser = (req as any).adminUser?.username ?? "admin";
    const refId = `COMM-${agencyId}-${Date.now()}`;

    // Credit diamonds to agency owner — pakai RETURNING agar running_balance akurat
    const commUpdateRes = await db.execute(sql`
      UPDATE users SET diamond_balance = COALESCE(diamond_balance, 0) + ${commissionOwed}
      WHERE LOWER(username) = LOWER(${ownerUsername})
      RETURNING diamond_balance
    `);
    const commNewBalance = Number((commUpdateRes.rows[0] as any)?.diamond_balance ?? 0);
    await db.execute(sql`
      INSERT INTO diamond_transactions (username, type, amount, description, reference, running_balance)
      VALUES (${ownerUsername}, 'AGENCY_COMMISSION', ${commissionOwed},
        ${'Komisi agency ' + agencyName + ': 💎 ' + commissionOwed.toLocaleString('id-ID')}, ${refId}, ${commNewBalance})
    `);
    await db.execute(sql`
      INSERT INTO agency_commission_payments (agency_id, owner_username, total_host_earned, commission_diamonds, paid_by_admin, payment_type)
      VALUES (${agencyId}, ${ownerUsername}, ${totalEarned}, ${commissionOwed}, ${adminUser}, 'manual')
    `);

    // Kirim notifikasi WS real-time ke owner agency
    const backendUrl = process.env.MAIN_BACKEND_URL ?? "http://127.0.0.1:5000";
    fetch(`${backendUrl}/api/agency/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ownerUsername,
        subject: "💰 Komisi Agency Masuk!",
        message: `Admin telah membayar komisi agency "${agencyName}" sebesar 💎 ${commissionOwed.toLocaleString('id-ID')}. Cek balance diamond kamu!`,
      }),
    }).catch(() => {});

    res.json({
      success: true,
      message: `Komisi 💎 ${commissionOwed.toLocaleString('id-ID')} berhasil dikirim ke @${ownerUsername}`,
      commissionPaid: commissionOwed,
      ownerUsername,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

// ── GET /api/agencies/payroll/summary ─────────────────────────────────────────
// Per-agency all-time earnings + commission summary (for admin overview)
router.get("/payroll/summary", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        a.id AS agency_id,
        a.agency_name,
        a.registered_by AS owner_username,
        a.commission AS commission_pct,
        COALESCE((
          SELECT SUM(dt.amount)
          FROM agency_hosts ah
          JOIN diamond_transactions dt ON LOWER(dt.username) = LOWER(ah.username)
          WHERE ah.agency_id = a.id AND dt.type = 'GIFT_RECEIVED' AND ah.status = 'active'
        ), 0) AS total_host_earned,
        COALESCE((
          SELECT SUM(cp.commission_diamonds)
          FROM agency_commission_payments cp
          WHERE cp.agency_id = a.id
        ), 0) AS commission_paid,
        COALESCE((
          SELECT COUNT(*) FROM agency_hosts ah WHERE ah.agency_id = a.id AND ah.status = 'active'
        ), 0) AS active_hosts
      FROM agencies a
      WHERE a.status = 'approved'
      ORDER BY total_host_earned DESC
    `);

    const agencies = (rows.rows as any[]).map(r => {
      const totalEarned     = Number(r.total_host_earned ?? 0);
      const commPct         = Number(r.commission_pct ?? 10);
      const commissionTotal = Math.floor(totalEarned * commPct / 100);
      const commissionPaid  = Number(r.commission_paid ?? 0);
      const commissionOwed  = Math.max(0, commissionTotal - commissionPaid);
      return {
        agency_id:       Number(r.agency_id),
        agency_name:     r.agency_name,
        owner_username:  r.owner_username ?? null,
        commission_pct:  commPct,
        active_hosts:    Number(r.active_hosts ?? 0),
        total_host_earned: totalEarned,
        commission_total:  commissionTotal,
        commission_paid:   commissionPaid,
        commission_owed:   commissionOwed,
      };
    });

    const totals = {
      total_host_earned:  agencies.reduce((s, a) => s + a.total_host_earned, 0),
      commission_total:   agencies.reduce((s, a) => s + a.commission_total, 0),
      commission_paid:    agencies.reduce((s, a) => s + a.commission_paid, 0),
      commission_owed:    agencies.reduce((s, a) => s + a.commission_owed, 0),
    };

    res.json({ agencies, totals });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

// ── GET /api/agencies/payroll/manual-history ───────────────────────────────────
// History semua pembayaran manual + auto per-agency
router.get("/payroll/manual-history", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        cp.id,
        cp.agency_id,
        a.agency_name,
        cp.owner_username,
        cp.total_host_earned,
        cp.commission_diamonds,
        cp.paid_by_admin,
        cp.payment_type,
        cp.period_start,
        cp.period_end,
        cp.created_at
      FROM agency_commission_payments cp
      LEFT JOIN agencies a ON a.id = cp.agency_id
      ORDER BY cp.created_at DESC
      LIMIT 200
    `);
    res.json({ payments: rows.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

// ── GET /api/agencies/payroll/history ─────────────────────────────────────────
// Proxy ke main backend untuk riwayat payroll run
router.get("/payroll/history", async (_req, res) => {
  const backendUrl = process.env.MAIN_BACKEND_URL ?? "http://127.0.0.1:5000";
  try {
    const r = await fetch(`${backendUrl}/api/agency/payroll/history`);
    const d = await r.json() as any;
    res.json(d);
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Failed to fetch payroll history" });
  }
});

// ── GET /api/agencies/payroll/current-week ────────────────────────────────────
// Data minggu berjalan per agency (Senin → sekarang) + minggu lalu (untuk referensi)
router.get("/payroll/current-week", async (_req, res) => {
  const backendUrl = process.env.MAIN_BACKEND_URL ?? "http://127.0.0.1:5000";
  try {
    const r = await fetch(`${backendUrl}/api/agency/payroll/current-week`);
    const d = await r.json() as any;
    res.json(d);
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Failed to fetch current week data" });
  }
});

// ── GET /api/agencies/payroll/weekly-detail ────────────────────────────────────
// Proxy ke main backend untuk detail mingguan per-agency
router.get("/payroll/weekly-detail", async (_req, res) => {
  const backendUrl = process.env.MAIN_BACKEND_URL ?? "http://127.0.0.1:5000";
  try {
    const r = await fetch(`${backendUrl}/api/agency/payroll/weekly-detail`);
    const d = await r.json() as any;
    res.json(d);
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Failed to fetch weekly payroll detail" });
  }
});

// ── POST /api/agencies/payroll/run ────────────────────────────────────────────
// Proxy ke main backend untuk manual trigger payroll
router.post("/payroll/run", async (req, res) => {
  const backendUrl = process.env.MAIN_BACKEND_URL ?? "http://127.0.0.1:5000";
  const adminUser  = (req as any).adminUser?.username ?? "admin";
  try {
    const r = await fetch(`${backendUrl}/api/agency/payroll/run`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ triggeredBy: `admin:${adminUser}` }),
    });
    const d = await r.json() as any;
    res.status(r.status).json(d);
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Failed to run payroll" });
  }
});

// ── POST /api/agencies/payroll/snapshot-today ─────────────────────────────────
// Trigger manual snapshot pendapatan harian hari ini
router.post("/payroll/snapshot-today", async (_req, res) => {
  const backendUrl = process.env.MAIN_BACKEND_URL ?? "http://127.0.0.1:5000";
  try {
    const r = await fetch(`${backendUrl}/api/agency/payroll/snapshot-today`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const d = await r.json() as any;
    res.status(r.status).json(d);
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Failed to run snapshot" });
  }
});

// ── GET /api/agencies/payroll/daily-earnings ──────────────────────────────────
// Pendapatan harian 30 hari terakhir per agency (untuk grafik & tabel harian)
router.get("/payroll/daily-earnings", async (req, res) => {
  const days      = Math.min(parseInt((req.query.days as string) ?? "30", 10), 90);
  const agencyId  = req.query.agency_id ? parseInt(req.query.agency_id as string, 10) : null;

  try {
    const agencyClause = agencyId ? sql`AND de.agency_id = ${agencyId}` : sql``;

    const rows = await db.execute(sql`
      SELECT
        de.agency_id,
        de.agency_name,
        de.owner_username,
        de.earn_date,
        de.total_host_earned,
        de.commission_diamonds,
        de.commission_pct,
        de.host_count,
        de.snapshot_at
      FROM agency_daily_earnings de
      WHERE de.earn_date >= CURRENT_DATE - ${days}::INTEGER
        ${agencyClause}
      ORDER BY de.earn_date DESC, de.total_host_earned DESC
    `);

    // Aggregate per-date totals
    const byDate: Record<string, { date: string; total_earned: number; total_commission: number; agency_count: number }> = {};
    for (const r of rows.rows as any[]) {
      const d = r.earn_date instanceof Date
        ? r.earn_date.toISOString().split("T")[0]
        : String(r.earn_date).split("T")[0];
      if (!byDate[d]) byDate[d] = { date: d, total_earned: 0, total_commission: 0, agency_count: 0 };
      byDate[d].total_earned    += Number(r.total_host_earned ?? 0);
      byDate[d].total_commission += Number(r.commission_diamonds ?? 0);
      byDate[d].agency_count    += 1;
    }
    const dailySummary = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));

    res.json({
      rows: rows.rows,
      daily_summary: dailySummary,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

export default router;
