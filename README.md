# 🌿 The Climate Architects — Cloudflare Migration

Migrated from Netlify → **Cloudflare Pages + Functions**.

---

## What Changed (Netlify → Cloudflare)

| Netlify | Cloudflare | Notes |
|---------|------------|-------|
| `netlify.toml` | `wrangler.toml` | Config file |
| `netlify/functions/*.js` | `functions/api/*.js` | Functions folder |
| `export const handler = async (event)` | `export async function onRequestPost(context)` | Function signature |
| `process.env.VAR` | `context.env.VAR` | Env variable access |
| `@netlify/blobs` | Cloudflare KV (`env.TCA_KV`) | Key-value storage |
| `jsonwebtoken` (Node) | Web Crypto API (built-in) | JWT — Workers don't have Node |
| `netlify deploy` | `wrangler pages deploy public` | Deploy command |
| Netlify dashboard | Cloudflare dashboard | Where you set env vars |

---

## Project Structure

```
tca-cloudflare/
├── wrangler.toml                    ← Cloudflare config (replaces netlify.toml)
├── package.json
├── .env.example                     ← Copy to .env for local dev (never commit)
├── public/                          ← All your HTML files go here
│   ├── index.html
│   ├── dashboard.html
│   ├── dashboard-sg.html
│   ├── dashboard-sg-free.html
│   ├── dashboard-eu.html
│   ├── dashboard-eu-free.html
│   └── ... (all other HTML, CSS, logo.png)
└── functions/
    ├── _shared/
    │   └── helpers.js               ← JWT, Supabase, CORS helpers
    └── api/
        ├── login.js                 ← POST /api/login
        ├── register.js              ← POST /api/register
        ├── me.js                    ← GET/PATCH /api/me
        ├── audits.js                ← GET/POST /api/audits
        ├── chat.js                  ← POST /api/chat
        └── admin.js                 ← GET/PATCH /api/admin
```

---

## Deploy in 5 Steps

### 1. Install Wrangler CLI
```bash
npm install -g wrangler
wrangler login   # opens browser to authenticate with Cloudflare
```

### 2. Copy your HTML files into /public
```bash
# From your tca-v2 folder, copy everything into public/
cp -r /path/to/tca-v2/*.html public/
cp /path/to/tca-v2/logo.png public/
```

### 3. Set environment variables
Go to **Cloudflare Dashboard → Pages → Your Project → Settings → Environment Variables** and add:

| Variable | Value |
|----------|-------|
| `JWT_SECRET` | Run: `openssl rand -hex 64` |
| `GEMINI_API_KEY` | From https://aistudio.google.com |
| `SUPABASE_URL` | From Supabase project settings |
| `SUPABASE_SERVICE_KEY` | Service role key from Supabase |
| `ALLOWED_ORIGIN` | `https://your-project.pages.dev` |

### 4. (Optional) Set up Cloudflare KV for chat rate limiting
```bash
wrangler kv:namespace create TCA_KV
# Copy the id it gives you into wrangler.toml under [[kv_namespaces]]
```

### 5. Deploy
```bash
npm install
wrangler pages deploy public
```

That's it. Cloudflare gives you a URL like `https://tca-cloudflare.pages.dev`.

---

## Local Development
```bash
npm install
wrangler pages dev public --compatibility-date=2024-01-01
# Runs at http://localhost:8788
```

---

## Supabase Database (unchanged)

Your Supabase tables stay exactly the same. No database migration needed.

Required tables:
```sql
-- users
create table users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text unique not null,
  password_hash text not null,
  plan text default 'free',
  role text default 'user',
  created_at timestamptz default now()
);

-- audits
create table audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  score int default 0,
  applicable int default 0,
  compliant int default 0,
  gaps jsonb default '[]',
  answers jsonb default '{}',
  ai_insight text default '',
  market text default 'sg',
  created_at timestamptz default now()
);
```

---

## HTML Files — One Change Required

In every dashboard HTML file, the `API_BASE` is already set to `/api` which works perfectly on Cloudflare Pages — no change needed.

```javascript
const API_BASE = '/api'; // ✅ works on Cloudflare Pages
```

---

## Why Cloudflare is Better (for your use case)

| | Netlify | Cloudflare |
|--|---------|-----------|
| Free function invocations | 125k/month | 100k/day |
| Bandwidth | 100GB/month | Unlimited |
| Execution time | 10s max | 30s max (CPU: 10ms) |
| Global edge | 6 regions | 300+ cities |
| KV storage | Netlify Blobs | Cloudflare KV (faster) |
| Price | $9/month individual | **Free** until significant scale |
