import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { listLoginAttempts, getLoginAttemptStats } from "../audit.js";

const router = Router();
router.use(requireAdmin);

router.get("/login-attempts", async (req, res) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "50", 10)));
  const onlyFailed = req.query.failed === "1" || req.query.failed === "true";
  try {
    const { rows, total } = await listLoginAttempts({ page, limit, onlyFailed });
    res.json({ attempts: rows, total, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal memuat data" });
  }
});

router.get("/login-stats", async (_req, res) => {
  try {
    const stats = await getLoginAttemptStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal memuat statistik" });
  }
});

export default router;
