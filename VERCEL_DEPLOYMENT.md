# CDRRMD Vercel deployment

The repository contains three independently deployable targets:

- `backend` — Express API/serverless function
- `admin-web` — unified Admin, Barangay, and CDRRMD Rescuer staff portal
- `user-app` — Expo React Native app; Vercel hosts its web build only

## 1. Deploy the backend
Create a Vercel project with **Root Directory = `backend`**.
Set these environment variables in Vercel:

- `DATABASE_URL` — hosted PostgreSQL connection string (Neon, Supabase, etc.)
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGINS` — comma-separated URLs for the deployed staff and user-web apps
- `NODE_ENV=production`
- `SEED_DEFAULT_ACCOUNTS` should remain unset/false in production
- `DB_SSL=true` when required by the provider
- Leave `INITIALIZE_DATABASE_ON_COLD_START` unset. Database migrations now run
  once during the Vercel build, before the new serverless deployment becomes active.

Do not use the local `backend/.env` in production.

The backend's `vercel-build` script applies idempotent schema updates on every
deployment. A migration failure stops the deployment instead of publishing API
code that is incompatible with the current database. Normal API cold starts do
not run migrations, so request latency remains low.

## 2. Deploy `admin-web`
Create another Vercel project with **Root Directory = `admin-web`**.
Set:

`VITE_API_BASE_URL=https://YOUR-BACKEND.vercel.app/api`

The included `vercel.json` builds the Vite app.

## 3. Expo / React Native app
The same `user-app` code remains an Expo mobile app. Run locally with `npx expo start`.
Vercel can also host its **web build** by creating a Vercel project with Root Directory = `user-app` and:

`EXPO_PUBLIC_API_URL=https://YOUR-BACKEND.vercel.app`

Build command: `npm run web:build`
Output directory: `dist`

The Android/iOS app is still built and distributed through Expo/EAS; Vercel is only for the browser version.

## Important
Do not commit `node_modules`, `dist`, or `.env`. A hosted PostgreSQL database is required; Vercel is not a PostgreSQL database.
