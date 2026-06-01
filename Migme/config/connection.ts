/**
 * ConnectionConfig
 *
 * Centralized connection configuration for the max99 Expo app.
 * Mirrors ConnectionDetail.java from the Android client.
 *
 * Three environments:
 *   DEV     — Replit dev server (debug builds)
 *   STAGING — AWS EC2 via public IP langsung (Docker, tanpa Nginx)
 *   PROD    — Production via Nginx + SSL (chatmeapp.my.id)
 *
 * CHANGE FORCE_ENV untuk switch environment:
 *   null      = auto ('dev' di debug build, 'prod' di release build)
 *   'dev'     = paksa Replit dev
 *   'staging' = paksa AWS EC2 IP langsung (HTTP/WS, tanpa SSL)
 *   'prod'    = paksa production domain dengan Nginx + SSL
 */
export type EnvType = 'dev' | 'staging' | 'prod';

const FORCE_ENV: EnvType | null = 'dev'; // <── UBAH INI sesuai kebutuhan

// ─── Replit dev domain ───────────────────────────────────────────────────────
const REPLIT_DEV_DOMAIN =
  '4b310d70-d6ef-4caf-9675-d1749bafe1af-00-ytzhbexgwexy.pike.replit.dev:5000';

// ─── AWS EC2 (STAGING — IP langsung tanpa SSL) ───────────────────────────────
// TODO: ganti EC2_IP ke IP server baru kalau mau pakai staging
const EC2_IP   = '13.212.78.52';
const EC2_PORT = 5000;

// ─── Production domains (Nginx + SSL) ────────────────────────────────────────
// Semua subdomain pointing ke EC2 yang sama, dipisah by nginx server_name.
//   api.chatmeapp.my.id     → backend container (HTTP API, port 5100→5000)
//   gateway.chatmeapp.my.id → backend container (WebSocket /gateway, port 5100→5000)
//   web.chatmeapp.my.id     → web container (port 3102→3002)
//   admin.chatmeapp.my.id   → admin container (port 3101→3001)
//   chatmeapp.my.id (root)  → redirect ke web
const ROOT_DOMAIN    = 'chatmeapp.my.id';
const API_DOMAIN     = 'api.chatmeapp.my.id';
const GATEWAY_DOMAIN = 'gateway.chatmeapp.my.id';
const WEB_DOMAIN     = 'web.chatmeapp.my.id';

// ─── Config shape ────────────────────────────────────────────────────────────
export interface ConnectionConfig {
  env: EnvType;
  apiBase: string;
  wsUrl: string;
  gatewayHost: string;
  gatewayPort: number;
  webServer: string;
  discoverUrl: string;
  imageUrl: string;
  imagesUrl: string;
  ssoUrl: string;
  dataServiceUrl: string;
  multiPartUrl: string;
  signupUrl: string;
  facebookAppId: string;
}

// ─── DEV config (Replit) ─────────────────────────────────────────────────────
const DEV_CONFIG: ConnectionConfig = {
  env:            'dev',
  apiBase:        `https://${REPLIT_DEV_DOMAIN}`,
  wsUrl:          `wss://${REPLIT_DEV_DOMAIN}/gateway`,
  gatewayHost:    REPLIT_DEV_DOMAIN,
  gatewayPort:    9119,
  webServer:      REPLIT_DEV_DOMAIN,
  discoverUrl:    `https://${REPLIT_DEV_DOMAIN}`,
  imageUrl:       `https://${REPLIT_DEV_DOMAIN}/img/`,
  imagesUrl:      `https://${REPLIT_DEV_DOMAIN}/resources/img`,
  ssoUrl:         `https://${REPLIT_DEV_DOMAIN}/touch/datasvc`,
  dataServiceUrl: `https://${REPLIT_DEV_DOMAIN}/touch/datasvc`,
  multiPartUrl:   `https://${REPLIT_DEV_DOMAIN}/touch/post/hidden_post`,
  signupUrl:      `https://${REPLIT_DEV_DOMAIN}`,
  facebookAppId:  '161865877194414',
};

// ─── STAGING config (EC2 IP langsung, tanpa Nginx/SSL) ───────────────────────
// Untuk testing langsung tanpa domain. Pakai HTTP dan WS (bukan HTTPS/WSS).
// Pastikan Security Group EC2 buka port 5000.
const STAGING_CONFIG: ConnectionConfig = {
  env:            'staging',
  apiBase:        `http://${EC2_IP}:${EC2_PORT}`,
  wsUrl:          `ws://${EC2_IP}:${EC2_PORT}/gateway`,
  gatewayHost:    EC2_IP,
  gatewayPort:    EC2_PORT,
  webServer:      `${EC2_IP}:${EC2_PORT}`,
  discoverUrl:    `http://${EC2_IP}:${EC2_PORT}`,
  imageUrl:       `http://${EC2_IP}:${EC2_PORT}/img/`,
  imagesUrl:      `http://${EC2_IP}:${EC2_PORT}/resources/img`,
  ssoUrl:         `http://${EC2_IP}:${EC2_PORT}/touch/datasvc`,
  dataServiceUrl: `http://${EC2_IP}:${EC2_PORT}/touch/datasvc`,
  multiPartUrl:   `http://${EC2_IP}:${EC2_PORT}/touch/post/hidden_post`,
  signupUrl:      `http://${EC2_IP}:${EC2_PORT}`,
  facebookAppId:  '161865877194414',
};

// ─── PROD config (chatmeapp.my.id via Nginx + Let's Encrypt SSL) ─────────────
// API     → https://api.chatmeapp.my.id     (HTTPS, port 443 via Nginx)
// WS      → wss://gateway.chatmeapp.my.id/gateway   (WSS, port 443 via Nginx)
// Tidak ada lagi koneksi TCP langsung ke IP — semua via domain + SSL.
const PROD_CONFIG: ConnectionConfig = {
  env:            'prod',
  apiBase:        `https://${API_DOMAIN}`,
  wsUrl:          `wss://${GATEWAY_DOMAIN}/gateway`,
  gatewayHost:    GATEWAY_DOMAIN,
  gatewayPort:    443,
  webServer:      API_DOMAIN,
  discoverUrl:    `https://${API_DOMAIN}`,
  imageUrl:       `https://${API_DOMAIN}/img/`,
  imagesUrl:      `https://${API_DOMAIN}/resources/img`,
  ssoUrl:         `https://${API_DOMAIN}/touch/datasvc`,
  dataServiceUrl: `https://${API_DOMAIN}/touch/datasvc`,
  multiPartUrl:   `https://${API_DOMAIN}/touch/post/hidden_post`,
  signupUrl:      `https://${ROOT_DOMAIN}`,
  facebookAppId:  '161865877194414',
};

// ─── Active config ───────────────────────────────────────────────────────────
function resolveConfig(): ConnectionConfig {
  if (FORCE_ENV === 'staging') return STAGING_CONFIG;
  if (FORCE_ENV === 'dev')     return DEV_CONFIG;
  if (FORCE_ENV === 'prod')    return PROD_CONFIG;
  return __DEV__ ? DEV_CONFIG : PROD_CONFIG;
}

export const Connection: ConnectionConfig = resolveConfig();

export const API_BASE     = Connection.apiBase;
export const WS_URL       = Connection.wsUrl;
export const GATEWAY_HOST = Connection.gatewayHost;
export const GATEWAY_PORT = Connection.gatewayPort;
export const IMAGE_URL    = Connection.imageUrl;
export const DISCOVER_URL = Connection.discoverUrl;
