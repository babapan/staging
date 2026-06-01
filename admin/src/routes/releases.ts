import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const UPLOAD_DIR = process.env.APK_UPLOAD_DIR || path.join(__dirname, "../../apk-uploads");

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/vnd.android.package-archive" ||
      file.originalname.endsWith(".apk")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Hanya file .apk yang diizinkan"));
    }
  },
});

const router = Router();
router.use(requireAdmin);

router.get("/", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT id, version_name, version_code, changelog,
             file_name, file_size, download_url, min_android,
             download_count, is_active, created_at
      FROM apk_releases
      ORDER BY created_at DESC
    `);
    res.json({ releases: result.rows });
  } catch (err) {
    console.error("[releases] GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/traffic", async (_req, res) => {
  try {
    const [dailyRes, totalRes] = await Promise.all([
      db.execute(sql`
        SELECT
          TO_CHAR(DATE_TRUNC('day', logged_at), 'YYYY-MM-DD') AS day,
          COUNT(*) AS downloads
        FROM apk_download_logs
        WHERE logged_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        ORDER BY 1
      `),
      db.execute(sql`
        SELECT id, version_name, download_count
        FROM apk_releases
        ORDER BY download_count DESC
        LIMIT 10
      `),
    ]);
    res.json({ daily: dailyRes.rows, by_release: totalRes.rows });
  } catch (err) {
    console.error("[releases] GET traffic error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", upload.single("apk_file"), async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, any>;
    const {
      version_name, version_code, changelog,
      file_size: bodySizeStr, download_url,
      min_android, force_update, store_url,
    } = body;

    if (!version_name || !version_code) {
      return res.status(400).json({ error: "version_name dan version_code wajib diisi" });
    }

    let finalFileName: string | null = null;
    let finalUrl: string = download_url || "";
    let finalSize: number = parseInt(bodySizeStr) || 0;

    if (req.file) {
      finalFileName = req.file.filename;
      finalSize     = req.file.size;
      const webHost = process.env.WEB_HOST || "https://web.chatmeapp.my.id";
      finalUrl = `${webHost}/downloads/${finalFileName}`;
    } else if (!download_url) {
      const code = parseInt(version_code);
      finalFileName = `migchat-v${code}.apk`;
      finalUrl      = `https://web.chatmeapp.my.id/downloads/${finalFileName}`;
    }

    await db.execute(sql`UPDATE apk_releases SET is_active = false WHERE is_active = true`);

    const result = await db.execute(sql`
      INSERT INTO apk_releases
        (version_name, version_code, changelog, file_name, file_size, download_url, min_android, is_active, force_update, store_url)
      VALUES
        (${version_name}, ${parseInt(version_code)}, ${changelog || null},
         ${finalFileName}, ${finalSize}, ${finalUrl},
         ${parseInt(min_android) || 7}, true,
         ${force_update === 'true' || force_update === true},
         ${store_url || null})
      RETURNING *
    `);

    res.json({ release: result.rows[0], message: "Rilis APK berhasil disimpan" });
  } catch (err: any) {
    console.error("[releases] POST error:", err);
    res.status(500).json({ error: err?.message || "Gagal menyimpan rilis APK" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      version_name, version_code, changelog,
      file_name, file_size, download_url, min_android, is_active,
      force_update, store_url,
    } = req.body as Record<string, any>;

    const result = await db.execute(sql`
      UPDATE apk_releases SET
        version_name  = COALESCE(${version_name}, version_name),
        version_code  = COALESCE(${version_code ? parseInt(version_code) : null}, version_code),
        changelog     = COALESCE(${changelog ?? null}, changelog),
        file_name     = COALESCE(${file_name ?? null}, file_name),
        file_size     = COALESCE(${file_size != null ? parseInt(file_size) : null}, file_size),
        download_url  = COALESCE(${download_url ?? null}, download_url),
        min_android   = COALESCE(${min_android != null ? parseInt(min_android) : null}, min_android),
        is_active     = COALESCE(${is_active != null ? Boolean(is_active) : null}, is_active),
        force_update  = COALESCE(${force_update != null ? (force_update === 'true' || force_update === true) : null}, force_update),
        store_url     = COALESCE(${store_url ?? null}, store_url)
      WHERE id = ${parseInt(id)}
      RETURNING *
    `);

    if (!result.rows.length) return res.status(404).json({ error: "Rilis tidak ditemukan" });
    res.json({ release: result.rows[0], message: "Rilis APK berhasil diperbarui" });
  } catch (err) {
    console.error("[releases] PUT error:", err);
    res.status(500).json({ error: "Gagal memperbarui rilis APK" });
  }
});

router.patch("/:id/activate", async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(sql`UPDATE apk_releases SET is_active = false WHERE is_active = true`);
    const result = await db.execute(sql`
      UPDATE apk_releases SET is_active = true WHERE id = ${parseInt(id)} RETURNING *
    `);
    if (!result.rows.length) return res.status(404).json({ error: "Rilis tidak ditemukan" });
    res.json({ release: result.rows[0], message: "Rilis APK diaktifkan" });
  } catch (err) {
    console.error("[releases] PATCH activate error:", err);
    res.status(500).json({ error: "Gagal mengaktifkan rilis APK" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.execute(sql`SELECT file_name FROM apk_releases WHERE id = ${parseInt(id)}`);
    if (!existing.rows.length) return res.status(404).json({ error: "Rilis tidak ditemukan" });

    const row = existing.rows[0] as any;
    const filePath = path.join(UPLOAD_DIR, row.file_name || "");
    if (row.file_name && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await db.execute(sql`DELETE FROM apk_releases WHERE id = ${parseInt(id)}`);
    res.json({ message: "Rilis APK berhasil dihapus" });
  } catch (err) {
    console.error("[releases] DELETE error:", err);
    res.status(500).json({ error: "Gagal menghapus rilis APK" });
  }
});

export default router;
