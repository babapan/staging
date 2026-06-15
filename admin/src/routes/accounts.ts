import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";
import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const router = Router();
router.use(requireAdmin);

router.get("/lookup", async (req, res) => {
  const { username } = req.query as { username?: string };

  if (!username || !username.trim()) {
    return res.status(400).json({ error: "Username wajib diisi" });
  }

  const uname = username.trim();

  try {
    const result = await db.execute(sql`
      SELECT
        u.id, u.username, u.display_name, u.email, u.email_verified,
        u.is_admin, u.is_suspended, u.created_at,
        p.mig_level, p.country, p.display_picture,
        CASE WHEN u.transfer_pin IS NOT NULL THEN true ELSE false END as has_pin,
        ca.balance, ca.currency
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN credit_accounts ca ON ca.username = u.username
      WHERE u.username = ${uname}
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `User "${uname}" tidak ditemukan` });
    }

    res.json({ user: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/change-password", async (req, res) => {
  const { username, newPassword } = req.body as { username?: string; newPassword?: string };

  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "Username wajib diisi" });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Password baru minimal 6 karakter" });
  }

  const uname = username.trim();

  try {
    const userCheck = await db.execute(sql`SELECT id FROM users WHERE username = ${uname} LIMIT 1`);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: `User "${uname}" tidak ditemukan` });
    }

    const hashed = await hashPassword(newPassword);
    await db.execute(sql`UPDATE users SET password = ${hashed} WHERE username = ${uname}`);

    res.json({ success: true, username: uname, message: "Password berhasil diubah" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/change-pin", async (req, res) => {
  const { username, newPin } = req.body as { username?: string; newPin?: string };

  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "Username wajib diisi" });
  }
  if (!newPin || !/^\d{4,6}$/.test(newPin)) {
    return res.status(400).json({ error: "PIN harus berupa 4-6 digit angka" });
  }

  const uname = username.trim();

  try {
    const userCheck = await db.execute(sql`SELECT id FROM users WHERE username = ${uname} LIMIT 1`);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: `User "${uname}" tidak ditemukan` });
    }

    const hashed = await hashPassword(newPin);
    await db.execute(sql`UPDATE users SET transfer_pin = ${hashed} WHERE username = ${uname}`);

    res.json({ success: true, username: uname, message: "PIN berhasil diubah" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/change-email", async (req, res) => {
  const { username, newEmail } = req.body as { username?: string; newEmail?: string };

  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "Username wajib diisi" });
  }
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
    return res.status(400).json({ error: "Format email tidak valid" });
  }

  const uname = username.trim();
  const email = newEmail.trim().toLowerCase();

  try {
    const userCheck = await db.execute(sql`SELECT id FROM users WHERE username = ${uname} LIMIT 1`);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: `User "${uname}" tidak ditemukan` });
    }

    const emailCheck = await db.execute(sql`SELECT id FROM users WHERE email = ${email} AND username != ${uname} LIMIT 1`);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: "Email sudah digunakan oleh user lain" });
    }

    await db.execute(sql`UPDATE users SET email = ${email}, email_verified = true WHERE username = ${uname}`);

    res.json({ success: true, username: uname, newEmail: email, message: "Email berhasil diubah" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
