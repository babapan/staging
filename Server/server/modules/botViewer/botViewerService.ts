/**
 * Bot Viewer Service
 *
 * Simulasi penonton (fake viewers) untuk Solo Live dan Party Room.
 * Tidak ada akun database asli — semua in-memory server-side.
 *
 * Config via env:
 *   BOT_VIEWER_ENABLED   = "true" | "false"  (default: true)
 *   BOT_VIEWER_COUNT     = angka              (default: 15)
 *   BOT_STAGGER_MS       = angka ms           (default: 2500)
 */

// ─── Config ───────────────────────────────────────────────────────────────────

export function isBotEnabled(): boolean {
  const val = (process.env.BOT_VIEWER_ENABLED ?? "true").toLowerCase();
  return val !== "false" && val !== "0";
}

export function getBotCount(): number {
  const v = parseInt(process.env.BOT_VIEWER_COUNT ?? "15", 10);
  return isNaN(v) || v < 1 ? 15 : Math.min(v, 100);
}

function getStaggerMs(): number {
  const v = parseInt(process.env.BOT_STAGGER_MS ?? "2500", 10);
  return isNaN(v) || v < 500 ? 2500 : Math.min(v, 10000);
}

// ─── Username Generator ────────────────────────────────────────────────────────

const ADJ = [
  "Cantik", "Manis", "Lucu", "Ceria", "Imut", "Comel", "Manja",
  "Cute", "Sweet", "Pretty", "Lovely", "Charming", "Bright", "Happy",
  "Shiny", "Angel", "Dreamy", "Kawaii", "Bubbly", "Cheerful",
  "Sakura", "Hana", "Bela", "Nova", "Luna", "Aura", "Sasa",
];

const NOUN = [
  "Girl", "Babe", "Star", "Honey", "Rose", "Berry", "Pearl",
  "Lily", "Moon", "Sun", "Joy", "Gem", "Sky", "Dove",
  "Belle", "Faye", "Mia", "Lia", "Rina", "Nana", "Yuki",
  "Chan", "Sis", "Love", "Petal", "Bunny", "Cloud",
];

const _usedNames = new Set<string>();

export function randomBotUsername(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const adj   = ADJ[Math.floor(Math.random() * ADJ.length)];
    const noun  = NOUN[Math.floor(Math.random() * NOUN.length)];
    const num   = Math.floor(Math.random() * 9000) + 100;
    const name  = `${adj}${noun}${num}`;
    if (!_usedNames.has(name)) {
      _usedNames.add(name);
      // Cleanup pool jika terlalu besar
      if (_usedNames.size > 5000) _usedNames.clear();
      return name;
    }
  }
  return `User${Date.now() % 100000}`;
}

// ─── Bot Registry ─────────────────────────────────────────────────────────────

export interface BotViewer {
  username:    string;
  displayName: string;
  avatarUrl:   null;
  vipLevel:    0;
  hasTopup:    false;
}

// roomKey → list of active bots
const _registry = new Map<string, BotViewer[]>();
// roomKey → pending timers (for cleanup on early room close)
const _timers   = new Map<string, NodeJS.Timeout[]>();

function addBot(roomKey: string, bot: BotViewer) {
  const list = _registry.get(roomKey) ?? [];
  list.push(bot);
  _registry.set(roomKey, list);
}

function clearTimers(roomKey: string) {
  const timers = _timers.get(roomKey) ?? [];
  timers.forEach(t => clearTimeout(t));
  _timers.delete(roomKey);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Total bot count di satu room key */
export function getBotViewerCount(roomKey: string): number {
  return _registry.get(roomKey)?.length ?? 0;
}

/** List semua bot di room key */
export function getBotViewers(roomKey: string): BotViewer[] {
  return _registry.get(roomKey) ?? [];
}

/** Hapus semua bot dari room (panggil saat room/stream berakhir) */
export function clearBots(roomKey: string) {
  clearTimers(roomKey);
  _registry.delete(roomKey);
}

/**
 * Spawn N bot viewers dengan stagger timing.
 * onJoin dipanggil tiap kali satu bot "masuk" — caller bertanggung jawab broadcast.
 */
export function spawnBots(
  roomKey: string,
  count:   number,
  onJoin:  (bot: BotViewer, index: number) => void,
): void {
  if (!isBotEnabled()) return;
  clearTimers(roomKey);   // reset kalau sudah ada
  _registry.set(roomKey, []);

  const stagger = getStaggerMs();
  const timers: NodeJS.Timeout[] = [];

  for (let i = 0; i < count; i++) {
    const delay = (i + 1) * stagger + Math.floor(Math.random() * 1000);
    const bot: BotViewer = {
      username:    randomBotUsername(),
      displayName: randomBotUsername(),
      avatarUrl:   null,
      vipLevel:    0,
      hasTopup:    false,
    };

    const t = setTimeout(() => {
      addBot(roomKey, bot);
      try { onJoin(bot, i); } catch { /* non-fatal */ }
    }, delay);

    timers.push(t);
  }

  _timers.set(roomKey, timers);
}
