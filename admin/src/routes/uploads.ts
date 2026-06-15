import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { readdir, stat, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ?? path.resolve(__dirname, "../../Server/uploads");

const UPLOADS_BASE_URL = (process.env.UPLOADS_BASE_URL ?? "/uploads").replace(/\/$/, "");

const router = Router();
router.use(requireAdmin);

// GET /api/uploads — list all local uploaded files
router.get("/", async (_req, res) => {
  try {
    if (!existsSync(UPLOADS_DIR)) {
      return res.json({ files: [], totalSize: 0, dir: UPLOADS_DIR });
    }

    const names = await readdir(UPLOADS_DIR);
    const files = await Promise.all(
      names.map(async (name) => {
        const filePath = path.join(UPLOADS_DIR, name);
        const s = await stat(filePath);
        if (!s.isFile()) return null;
        const ext = path.extname(name).toLowerCase().slice(1);
        const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
        const isVideo = ["mp4", "webm", "mov"].includes(ext);
        const isJson  = ext === "json";
        return {
          name,
          size: s.size,
          modifiedAt: s.mtime.toISOString(),
          url: `${UPLOADS_BASE_URL}/${name}`,
          type: isImage ? "image" : isVideo ? "video" : isJson ? "json" : "other",
        };
      })
    );

    const validFiles = files.filter(Boolean) as NonNullable<(typeof files)[number]>[];
    validFiles.sort((a, b) => b!.modifiedAt.localeCompare(a!.modifiedAt));

    const totalSize = validFiles.reduce((sum, f) => sum + f!.size, 0);
    res.json({ files: validFiles, totalSize, dir: UPLOADS_DIR });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/uploads/:filename — delete a single file
router.delete("/:filename", async (req, res) => {
  const name = path.basename(req.params.filename);
  if (!name || name.includes("..") || name.includes("/")) {
    return res.status(400).json({ error: "Nama file tidak valid" });
  }
  const filePath = path.join(UPLOADS_DIR, name);
  try {
    await unlink(filePath);
    res.json({ success: true });
  } catch (e: any) {
    if (e.code === "ENOENT") return res.status(404).json({ error: "File tidak ditemukan" });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/uploads — delete ALL files
router.delete("/", async (_req, res) => {
  try {
    if (!existsSync(UPLOADS_DIR)) return res.json({ success: true, deleted: 0 });
    const names = await readdir(UPLOADS_DIR);
    let deleted = 0;
    for (const name of names) {
      const filePath = path.join(UPLOADS_DIR, name);
      const s = await stat(filePath);
      if (s.isFile()) { await unlink(filePath); deleted++; }
    }
    res.json({ success: true, deleted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
