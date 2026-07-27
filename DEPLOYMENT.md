# Deployment Guide — Safety Radar

This guide walks you from a freshly cloned repo to a production install:
database on **Supabase**, backend on **Render**, frontend on **Vercel**, and a
standalone **Android APK** built with Capacitor in Android Studio.

> **Pre-requisites**
> * Node.js 18.17+ and npm 9+
> * A [Supabase](https://supabase.com) account (free tier works)
> * A [Render](https://render.com) account (free tier works)
> * A [Vercel](https://vercel.com) account (free tier works)
> * _(APK only)_ [Android Studio](https://developer.android.com/studio) with Android SDK 34+

---

## 0. Clone & install

```bash
git clone <your-fork-url> community-safety-platform
cd community-safety-platform
npm install
```

---

## 1. Database (Supabase) — ~5 minutes

1. Create a new Supabase project (any region close to your users).
2. Wait for the database to provision (~2 minutes).
3. Open **SQL Editor** → **New Query**.
4. Paste the contents of [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql) and click **Run**.
5. Verify by running `SELECT COUNT(*) FROM public.safety_reports;` — it should return `0`.
6. From **Settings → Database**, copy the **Connection string (URI)** (it looks like `postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres`). Save it as `DATABASE_URL` for the next step.
7. From **Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **`service_role` key** (never expose this publicly!) → `SUPABASE_SERVICE_ROLE_KEY`
   - **`anon` `public` key** → `VITE_SUPABASE_ANON_KEY` (frontend)

### Enable Google OAuth in Supabase

1. **Supabase Dashboard → Authentication → Providers → Google**.
2. Toggle **Enable**.
3. Create an OAuth client in [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials):
   - **Authorized JavaScript origins:** `https://<your-vercel-domain>` and `http://localhost:5173` (dev)
   - **Authorized redirect URI:** `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
4. Paste the Google Client ID & Client Secret into Supabase and save.

---

## 2. Backend (Render) — ~5 minutes

### Option A — Blueprint (recommended)

1. Push the repo to GitHub.
2. In Render, click **New + → Blueprint** and select the repo.
3. Render will detect [`backend/render.yaml`](./backend/render.yaml) and create a `community-safety-api` web service.
4. When prompted, fill in the secret env vars:

   | Key | Where to find it |
   |---|---|
   | `DATABASE_URL` | Supabase → Settings → Database → Connection string (URI) |
   | `SUPABASE_URL` | Supabase → Settings → API → Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` secret key |
   | `HMAC_SECRET` | Click **Generate** (Render creates a strong random value for you) or run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `CORS_ORIGIN` | `https://<your-vercel-domain>` (use `http://localhost:5173` for local dev) |

5. Click **Apply**. Render will build and deploy. Once live, your API is at `https://<svc>.onrender.com/health`.
6. After you deploy the frontend (step 3), come back and update `CORS_ORIGIN` to include your Vercel URL if you used a placeholder.

### Option B — Manual Web Service

1. Render → **New + → Web Service** → connect your GitHub repo.
2. Set:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Health Check Path:** `/health`
3. Add the same environment variables above.
4. Click **Deploy**.

### Verify

```bash
curl https://<your-render-url>/health
# → {"ok":true,"service":"community-safety-api","ts":"..."}
```

---

## 3. Frontend (Vercel) — ~3 minutes

1. Push your repo to GitHub.
2. In Vercel, click **Add New → Project** and import the repo.
3. Under **Root Directory**, select `frontend`.
4. Vercel auto-detects Vite; keep the default framework preset.
5. Add **Environment Variables** (all three):

   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://<your-render-url>` (no trailing slash) |
   | `VITE_SUPABASE_URL` | Same Supabase project URL from step 1 |
   | `VITE_SUPABASE_ANON_KEY` | Supabase `anon`/public key from step 1 |

6. Click **Deploy**. Your app goes live at `https://<project>.vercel.app`.

The repository includes [`frontend/vercel.json`](./frontend/vercel.json) which:
- Serves `index.html` for all client-side routes (SPA rewrite),
- Adds security headers (CSP-friendly `Permissions-Policy` allowing geolocation only for the app, X-Frame-Options DENY, X-Content-Type-Options nosniff),
- Sets a long `immutable` cache for hashed assets in `/assets/`,
- Ensures `sw.js` is never cached aggressively.

### Update CORS on Render (after frontend deploy)

Go back to Render → your service → **Environment** and set `CORS_ORIGIN` to your
Vercel URL (comma-separated if you also want to keep a local-dev origin, e.g.
`https://safety-radar.vercel.app,http://localhost:5173`). Save and redeploy.

### Verify

Open your Vercel URL. You should see the Sign-In screen. Tap **Continue with
Google**, allow location permissions, and the safety map should load. Submit a
test report with the red shield button to confirm end-to-end flow.

---

## 4. Android APK (Capacitor) — ~10 minutes

The [`frontend/capacitor.config.json`](./frontend/capacitor.config.json) is
pre-configured with `appId=com.safety.app`, `appName=Safety Radar`, HTTPS
scheme, splash screen, status bar, and geolocation permission prompts.
`AndroidManifest.xml` already requests `ACCESS_FINE_LOCATION`,
`ACCESS_COARSE_LOCATION`, `INTERNET`, `ACCESS_NETWORK_STATE`, and `WAKE_LOCK`.

### One-time setup

1. Install Android Studio and open **SDK Manager → SDK Platforms** — install **Android 14 (API 34)**.
2. From **SDK Tools**, install **Android SDK Build-Tools 34+** and **Android SDK Platform-Tools**.
3. Ensure `frontend/android/` exists (it was generated by `npx cap add android` during setup). If you are on a fresh clone:
   ```bash
   cd frontend
   npm install
   npx cap init "Safety Radar" "com.safety.app" --web-dir dist   # only if capacitor.config.json is missing
   npx cap add android
   ```

### Build and sync the web app

```bash
# From repo root — or `cd frontend` if you work directly there
cd frontend
npm run build           # produces frontend/dist
npx cap sync android    # copies dist/ into android/app/src/main/assets/public
```

### Open in Android Studio and produce the APK

```bash
npx cap open android
```

Once Android Studio opens and finishes its first Gradle sync (be patient on the
first run):

1. In the menu bar, click **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
2. When the build finishes, click the **Locate** link in the notification pop-up.
3. The file is named `app-debug.apk` (typically under
   `android/app/build/outputs/apk/debug/`). Transfer it to any Android phone
   and install (you may need to allow “Install from unknown sources” once).

### Release APK (for sharing beyond test devices)

1. In Android Studio: **Build → Generate Signed Bundle / APK**.
2. Choose **APK**, create a new keystore (save it securely — lost keystores mean
   you can never update the app on Google Play), note the passwords.
3. Select **release** build and finish. The output `app-release.apk` is ready
   for sideloading or upload to the Play Console.

### Iteration loop

When you change frontend code:

```bash
npm run build
npx cap sync android
npx cap open android   # or just press "Run" in a still-open Studio window
```

---

## 5. Local development (quick recap)

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env   # fill in values
npm install
npm run dev            # http://localhost:10000

# Terminal 2 — frontend
cd frontend
cp .env.example .env   # set VITE_API_BASE_URL=http://localhost:10000
npm install
npm run dev            # http://localhost:5173
```

---

## 6. Production checklist

- [ ] Supabase project API keys stored securely; `anon` key is public, `service_role` key is **only** on Render.
- [ ] `HMAC_SECRET` is 64 random hex chars (run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- [ ] `CORS_ORIGIN` on Render matches your Vercel domain exactly (no trailing slash).
- [ ] Google OAuth callback on GCP points to the production Supabase URL.
- [ ] Android `versionCode`/`versionName` bumped in `android/app/build.gradle` before each APK release.
- [ ] Test the 3-submit/30-min rate limit by submitting four reports quickly — you should see HTTP 429.
- [ ] Verify that descriptions containing an email/phone/@handle get scrubbed (submit a test report like "call me at 555-123-4567" and inspect in Supabase's table editor — it should read "[phone]").

---

## Architecture at a glance

```
┌──────────────┐         ┌──────────────┐         ┌─────────────────────┐
│ Android APK  │         │  Vercel PWA  │         │ Capacitor/iOS (TBD) │
│  (Capacitor) │         │   (React)    │         └─────────┬───────────┘
└──────┬───────┘         └──────┬───────┘                   │
       │  HTTPS (Bearer JWT)    │ HTTPS (Bearer JWT)        │
       └────────────┬───────────┴───────────────────────────┘
                    ▼
             ┌──────────────────┐
             │ Render (Express) │   HMAC-SHA256 anonymization
             │ Node.js backend  │   rate-limit / geofence
             └────────┬─────────┘
                      │ TLS connection (pgbouncer supported)
                      ▼
             ┌──────────────────┐
             │  Supabase/Neon   │
             │ Postgres+PostGIS │
             └──────────────────┘
                      ▲
                      │ Google OAuth (JWT issuance & verification)
             ┌────────┴─────────┐
             │   Google OAuth   │
             └──────────────────┘
```
