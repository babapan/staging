import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

const BACKEND_URL = process.env.MAIN_BACKEND_URL ?? "http://127.0.0.1:5000";

async function notifyBackend(username: string, subject: string, message: string): Promise<void> {
  await fetch(`${BACKEND_URL}/api/agency/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, subject, message }),
  }).catch(() => {});
}

async function wsNotify(params: {
  username: string; status: string; refId: string;
  amount: number; idrValue: number; bankName: string;
  accountNumber: string; accountName: string; notes?: string | null;
}): Promise<void> {
  await fetch(`${BACKEND_URL}/api/diamonds/ws-notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}

// ── GET /api/withdrawals ───────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { status = "all", search = "", page = "1", limit = "30" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const statusClause = status !== "all" ? sql`AND wr.status = ${status}` : sql``;
  const searchClause = search ? sql`AND LOWER(wr.username) LIKE LOWER(${"%" + search + "%"})` : sql``;

  const rows = await db.execute(sql`
    SELECT
      wr.id, wr.ref_id, wr.username, wr.agent_name,
      wr.amount, wr.idr_value,
      wr.bank_name, wr.account_number, wr.account_name,
      wr.status, wr.notes,
      wr.created_at, wr.processed_at, wr.processed_by,
      u.display_name
    FROM withdraw_requests wr
    LEFT JOIN users u ON LOWER(u.username) = LOWER(wr.username)
    WHERE 1=1 ${statusClause} ${searchClause}
    ORDER BY wr.created_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  const countResult = await db.execute(sql`
    SELECT COUNT(*) AS total FROM withdraw_requests wr
    WHERE 1=1 ${statusClause} ${searchClause}
  `);

  const statsResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
      COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
      COUNT(*) AS total,
      COALESCE(SUM(idr_value) FILTER (WHERE status = 'pending'), 0)  AS pending_idr,
      COALESCE(SUM(idr_value) FILTER (WHERE status = 'approved'), 0) AS approved_idr
    FROM withdraw_requests
  `);

  res.json({
    requests: rows.rows,
    total: parseInt((countResult.rows[0] as any)?.total ?? "0"),
    stats: statsResult.rows[0],
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

// ── GET /api/withdrawals/:id ───────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const row = await db.execute(sql`
    SELECT wr.*, u.display_name
    FROM withdraw_requests wr
    LEFT JOIN users u ON LOWER(u.username) = LOWER(wr.username)
    WHERE wr.id = ${req.params.id} LIMIT 1
  `);
  if (!row.rows.length) return res.status(404).json({ error: "Tidak ditemukan" });
  res.json(row.rows[0]);
});

// ── PATCH /api/withdrawals/:id/approve ────────────────────────────────────────
router.patch("/:id/approve", async (req, res) => {
  const adminUser = (req as any).adminUser?.username ?? "admin";
  const { notes } = req.body as { notes?: string };

  try {
    const existing = await db.execute(sql`SELECT * FROM withdraw_requests WHERE id = ${req.params.id} LIMIT 1`);
    if (!existing.rows.length) return res.status(404).json({ error: "Request tidak ditemukan" });
    const wr = existing.rows[0] as any;

    if (wr.status !== "pending") {
      return res.status(400).json({ error: `Request sudah ${wr.status}, tidak bisa diubah lagi` });
    }

    await db.execute(sql`
      UPDATE withdraw_requests
      SET status = 'approved', notes = ${notes ?? null},
          processed_at = NOW(), processed_by = ${adminUser}
      WHERE id = ${req.params.id}
    `);

    const amt     = Number(wr.amount);
    const idrVal  = Number(wr.idr_value);
    const amtFmt  = amt.toLocaleString('id-ID');
    const idrFmt  = idrVal.toLocaleString('id-ID');

    // WS real-time notification (user langsung terima event kalau online)
    await wsNotify({
      username: wr.username, status: "approved", refId: wr.ref_id,
      amount: amt, idrValue: idrVal,
      bankName: wr.bank_name, accountNumber: wr.account_number, accountName: wr.account_name,
      notes: notes?.trim() || null,
    });

    // In-app notification (tersimpan di DB, muncul di kotak notif user)
    await notifyBackend(
      wr.username,
      "Withdraw Disetujui ✅",
      `Permintaan withdraw 💎 ${amtFmt} = Rp ${idrFmt} ke ${wr.bank_name} ${wr.account_number} a/n ${wr.account_name} telah DISETUJUI. Dana akan ditransfer dalam 1x24 jam.${notes ? ' Catatan: ' + notes : ''}`,
    );

    res.json({ success: true, status: "approved" });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

// ── PATCH /api/withdrawals/:id/reject ─────────────────────────────────────────
router.patch("/:id/reject", async (req, res) => {
  const adminUser = (req as any).adminUser?.username ?? "admin";
  const { notes } = req.body as { notes?: string };

  try {
    const existing = await db.execute(sql`SELECT * FROM withdraw_requests WHERE id = ${req.params.id} LIMIT 1`);
    if (!existing.rows.length) return res.status(404).json({ error: "Request tidak ditemukan" });
    const wr = existing.rows[0] as any;

    if (wr.status !== "pending") {
      return res.status(400).json({ error: `Request sudah ${wr.status}, tidak bisa diubah lagi` });
    }

    // Kembalikan diamond ke user
    const updateRes = await db.execute(sql`
      UPDATE users
      SET diamond_balance = COALESCE(diamond_balance, 0) + ${Number(wr.amount)}
      WHERE LOWER(username) = LOWER(${wr.username})
      RETURNING diamond_balance
    `);
    const newBalance = Number((updateRes.rows[0] as any)?.diamond_balance ?? 0);

    // Catat transaksi pengembalian
    const refundRef = `WD-REFUND-${wr.ref_id}`;
    await db.execute(sql`
      INSERT INTO diamond_transactions (username, type, amount, description, reference, running_balance)
      VALUES (
        ${wr.username}, 'WITHDRAW_REFUND', ${Number(wr.amount)},
        ${'Refund withdraw ' + wr.ref_id + ' (ditolak admin: ' + adminUser + ')' + (notes ? ' — ' + notes : '')},
        ${refundRef}, ${newBalance}
      )
    `);

    await db.execute(sql`
      UPDATE withdraw_requests
      SET status = 'rejected', notes = ${notes ?? null},
          processed_at = NOW(), processed_by = ${adminUser}
      WHERE id = ${req.params.id}
    `);

    const amt    = Number(wr.amount);
    const idrVal = Number(wr.idr_value);
    const amtFmt = amt.toLocaleString('id-ID');
    const idrFmt = idrVal.toLocaleString('id-ID');

    // WS real-time notification
    await wsNotify({
      username: wr.username, status: "rejected", refId: wr.ref_id,
      amount: amt, idrValue: idrVal,
      bankName: wr.bank_name, accountNumber: wr.account_number, accountName: wr.account_name,
      notes: notes?.trim() || null,
    });

    // In-app notification
    await notifyBackend(
      wr.username,
      "Withdraw Ditolak ❌",
      `Permintaan withdraw 💎 ${amtFmt} = Rp ${idrFmt} telah DITOLAK${notes ? '. Alasan: ' + notes : ''}. Diamond sudah dikembalikan ke saldo kamu.`,
    );

    res.json({ success: true, status: "rejected", diamondRefunded: amt });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

export default router;
