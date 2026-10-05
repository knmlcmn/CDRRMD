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

Do not use the local `backend/.env` in production.

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
