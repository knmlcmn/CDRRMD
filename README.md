# CDRRMD Disaster Response Platform

Monorepo structure:

- `admin-web/` — React + Tailwind admin dashboard for posting alerts/news
- `user-app/` — Expo React Native mobile app (UI based on your screenshot)
- `barangay-web/` — React + Tailwind barangay operations portal
- `backend/` — Node.js/Express API with JWT auth + PostgreSQL

## Quick Start

1. Install dependencies from the project root:
   - `npm install`
2. Start backend:
   - `npm run dev:backend`
3. Start admin web:
   - `npm run dev:admin`
4. Start mobile user app:
   - `npm run dev:user`

## PostgreSQL Auto-Connection

Backend uses `backend/.env`:

- `DB_HOST=localhost`
- `DB_PORT=5432`
- `DB_NAME=cddrmd`
- `DB_USER=postgres`
- `DB_PASSWORD=<your local PostgreSQL password>`

On backend start, tables are auto-created. Default staff accounts are seeded only for local development (or when `SEED_DEFAULT_ACCOUNTS=true`):

- account ID: printed by the backend at startup in the form `ADM-YYYY-00000`
- password: `Admin@123`

Admin and barangay web portals accept only their generated account ID and password.
Usernames and email addresses cannot be used to sign in to either staff portal.

Default evacuation centers are inserted only once for a new, empty database.
Centers deleted by an administrator remain deleted after backend restarts.

All operational maps include a live weather visualization layer with animated
wind streamlines, rainfall bands and weather-scaled drops, thunderstorm
lightning, and a compact live conditions display. The animation is driven by
the backend rain-impact weather feed and can be toggled from the map layers.

## Features Implemented

### User App (React Native + NativeWind/Tailwind)
- Home screen mimics screenshot layout
- Weather card with dynamic condition image (rainy/sunny/cloudy)
- Open-Meteo weather integration through backend
- Request Rescue opens Calamba City map/bounds (Laguna, PH)
- Latest Alerts (dynamic from backend)
- News & Announcement (dynamic from backend)

### Admin Web (React + Tailwind)
- JWT login
- Post flood, typhoon, and other disaster alerts
- Post news/announcements
- Lists latest posted content immediately

### Backend (Node + PostgreSQL)
- `POST /api/auth/login`
- `GET /api/content/alerts`
- `POST /api/content/alerts` (JWT)
- `GET /api/content/announcements`
- `POST /api/content/announcements` (JWT)
- `GET /api/weather?latitude=14.2117&longitude=121.1653`

## Deploying on Vercel

Create three Vercel projects from this same repository and set each project's
**Root Directory** as follows:

| Vercel project | Root Directory | Required environment variables |
| --- | --- | --- |
| API | `backend` | `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `NODE_ENV=production` |
| Admin portal | `admin-web` | `VITE_API_BASE_URL=https://<api-project>.vercel.app/api` |
| Barangay portal | `barangay-web` | `VITE_API_BASE_URL=https://<api-project>.vercel.app/api` |

`DATABASE_URL` must be a hosted PostgreSQL connection string (for example from
Neon or Supabase). `localhost` on Vercel refers to the Vercel function itself,
not the PostgreSQL server on your computer. If the provider requires SSL and
the URL does not already include `sslmode=require`, also set `DB_SSL=true`.

Set `CORS_ORIGINS` to the two deployed frontend origins, separated by a comma,
for example:

```text
https://cdrrmd-admin.vercel.app,https://cdrrmd-barangay.vercel.app,https://cdrrmd-user.vercel.app
```

After saving environment variables, redeploy all three projects. Confirm the
API first by opening `https://<api-project>.vercel.app/api/health`; it should
return `{"status":"ok"}`. Then open the two portal deployments.

Never commit `backend/.env`. Copy `backend/.env.example` for local setup and
store production secrets only in Vercel's Environment Variables settings.

## Expo Web + Mobile

`user-app/` remains the React Native + Expo application for Android/iOS and can
also be exported as a browser build. For Vercel, create a project with Root
Directory `user-app`, build command `npm run web:build`, and output directory
`dist`. Set `EXPO_PUBLIC_API_URL` to the deployed API without the `/api` suffix.

The Android/iOS app continues to use Expo/EAS; Vercel only hosts its web build.
See `VERCEL_DEPLOYMENT.md` for the complete deployment sequence.
