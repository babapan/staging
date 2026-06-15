import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginAdmin, signAdminToken, requireAdmin } from "../auth.js";
import { recordLoginAttempt, getClientIp } from "../audit.js";

const router = Router();

// Batasi percobaan login: max 5 per IP per menit. Hanya percobaan GAGAL yang
// dihitung (login berhasil tidak ikut menambah counter), dan respons sukses
// (status < 400) di-skip — supaya user yang berhasil tidak terblokir.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Terlalu banyak percobaan login. Coba lagi dalam 1 menit." },
});

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"]?.toString().slice(0, 500);

  if (!username || !password) {
    await recordLoginAttempt({
      username: username ?? null,
      ip,
      userAgent,
      success: false,
      reason: "missing_credentials",
    });
    return res.status(400).json({ error: "Username dan password wajib diisi" });
  }

  const user = await loginAdmin(username, password);
  if (!user) {
    await recordLoginAttempt({
      username,
      ip,
      userAgent,
      success: false,
      reason: "invalid_credentials_or_not_admin",
    });
    return res.status(401).json({ error: "Username/password salah atau bukan admin" });
  }

  await recordLoginAttempt({
    username: user.username,
    ip,
    userAgent,
    success: true,
  });

  const token = signAdminToken(user);
  res.json({ token, username: user.username, isSuperAdmin: user.isSuperAdmin });
});

router.get("/me", requireAdmin, (req, res) => {
  res.json((req as any).adminUser);
});

export default router;
