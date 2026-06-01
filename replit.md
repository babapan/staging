# Migme Social App

## Stack
- **Frontend**: React Native 0.83.4 / Expo SDK 55 / Expo Router / TypeScript
- **Backend**: Express 5 / TypeScript / tsx / Node.js
- **Database**: PostgreSQL via Neon (Drizzle ORM)
- **Cache**: Redis (optional, graceful fallback)
- **Real-time**: WebSocket gateway (custom binary FusionPacket + JSON)
- **Audio**: LiveKit self-hosted (AWS Docker) / LiveKit Cloud (dev/testing)
- **Media**: Self-hosted CDN (img.chatmeapp.my.id)
- **Deploy**: AWS Docker (docker-compose)

## Monorepo Layout
```
/Server        — Express backend (port 5000)
/Migme         — React Native / Expo client
```

---

## Live Party (Voice Rooms) — LiveKit

Completely separate from classic chatrooms. No shared tables, routes, or client code.

| Layer | File | Notes |
|---|---|---|
| DB Tables | `Server/server/index.ts` (inline CREATE IF NOT EXISTS) | `party_rooms`, `party_seats` |
| API Routes | `Server/server/modules/liveParty/routes.ts` | `/api/party/...` |
| Client Service | `Migme/services/partyService.ts` | LiveKit SDK + all party API calls |
| Party List | `Migme/app/(home)/liviparty.tsx` | Uses `/api/party/rooms` |
| Party Modal | `Migme/components/PartyRoomModal.tsx` | Full-screen audio + chat UI |

**LiveKit SDK**: `@livekit/react-native` — native module, requires EAS Build.  
Gracefully degrades (no audio, UI tetap jalan) di Expo Go.

### Party Room API
```
GET    /api/party/rooms                    list all active rooms
POST   /api/party/rooms                    create room (auth required)
GET    /api/party/rooms/:id                room detail
PATCH  /api/party/rooms/:id                update (owner/admin only)
DELETE /api/party/rooms/:id                delete (owner/admin only)
GET    /api/party/rooms/:id/state          8 seats state
GET    /api/party/livekit-mode             active provider status (cloud/selfhosted)
POST   /api/party/rooms/:id/token          get LiveKit JWT token (includes provider field)
POST   /api/party/rooms/:id/seats/:n/take  take seat n (1–8)
POST   /api/party/rooms/:id/seats/:n/leave leave seat n
POST   /api/party/rooms/:id/seats/:n/mute  mute/unmute seat n
```

### LiveKit Dual Provider
- `LIVEKIT_MODE=auto` (default): pakai Cloud jika `LIVEKIT_CLOUD_*` diset, else self-hosted
- `LIVEKIT_MODE=cloud`: paksa LiveKit Cloud
- `LIVEKIT_MODE=selfhosted`: paksa self-hosted Docker
- **Saat menit Cloud habis**: set `LIVEKIT_MODE=selfhosted` di `.env` lalu `docker compose restart backend`
- Token response sekarang include `provider: "cloud" | "selfhosted"` — ditampilkan sebagai badge di modal

---

## Classic Chatrooms
Voice room (Agora) removed. Chat-only. `agora-token` masih di server package.json tapi tidak dipakai oleh route aktif.

---

## Docker Compose Services (AWS Production)

| Container | Image | Port | Keterangan |
|---|---|---|---|
| `max99-backend` | custom build | 127.0.0.1:5100→5000 | Express API |
| `max99-livekit` | livekit/livekit-server | 127.0.0.1:7880, 0.0.0.0:7881, 0.0.0.0:50000-50200/udp | Audio server |
| `max99-admin` | custom build | 127.0.0.1:3101→3001 | Admin panel |
| `max99-web` | custom build | 127.0.0.1:3102→3002 | Web download |
| `max99-redis` | redis:7-alpine | 127.0.0.1:6380→6379 | Cache |

---

## AWS Deploy — Panduan Lengkap

### 1. Buat subdomain LiveKit
Di DNS provider (Cloudflare dll), tambahkan:
```
A  livekit.chatmeapp.my.id  →  IP_SERVER_AWS
```

### 2. Isi .env di server AWS
```bash
cp Server/.env.example Server/.env
nano Server/.env
```
Isi semua variabel, terutama:
```
LIVEKIT_API_KEY=buat_key_acak_min_8_karakter
LIVEKIT_API_SECRET=buat_secret_acak_min_32_karakter
LIVEKIT_URL=wss://livekit.chatmeapp.my.id
```

### 3. Buka port AWS Security Group
Di EC2 → Security Groups → Inbound Rules:
```
TCP  443        0.0.0.0/0   HTTPS (nginx)
TCP  80         0.0.0.0/0   HTTP (redirect ke HTTPS)
TCP  7881       0.0.0.0/0   LiveKit RTC TCP fallback
UDP  50000-50200 0.0.0.0/0  LiveKit WebRTC media
```

### 4. Setup nginx + SSL untuk API Backend (wajib untuk upload musik)
```bash
# Install certbot kalau belum ada
sudo apt install certbot python3-certbot-nginx -y

# Salin nginx config API (mengandung client_max_body_size 35m untuk upload musik)
sudo cp Server/nginx-api.conf /etc/nginx/sites-available/api
sudo ln -sf /etc/nginx/sites-available/api /etc/nginx/sites-enabled/
sudo nginx -t

# Generate SSL cert untuk API domain
sudo certbot --nginx -d api.chatmeapp.my.id

# Reload nginx
sudo systemctl reload nginx
```

### 4b. Setup nginx + SSL untuk LiveKit
```bash
# Salin nginx config
sudo cp Server/nginx-livekit.conf /etc/nginx/sites-available/livekit
sudo ln -sf /etc/nginx/sites-available/livekit /etc/nginx/sites-enabled/
sudo nginx -t

# Generate SSL cert
sudo certbot --nginx -d livekit.chatmeapp.my.id

# Reload nginx
sudo systemctl reload nginx
```

### 5. Deploy Docker
```bash
cd Server
docker compose pull livekit   # download image LiveKit terbaru
docker compose up -d --build
docker compose logs -f livekit  # cek LiveKit jalan
```

### 6. Verifikasi
```bash
# Cek LiveKit health (dari dalam server)
curl http://127.0.0.1:7880/

# Cek lewat nginx/SSL (dari luar)
curl https://livekit.chatmeapp.my.id/
```

---

## EAS Build (Mobile — untuk audio LiveKit)
```bash
cd Migme
npm install                                          # install @livekit/react-native + react-native-webrtc
eas build --profile development --platform android   # development build
```

---

## Workflows (Replit Dev)
- **Start Backend**: `redis-server --daemonize yes ... ; cd Server && REDIS_URL=... npm run dev`
- **Start Frontend**: `cd Migme && node_modules/.bin/expo start --tunnel --dev-client`

## Environment Variables (Replit Secrets)
| Variable | Keterangan |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL URL |
| `SESSION_SECRET` | Express session secret |
| `JWT_SECRET` | JWT signing key |
| `BREVO_API_KEY` | Email API |
| `IMG_BASE_URL` | Self-hosted CDN base URL (default: https://img.chatmeapp.my.id) |
| `UPLOADS_DIR` | Path folder uploads di container (default: /app/uploads) |
| `LIVEKIT_MODE` | `auto`/`cloud`/`selfhosted` — kontrol provider aktif |
| `LIVEKIT_CLOUD_URL` | LiveKit Cloud WSS URL (primary) |
| `LIVEKIT_CLOUD_API_KEY` | LiveKit Cloud API key |
| `LIVEKIT_CLOUD_API_SECRET` | LiveKit Cloud API secret |
| `LIVEKIT_URL` | Self-hosted LiveKit URL (wss://livekit.chatmeapp.my.id) |
| `LIVEKIT_API_KEY` | Self-hosted API key |
| `LIVEKIT_API_SECRET` | Self-hosted API secret |
