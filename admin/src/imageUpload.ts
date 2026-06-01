/**
 * imageUpload.ts — Shared image upload utility untuk admin routes.
 *
 * Simpan file ke disk lokal, return URL publik via img.chatmeapp.my.id
 *
 * ENV:
 *   IMG_BASE_URL  — base URL CDN gambar (default: https://img.chatmeapp.my.id)
 *   UPLOADS_DIR   — path folder uploads di dalam container (default: /app/uploads)
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Dalam Docker: /app/uploads (shared volume dengan backend)
// Dalam Replit dev: dua level ke atas dari admin/src/ → Server/uploads
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ?? path.resolve(__dirname, "../../Server/uploads");

function getImgBaseUrl(): string {
  return (process.env.IMG_BASE_URL ?? "https://img.chatmeapp.my.id").replace(/\/$/, "");
}

export interface UploadOptions {
  base64Data: string;
  mimeType:   string;
  fileName:   string;
  subfolder:  string;
}

/**
 * Simpan file base64 ke disk dan return URL publik.
 * Selalu berhasil selama disk tersedia.
 */
export async function uploadFile(opts: UploadOptions): Promise<{
  url:     string;
  storage: "selfhosted";
}> {
  const subDir = path.join(UPLOADS_DIR, opts.subfolder);

  if (!existsSync(subDir)) {
    await mkdir(subDir, { recursive: true });
  }

  const buffer   = Buffer.from(opts.base64Data, "base64");
  const filePath = path.join(subDir, opts.fileName);
  await writeFile(filePath, buffer);

  const url = `${getImgBaseUrl()}/${opts.subfolder}/${opts.fileName}`;
  console.log(`[admin/upload] Saved: ${filePath} → ${url}`);

  return { url, storage: "selfhosted" };
}

/**
 * Alias untuk kompatibilitas backward dengan kode lama yang pakai uploadWithFallback.
 */
export async function uploadWithFallback(opts: {
  base64Data: string;
  mimeType:   string;
  fileName:   string;
  folder:     string;
}): Promise<{ url: string; storage: "selfhosted" }> {
  const subfolder = opts.folder.replace(/^\/+/, "").replace(/\/+$/, "") || "misc";
  return uploadFile({
    base64Data: opts.base64Data,
    mimeType:   opts.mimeType,
    fileName:   opts.fileName,
    subfolder,
  });
}

/**
 * Alias untuk kompatibilitas backward.
 */
export async function saveFileToDisk(base64Data: string, fileName: string): Promise<string> {
  const { url } = await uploadFile({ base64Data, mimeType: "application/octet-stream", fileName, subfolder: "misc" });
  return url;
}

export const IMAGEKIT_CONFIGURED = false;
export function getImageKit(): never {
  throw new Error("ImageKit tidak lagi digunakan. Pakai uploadFile() dari imageUpload.ts.");
}
