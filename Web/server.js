import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.WEB_PORT || 3002;
const APK_DIR = process.env.APK_UPLOAD_DIR || "/app/apk-files";

app.use("/downloads", express.static(APK_DIR, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".apk")) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    }
  },
}));

app.use(express.static(path.join(__dirname, "public")));

app.get("/terms", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "terms.html"));
});

app.get("/privacy", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "privacy.html"));
});

app.get("/child-safety", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "child-safety.html"));
});

app.get("/download", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "download.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`[KyuLive Web] Running on port ${PORT}`);
});
