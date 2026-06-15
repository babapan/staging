import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

router.get("/stats", async (req, res) => {
  const [
    userCount,
    activeUsers,
    suspendedUsers,
    chatroomCount,
    activeChatrooms,
    merchantCount,
    totalCredits,
    recentTx,
    newUsersToday,
    newUsersWeek,
  ] = await Promise.all([
    db.execute(sql`SELECT COUNT(*) as total FROM users`),
    db.execute(sql`SELECT COUNT(*) as total FROM users WHERE is_suspended = false`),
    db.execute(sql`SELECT COUNT(*) as total FROM users WHERE is_suspended = true`),
    db.execute(sql`SELECT COUNT(*) as total FROM chatrooms`),
    db.execute(sql`SELECT COUNT(*) as total FROM chatrooms WHERE status = 1`),
    db.execute(sql`SELECT COUNT(*) as total FROM merchants`),
    db.execute(sql`SELECT SUM(balance) as total, currency FROM credit_accounts GROUP BY currency`),
    db.execute(sql`
      SELECT COUNT(*) as total, SUM(ABS(amount)) as volume
      FROM credit_transactions
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `),
    db.execute(sql`
      SELECT COUNT(*) as total FROM users
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `),
    db.execute(sql`
      SELECT COUNT(*) as total FROM users
      WHERE created_at > NOW() - INTERVAL '7 days'
    `),
  ]);

  const userGrowth = await db.execute(sql`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM users
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  const topCreditUsers = await db.execute(sql`
    SELECT username, balance, currency
    FROM credit_accounts
    ORDER BY balance DESC
    LIMIT 5
  `);

  res.json({
    users: {
      total: parseInt((userCount.rows[0] as any).total),
      active: parseInt((activeUsers.rows[0] as any).total),
      suspended: parseInt((suspendedUsers.rows[0] as any).total),
      newToday: parseInt((newUsersToday.rows[0] as any).total),
      newThisWeek: parseInt((newUsersWeek.rows[0] as any).total),
    },
    chatrooms: {
      total: parseInt((chatroomCount.rows[0] as any).total),
      active: parseInt((activeChatrooms.rows[0] as any).total),
    },
    merchants: {
      total: parseInt((merchantCount.rows[0] as any).total),
    },
    credits: {
      balances: totalCredits.rows,
      recentTransactions: {
        count: parseInt((recentTx.rows[0] as any)?.total || "0"),
        volume: parseFloat((recentTx.rows[0] as any)?.volume || "0"),
      },
    },
    charts: {
      userGrowth: userGrowth.rows,
      topCreditUsers: topCreditUsers.rows,
    },
  });
});

export default router;
