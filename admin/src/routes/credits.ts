import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireSuperAdmin } from "../auth.js";
import { randomUUID } from "crypto";

const router = Router();
router.use(requireSuperAdmin);

router.get("/accounts", async (req, res) => {
  const { page = "1", limit = "20", search = "" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const searchClause = search
    ? sql`AND username ILIKE ${"%" + search + "%"}`
    : sql``;

  const accounts = await db.execute(sql`
    SELECT id, username, currency, balance, funded_balance, updated_at
    FROM credit_accounts
    WHERE 1=1 ${searchClause}
    ORDER BY balance DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  const count = await db.execute(sql`
    SELECT COUNT(*) as total FROM credit_accounts WHERE 1=1 ${searchClause}
  `);

  res.json({
    accounts: accounts.rows,
    total: parseInt((count.rows[0] as any).total),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

router.get("/transactions", async (req, res) => {
  const { page = "1", limit = "20", username = "" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const userClause = username
    ? sql`AND username = ${username}`
    : sql``;

  const txs = await db.execute(sql`
    SELECT id, username, type, reference, description, currency, amount, funded_amount, tax, running_balance, created_at
    FROM credit_transactions
    WHERE 1=1 ${userClause}
    ORDER BY created_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  const count = await db.execute(sql`
    SELECT COUNT(*) as total FROM credit_transactions WHERE 1=1 ${userClause}
  `);

  res.json({
    transactions: txs.rows,
    total: parseInt((count.rows[0] as any).total),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

router.get("/vouchers", async (req, res) => {
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const vouchers = await db.execute(sql`
    SELECT v.id, v.code, v.currency, v.amount, v.status, v.redeemed_by_username, v.expiry_date, v.updated_at,
           vb.created_by_username as batch_creator, vb.notes as batch_notes
    FROM vouchers v
    LEFT JOIN voucher_batches vb ON vb.id = v.voucher_batch_id
    ORDER BY v.updated_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `);

  const count = await db.execute(sql`SELECT COUNT(*) as total FROM vouchers`);

  res.json({
    vouchers: vouchers.rows,
    total: parseInt((count.rows[0] as any).total),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

function adminDateStr(): string {
  const now = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
  const mm   = months[now.getMonth()];
  const yyyy = now.getFullYear();
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');
  return `${dd} ${mm} ${yyyy} ${hh}:${min}`;
}

router.post("/add", async (req, res) => {
  const { username, amount, currency, description } = req.body as {
    username?: string;
    amount?: number;
    currency?: string;
    description?: string;
  };

  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "Username wajib diisi" });
  }
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Jumlah kredit harus lebih dari 0" });
  }

  const uname = username.trim();
  const adminUsername = (req as any).adminUser?.username || "admin";
  const extraNote = description?.trim() ? ` | ${description.trim()}` : "";
  const note = `Administrator ${adminUsername} transfer credit to ${uname} ${parsedAmount} — ${adminDateStr()}${extraNote}`;

  try {
    const userCheck = await db.execute(sql`SELECT username FROM users WHERE username = ${uname} LIMIT 1`);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: `User "${uname}" tidak ditemukan` });
    }

    const existing = await db.execute(sql`SELECT currency, balance FROM credit_accounts WHERE username = ${uname} LIMIT 1`);

    let resolvedCurrency: string;
    let newBalance: number;

    if (existing.rows.length === 0) {
      resolvedCurrency = currency || "IDR";
      newBalance = Math.round(parsedAmount * 100) / 100;
      await db.execute(sql`
        INSERT INTO credit_accounts (id, username, currency, balance, funded_balance, updated_at)
        VALUES (${randomUUID()}, ${uname}, ${resolvedCurrency}, ${newBalance}, ${newBalance}, NOW())
      `);
    } else {
      const row = existing.rows[0] as any;
      resolvedCurrency = currency || row.currency;
      newBalance = Math.round((parseFloat(row.balance) + parsedAmount) * 100) / 100;
      await db.execute(sql`
        UPDATE credit_accounts
        SET balance = ${newBalance}, funded_balance = funded_balance + ${parsedAmount}, updated_at = NOW()
        WHERE username = ${uname}
      `);
    }

    const ref = `TOPUP-${Date.now()}`;
    await db.execute(sql`
      INSERT INTO credit_transactions (id, username, type, reference, description, currency, amount, funded_amount, tax, running_balance, created_at)
      VALUES (${randomUUID()}, ${uname}, 9, ${ref}, ${note}, ${resolvedCurrency}, ${parsedAmount}, ${parsedAmount}, 0, ${newBalance}, NOW())
    `);

    res.json({ success: true, username: uname, added: parsedAmount, newBalance, currency: resolvedCurrency });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/transfer-all", async (req, res) => {
  const { amount, currency, description } = req.body as {
    amount?: number;
    currency?: string;
    description?: string;
  };

  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Jumlah kredit harus lebih dari 0" });
  }

  const adminUsername = (req as any).adminUser?.username || "admin";
  const extraNote = description?.trim() ? ` | ${description.trim()}` : "";
  const note = `Administrator ${adminUsername} transfer credit to all users ${parsedAmount} — ${adminDateStr()}${extraNote}`;
  const ref = `TOPUP-BROADCAST-${Date.now()}`;

  try {
    const accounts = await db.execute(sql`SELECT username, currency, balance FROM credit_accounts`);

    let successCount = 0;
    let failCount = 0;

    for (const row of accounts.rows as any[]) {
      try {
        const resolvedCurrency = currency || row.currency;
        const newBalance = Math.round((parseFloat(row.balance) + parsedAmount) * 100) / 100;

        await db.execute(sql`
          UPDATE credit_accounts
          SET balance = ${newBalance}, funded_balance = funded_balance + ${parsedAmount}, updated_at = NOW()
          WHERE username = ${row.username}
        `);

        await db.execute(sql`
          INSERT INTO credit_transactions (id, username, type, reference, description, currency, amount, funded_amount, tax, running_balance, created_at)
          VALUES (${randomUUID()}, ${row.username}, 9, ${ref}, ${note}, ${resolvedCurrency}, ${parsedAmount}, ${parsedAmount}, 0, ${newBalance}, NOW())
        `);

        successCount++;
      } catch {
        failCount++;
      }
    }

    res.json({ success: true, totalProcessed: accounts.rows.length, successCount, failCount, amount: parsedAmount });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /balance/:username ────────────────────────────────────────────────────
// Returns current IDR balance for a specific user (for admin preview before deduct)
router.get("/balance/:username", async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) return res.status(400).json({ error: "Username wajib diisi" });

  const userCheck = await db.execute(sql`SELECT username FROM users WHERE username = ${username} LIMIT 1`);
  if (userCheck.rows.length === 0) return res.status(404).json({ error: `User "${username}" tidak ditemukan` });

  const account = await db.execute(sql`SELECT currency, balance FROM credit_accounts WHERE username = ${username} LIMIT 1`);
  if (account.rows.length === 0) return res.json({ username, balance: 0, currency: "IDR" });

  const row = account.rows[0] as any;
  res.json({ username, balance: parseFloat(row.balance), currency: row.currency });
});

// ── POST /deduct ──────────────────────────────────────────────────────────────
// Deduct (tarik) IDR from a user's balance — used to recover accidental transfers
router.post("/deduct", async (req, res) => {
  const { username, amount, description } = req.body as {
    username?: string;
    amount?: number;
    description?: string;
  };

  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "Username wajib diisi" });
  }
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Jumlah harus lebih dari 0" });
  }

  const uname = username.trim();
  const adminUsername = (req as any).adminUser?.username || "admin";
  const extraNote = description?.trim() ? ` | ${description.trim()}` : "";
  const note = `Administrator ${adminUsername} deduct credit from ${uname} ${parsedAmount} — ${adminDateStr()}${extraNote}`;

  try {
    const userCheck = await db.execute(sql`SELECT username FROM users WHERE username = ${uname} LIMIT 1`);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: `User "${uname}" tidak ditemukan` });
    }

    const existing = await db.execute(sql`SELECT currency, balance FROM credit_accounts WHERE username = ${uname} LIMIT 1`);
    if (existing.rows.length === 0) {
      return res.status(400).json({ error: `User "${uname}" belum memiliki akun kredit` });
    }

    const row = existing.rows[0] as any;
    const currentBalance = parseFloat(row.balance);
    if (currentBalance < parsedAmount) {
      return res.status(400).json({
        error: `Saldo tidak cukup. Saldo saat ini: ${currentBalance.toFixed(2)} ${row.currency}`,
      });
    }

    const newBalance = Math.round((currentBalance - parsedAmount) * 100) / 100;
    await db.execute(sql`
      UPDATE credit_accounts
      SET balance = ${newBalance}, updated_at = NOW()
      WHERE username = ${uname}
    `);

    const ref = `DEDUCT-${Date.now()}`;
    // type 22 = ADMIN_DEDUCT (custom admin operation)
    await db.execute(sql`
      INSERT INTO credit_transactions (id, username, type, reference, description, currency, amount, funded_amount, tax, running_balance, created_at)
      VALUES (${randomUUID()}, ${uname}, 22, ${ref}, ${note}, ${row.currency}, ${-parsedAmount}, ${-parsedAmount}, 0, ${newBalance}, NOW())
    `);

    res.json({
      success: true,
      username: uname,
      deducted: parsedAmount,
      previousBalance: currentBalance,
      newBalance,
      currency: row.currency,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /user-history/:username ──────────────────────────────────────────────
// Returns credit transactions + gifts received for a specific user
router.get("/user-history/:username", async (req, res) => {
  const { username } = req.params;
  const { page = "1", limit = "40" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [txs, txCount, giftsReceived] = await Promise.all([
    db.execute(sql`
      SELECT id, type, reference, description, currency, amount, tax, running_balance, created_at
      FROM credit_transactions
      WHERE username = ${username}
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT COUNT(*) as total FROM credit_transactions WHERE username = ${username}
    `),
    db.execute(sql`
      SELECT vgr.id, vgr.sender, vgr.message, vgr.created_at,
             vg.name as gift_name, vg.price as gift_price, vg.currency as gift_currency
      FROM virtual_gifts_received vgr
      LEFT JOIN virtual_gifts vg ON vg.id = vgr.virtual_gift_id
      WHERE vgr.username = ${username}
      ORDER BY vgr.created_at DESC
      LIMIT 100
    `),
  ]);

  res.json({
    transactions: txs.rows,
    total: parseInt((txCount.rows[0] as any).total),
    giftsReceived: giftsReceived.rows,
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

// ── GET /admin-logs ───────────────────────────────────────────────────────────
// Returns recent admin-initiated credit actions (transfer / deduct / broadcast)
router.get("/admin-logs", async (req, res) => {
  const { page = "1", limit = "30" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [logs, countResult] = await Promise.all([
    db.execute(sql`
      SELECT id, username, type, reference, description, currency, amount, running_balance, created_at
      FROM credit_transactions
      WHERE description LIKE 'Administrator %'
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT COUNT(*) as total FROM credit_transactions WHERE description LIKE 'Administrator %'
    `),
  ]);

  res.json({
    logs: logs.rows,
    total: parseInt((countResult.rows[0] as any).total),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

export default router;
