# ✨ Deepraj Mail Pro — Deployment Guide

## Architecture

```
Browser (React)  ──→  Express Backend (Node.js)  ──→  Gmail / SMTP
   Vercel               Render / Docker / Railway
  (Frontend)       PostgreSQL (Neon / Render DB)
                   BullMQ + Redis (or in-memory fallback)
                   Vercel SMTP Proxy (bypasses port firewall)
```

- **Frontend**: React 18 app — deployed to Vercel or Netlify (free)
- **Backend**: Express + Node.js — deployed to Render, Railway, or Docker
- **Database**: PostgreSQL — campaigns, history, tracking events, scheduled jobs, SMTP credentials (AES-256-GCM encrypted)
- **Queue**: BullMQ + Redis for reliable campaign dispatch; automatic in-memory fallback for local dev without Redis
- **Auth**: JWT-based, 7-day sessions, bcrypt password hashing, forced password reset on first login
- **Multi-tenant**: Each client has an isolated tenant ID; data is fully segregated

---

## Step 1 — Deploy the Backend (Render — Recommended)

### Option A: Render (free tier)
1. Go to [render.com](https://render.com) → New Web Service
2. Connect your GitHub repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Root directory: `backend/`
6. Add a **PostgreSQL** database from the Render dashboard
7. Set environment variables (see Step 3)
8. Your backend URL: `https://your-app.onrender.com`

### Option B: Railway
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the `backend/` directory
3. Add a PostgreSQL plugin from the Railway dashboard
4. Set environment variables
5. Your backend URL: `https://your-app.up.railway.app`

### Option C: Docker (unified — backend serves frontend)
```bash
# From the project root:
docker compose up --build
# Runs on http://localhost:3001
```

### Option D: Run locally (for development)
```bash
cd backend
cp .env.example .env
# Fill in .env values (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_PASSWORD)
npm install
npm run dev
# Runs on http://localhost:3001
```

---

## Step 2 — Deploy the Frontend (Vercel — Recommended)

### Option A: Vercel (easiest)
1. Go to [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. Set Root Directory to `frontend/`
3. Add Environment Variable:
   - Key: `REACT_APP_BACKEND_URL`
   - Value: `https://your-backend.onrender.com` ← from Step 1
4. Click Deploy

### Option B: Netlify
1. Go to [netlify.com](https://netlify.com) → New Site from Git
2. Base directory: `frontend`
3. Build command: `npm run build`
4. Publish directory: `frontend/build`
5. Add `REACT_APP_BACKEND_URL` environment variable

### Option C: Run locally (for development)
```bash
cd frontend
echo "REACT_APP_BACKEND_URL=http://localhost:3001" > .env
npm install
npm start
# Opens http://localhost:3000
```

---

## Step 3 — Set Required Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Min 64-char random string (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | ✅ | Min 32-char key for SMTP encryption — **NEVER change after deploy** |
| `ADMIN_EMAIL` | ✅ | Default admin account email |
| `ADMIN_PASSWORD` | ✅ | Default admin password (min 12 chars in production) |
| `BACKEND_URL` | Optional | Public URL for tracking pixel links |
| `CORS_ORIGINS` | Optional | Comma-separated allowed frontend origins |
| `REDIS_URL` | Optional | Redis URL for BullMQ (uses in-memory fallback if absent) |
| `PROXY_SECRET` | Optional | Shared secret for Vercel SMTP proxy |
| `VERCEL_PROXY_URL` | Optional | URL of the Vercel SMTP proxy function |
| `BYPASS_PROXY_LOCALLY` | Optional | `true` to send direct SMTP in local dev |
| `SMTP_HOST` | Optional | Custom SMTP host for direct mode (e.g. `smtp.office365.com`) |
| `SMTP_PORT` | Optional | Custom SMTP port (default: `587`) |
| `SMTP_SECURE` | Optional | `true` for SSL/port 465, `false` for TLS/port 587 |

---

## Step 4 — Configure Gmail / SMTP

Each client needs a Gmail App Password (not their regular Gmail password):

1. Go to **myaccount.google.com/security**
2. Enable **2-Step Verification**
3. Search for **"App passwords"**
4. Create a new one → Select "Mail" → Copy the 16-character password
5. Admin enters it in the **Admin Panel → SMTP** section (locked for the client)

For other providers (Outlook, Yahoo, custom SMTP), set `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE` in `backend/.env` — see `.env.example` for examples.

---

## How PDF Matching Works

Upload PDFs named exactly like the value in your ID or Name column:

| Spreadsheet ID | Spreadsheet Name | PDF filename needed |
|---|---|---|
| `EN2024001` | `John Doe` | `EN2024001.pdf` OR `John Doe.pdf` |
| `USN123` | `Jane Smith` | `USN123.pdf` OR `Jane Smith.pdf` |

Matching priority: **ID first**, then **Name**.

---

## Template Syntax

Use `{{ column_name }}` in subject and body:

```
Dear {{ Name }},

Your enrollment ID is {{ Enrollment_ID }}.
Your score is {{ Score }}.
```

Column names with spaces become underscores: `Student Name` → `{{ Student_Name }}`

---

## Security Notes

- SMTP passwords are **AES-256-GCM encrypted** before DB storage
- Client credentials can be **locked by admin** — clients cannot modify locked credentials
- JWT tokens expire after **7 days**
- Accounts are **suspended in real-time** (60s cache) without requiring logout
- Rate limiting: Login 10/15min · Send 10/hr · API 200/min
- All tracking links validated for http/https protocol only (no `javascript:` injection)
- Session-only SMTP passwords are **never stored** in the database — scheduling requires admin-saved creds

---

## Supported Email Providers

The Vercel proxy supports any SMTP provider. For direct local mode (`BYPASS_PROXY_LOCALLY=true`):

| Provider | SMTP_HOST | SMTP_PORT | SMTP_SECURE |
|---|---|---|---|
| **Gmail** (default) | *(leave blank)* | — | — |
| Outlook / Microsoft 365 | `smtp.office365.com` | `587` | `false` |
| Yahoo | `smtp.mail.yahoo.com` | `587` | `false` |
| Custom / cPanel | `mail.yourdomain.com` | `465` | `true` |

---

## Free Tier Limits

| Platform | Limit |
|---|---|
| Render | Spins down after 15min inactivity (cold start ~30s) |
| Railway | 500 hrs/month compute |
| Vercel | 100GB bandwidth/month |
| Gmail | ~500 emails/day per account |
| Neon (PostgreSQL) | 512MB storage free |

For >500 emails/day, use multiple sender accounts or upgrade to Google Workspace.
