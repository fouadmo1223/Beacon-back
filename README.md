# Beacon Back — Push Notification API

Node.js + Express 5 + TypeScript API that registers devices and sends push notifications through the
Expo Push Service. Data lives in **PostgreSQL (Neon)**; migrations run automatically on start.

## Run locally

```bash
npm install
cp .env.example .env     # set ADMIN_API_KEY and DATABASE_URL
npm run dev              # http://localhost:4000/api/health
```

Without `DATABASE_URL` it falls back to a JSON file store (development only).

## Deploy to Render

**Blueprint (recommended):** Render → New → **Blueprint** → pick this repo (`render.yaml`).
Or create a **Web Service** manually:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Environment variables:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string, `…?sslmode=verify-full` |
| `ADMIN_API_KEY` | long random secret (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `CORS_ORIGINS` | your Vercel dashboard URL, e.g. `https://beacon-front.vercel.app` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `EXPO_ACCESS_TOKEN` | optional — only with EAS "Enhanced push security" |

> On Render's **free** plan the service sleeps after inactivity, so scheduled notifications are sent
> when it wakes up. Use a paid instance for exact scheduling.

## API

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | — | Health check |
| `POST /api/devices/register` | public, rate-limited | Upsert device + Expo push token |
| `POST /api/notifications/:id/events` | public, rate-limited | Report `opened` |
| `GET /api/devices` | admin | Paginated, filterable |
| `GET /api/notifications` | admin | Paginated, filterable |
| `POST /api/notifications/send` | admin | Send now |
| `POST /api/notifications/schedule` | admin | Schedule |
| `POST /api/notifications/:id/cancel` | admin | Cancel a scheduled notification |
| `GET /api/stats` | admin | Overview numbers |

Admin routes need `Authorization: Bearer <ADMIN_API_KEY>`.

## Scripts

`npm run dev` · `npm run build` · `npm start` · `npm test` · `npm run typecheck` · `npm run lint`
