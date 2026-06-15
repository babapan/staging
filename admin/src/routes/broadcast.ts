import { Router } from "express";
import { pool } from "../db.js";
import { requireAdmin } from "../auth.js";
import { randomUUID } from "crypto";

const router = Router();
router.use(requireAdmin);

const MAIN_APP_URL = process.env.MAIN_APP_URL || "http://localhost:5000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "migme-internal-admin-2024";

async function broadcastViaHttp(message: string, title: string, mode: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${MAIN_APP_URL}/api/system/admin/broadcast-rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({ message: message.trim(), title, mode }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || "HTTP error"), { status: response.status, data });
    return { ok: true, data };
  } catch (err: any) {
    clearTimeout(timeout);
    return { ok: false, err };
  }
}

async function broadcastViaDb(message: string, mode: string) {
  const results: { roomId: string; roomName: string; ok: boolean }[] = [];

  if (mode === "alert") {
    return { roomsReached: 0, totalRooms: 0, onlineUsers: 0, mode, results, note: "Alert-only mode memerlukan koneksi ke server utama. Pesan tidak dikirim ke chatroom." };
  }

  const rooms = await pool.query(`SELECT id, name FROM chatrooms WHERE status = 1`);

  for (const room of rooms.rows) {
    try {
      await pool.query(
        `INSERT INTO chatroom_messages (id, chatroom_id, sender_username, sender_color, text, is_system, created_at)
         VALUES ($1, $2, 'System', 'F47422', $3, true, NOW())`,
        [randomUUID(), room.id, message.trim()]
      );
      results.push({ roomId: room.id, roomName: room.name, ok: true });
    } catch {
      results.push({ roomId: room.id, roomName: room.name, ok: false });
    }
  }

  return {
    ok: true,
    roomsReached: results.filter(r => r.ok).length,
    totalRooms: results.length,
    onlineUsers: 0,
    mode,
    results,
    note: "Pesan disimpan langsung ke database. Pengguna online mungkin perlu refresh untuk melihat pesan ini.",
  };
}

router.post("/", async (req, res) => {
  const { message, title, mode = "both" } = req.body;

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Pesan wajib diisi" });
  }

  const msg = String(message).trim();
  const ttl = String(title || "Pengumuman").trim();

  try {
    const httpResult = await broadcastViaHttp(msg, ttl, mode);

    if (httpResult.ok) {
      return res.json(httpResult.data);
    }

    console.warn("[broadcast] HTTP relay gagal, fallback ke DB langsung:", httpResult.err?.message);

    const dbResult = await broadcastViaDb(msg, mode);
    return res.json(dbResult);
  } catch (err: any) {
    console.error("[broadcast] Error:", err);
    res.status(500).json({ error: err.message || "Gagal mengirim broadcast" });
  }
});

export default router;
