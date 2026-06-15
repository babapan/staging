import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import chatroomsRoutes from "./routes/chatrooms.js";
import creditsRoutes from "./routes/credits.js";
import merchantsRoutes from "./routes/merchants.js";
import botsRoutes from "./routes/bots.js";
import dashboardRoutes from "./routes/dashboard.js";
import giftsRoutes from "./routes/gifts.js";
import badgesRoutes from "./routes/badges.js";
import stickersRoutes from "./routes/stickers.js";
import accountsRoutes from "./routes/accounts.js";
import broadcastRoutes from "./routes/broadcast.js";
import releasesRoutes from "./routes/releases.js";
import auditRoutes from "./routes/audit.js";
import settingsRoutes from "./routes/settings.js";
import announcementRoutes from "./routes/announcement.js";
import xpRoutes from "./routes/xp.js";
import partyRoutes from "./routes/party.js";
import shopFramesRoutes from "./routes/shopFrames.js";
import shopEntryEffectsRoutes from "./routes/shopEntryEffects.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import agenciesRoutes from "./routes/agencies.js";
import withdrawalsRoutes from "./routes/withdrawals.js";
import bannersRoutes from "./routes/banners.js";
import uploadsRoutes from "./routes/uploads.js";
import hostSalaryRoutes from "./routes/hostSalary.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.ADMIN_PORT || 8080;

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/chatrooms", chatroomsRoutes);
app.use("/api/credits", creditsRoutes);
app.use("/api/merchants", merchantsRoutes);
app.use("/api/bots", botsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/gifts", giftsRoutes);
app.use("/api/badges", badgesRoutes);
app.use("/api/stickers", stickersRoutes);
app.use("/api/accounts", accountsRoutes);
app.use("/api/broadcast", broadcastRoutes);
app.use("/api/releases", releasesRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/announcement", announcementRoutes);
app.use("/api/xp", xpRoutes);
app.use("/api/party", partyRoutes);
app.use("/api/shop-frames", shopFramesRoutes);
app.use("/api/shop-entry-effects", shopEntryEffectsRoutes);
app.use("/api/leaderboard-admin", leaderboardRoutes);
app.use("/api/agencies", agenciesRoutes);
app.use("/api/withdrawals", withdrawalsRoutes);
app.use("/api/banners", bannersRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/host-salary", hostSalaryRoutes);

const uploadsDir = process.env.UPLOADS_DIR || "/app/uploads";
app.use("/uploads", express.static(uploadsDir));

const apkUploadDir = process.env.APK_UPLOAD_DIR || "/app/apk-uploads";
app.use("/files", express.static(apkUploadDir, {
  setHeaders(res) {
    res.setHeader("Content-Disposition", "attachment");
  },
}));

const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));

app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[Admin Panel] Running on port ${PORT}`);
});

export default app;
