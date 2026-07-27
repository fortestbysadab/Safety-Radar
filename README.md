# Community Safety Intelligence Platform

> Privacy-first, crowdsourced public safety — real-time hazard heatmaps,
> one-tap reporting, and anonymized safe-route intelligence.

## Repository Layout (Monorepo)

```
community-safety-platform/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # PostGIS schema, RLS, API functions
├── backend/                         # Node.js + Express API (Render)
│   └── src/
│       ├── config/                  # Env, db pool, auth clients
│       ├── middleware/              # Rate limiting, HMAC anon, validation
│       ├── routes/                  # REST endpoints
│       ├── services/                # Biz logic: reports, votes, geofence
│       ├── utils/                   # Logger, sanitization, distance helpers
│       └── index.js
├── frontend/                        # React + Vite PWA (Vercel)
│   ├── src/
│   │   ├── components/              # Map, ReportButton, Heatmap, Card…
│   │   ├── hooks/                   # useGeolocation, useHazards, useAuth…
│   │   ├── pages/                   # Home, Settings, SafetyMap
│   │   ├── services/                # API client, Supabase auth wrapper
│   │   ├── utils/                   # Formatters, geo helpers
│   │   └── styles/
│   └── public/                      # PWA manifest, icons
├── docs/                            # Architecture notes, runbooks
├── package.json                     # NPM workspaces root
└── .gitignore
```

## Tech Stack

| Layer | Tech | Host |
|-------|------|------|
| Frontend | React + Vite, Leaflet.js, PWA | Vercel |
| Backend  | Node.js + Express | Render |
| Database | PostgreSQL + PostGIS | Supabase / Neon |
| Auth     | Google OAuth via Supabase Auth | Supabase |
| Mobile   | CapacitorJS → Android APK | Local Android Studio |

## Quick Start (Dev)

```bash
# Install dependencies for all workspaces
npm install

# Run database migration against Supabase
# (Run 001_initial_schema.sql in Supabase SQL Editor first)

# Start backend + frontend together
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)
```
DATABASE_URL=postgres://...        # Supabase/Neon Postgres connection string
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...      # server-only, never exposed to clients
HMAC_SECRET=...                    # long random string for user-ID hashing
PORT=10000
CORS_ORIGIN=http://localhost:5173
```

### Frontend (`frontend/.env`)
```
VITE_API_BASE_URL=http://localhost:10000
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...         # public anon key
```

## Anonymity Model

1. Google Sign-In returns a stable `sub` ID.
2. The backend hashes `sub` with `HMAC-SHA256(secret, sub)` → `anon_user_hash`.
3. Only the hash is ever written to the database. No email, name, or Google ID is persisted.
4. The hash is used solely for rate-limiting and anti-duplicate-vote checks.

See `supabase/migrations/001_initial_schema.sql` for the full schema.
