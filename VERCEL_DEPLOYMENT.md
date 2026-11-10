# CDRRMD Vercel deployment

The repository contains three independently deployable targets:

- `backend` — Express API/serverless function
- `admin-web` — unified Admin, Barangay, and CDRRMD Rescuer staff portal
- `user-app` — Expo React Native app; Vercel hosts its web build only

## 1. Deploy the backend
Create a Vercel project with **Root Directory = `backend`**.
Set these environment variables in Vercel:

- `DATABASE_URL` — hosted PostgreSQL connection string (Neon, Supabase, etc.)
- `JWT_SECRET` — long random access-token signing secret
- `JWT_REFRESH_SECRET` — a different long random refresh-token signing secret
- `OTP_SECRET` — a different long random OTP signing secret
- Email delivery using either:
  - `SMTP_URL`, or
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and
    optionally `SMTP_FROM`
- `CORS_ORIGINS` — comma-separated URLs for the deployed staff and user-web apps
- `NODE_ENV=production`
- `SEED_DEFAULT_ACCOUNTS` should remain unset/false in production
- `DB_SSL=true` when required by the provider
- The serverless entrypoint does not initialize or migrate the database during
  request cold starts.

Do not use the local `backend/.env` in production.

Vercel does not upload `backend/.env`. Add these values in the **backend
project's** Settings → Environment Variables for Production (and Preview if
preview deployments must send email). After adding or changing a variable,
redeploy the backend; existing deployments do not receive new values.

For Gmail SMTP, use `smtp.gmail.com`, port `465`, `SMTP_SECURE=true`, the Gmail
address as `SMTP_USER`, and a Google App Password as `SMTP_PASS`. Never use the
normal Gmail password or expose any SMTP/JWT/OTP secret to the `user-app`
project as an `EXPO_PUBLIC_*` variable.

The backend's `vercel-build` script validates deployment configuration without
connecting to or modifying the database. Database initialization and migrations
must be run separately with `npm run migrate` only during an explicitly
authorized database-change procedure. That command can perform schema and data
repairs, so take a current backup and review the migration impact before running
it. Normal Vercel builds and API cold starts do not run migrations.

The same build validates that database, authentication, OTP, email, and CORS
settings are present, without opening a database connection. After deployment, open
`https://YOUR-BACKEND.vercel.app/api/ready`; every item under `configuration`
must be `true` before testing registration.

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
