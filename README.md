# ✨ Email Dispatcher Pro — Deployment Guide

## Architecture

```
Browser (React Frontend) ──→ Express Backend (Node.js) ──→ Gmail SMTP
      Vercel / Netlify           Railway / Render
         (Free)                      (Free)
```

- **Frontend**: React app — deployed to Vercel or Netlify (100% free)
- **Backend**: Express server — deployed to Railway or Render (free tier)
- **No database** — logs stored in browser localStorage, credentials never persisted
- **Multi-user**: Each user provides their own Gmail credentials per session

---

## Step 1 — Deploy the Backend (Railway — Recommended)

### Option A: Railway (easiest, free tier)
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Push the `backend/` folder to a GitHub repo (or use Railway CLI)
3. Railway auto-detects Node.js from `package.json`
4. Set environment variables (none required — all passed at runtime)
5. Your backend URL will be: `https://your-app.up.railway.app`

### Option B: Render (free tier)
1. Go to [render.com](https://render.com) → New Web Service
2. Connect your GitHub repo containing `backend/`
3. Build command: `npm install`
4. Start command: `node server.js`
5. Your backend URL: `https://your-app.onrender.com`

### Option C: Run locally (for testing)
```bash
cd backend
npm install
node server.js
# Runs on http://localhost:3001
```

---

## Step 2 — Deploy the Frontend (Vercel — Recommended)

### Option A: Vercel (easiest)
1. Go to [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. Set Root Directory to `frontend/`
3. Add Environment Variable:
   - Key: `REACT_APP_BACKEND_URL`
   - Value: `https://your-backend.up.railway.app`  ← from Step 1
4. Click Deploy → done!

### Option B: Netlify
1. Go to [netlify.com](https://netlify.com) → New Site from Git
2. Base directory: `frontend`
3. Build command: `npm run build`
4. Publish directory: `frontend/build`
5. Environment variables → Add `REACT_APP_BACKEND_URL`

### Option C: Run locally (for testing)
```bash
cd frontend
# Create .env file:
echo "REACT_APP_BACKEND_URL=http://localhost:3001" > .env
npm install
npm start
# Opens http://localhost:3000
```

---

## Step 3 — Configure Gmail

Each user needs a Gmail App Password (not their regular password):

1. Go to **myaccount.google.com/security**
2. Enable **2-Step Verification**
3. Search for **"App passwords"**
4. Create a new one → Select "Mail" → Copy the 16-character password
5. Enter it in the app's Settings tab

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

Markdown supported: `**bold**`, `*italic*`, `[link text](url)`

---

## Security Notes

- Credentials are **never stored on the server** — passed per-request
- No database — no user data retained between sessions  
- History stored in **browser localStorage** only
- For production: add rate limiting and CORS restriction to your backend domain

---

## Supported Email Providers

The backend currently supports **Gmail** (recommended). To use other providers, edit `backend/server.js`:

```js
// For Outlook/Hotmail:
service: 'hotmail'

// For custom SMTP:
host: 'smtp.yourprovider.com',
port: 587,
secure: false,
auth: { user: email, pass: password }
```

---

## Free Tier Limits

| Platform | Limit |
|---|---|
| Railway | 500 hrs/month compute |
| Render | Spins down after 15min inactivity (cold start ~30s) |
| Vercel | 100GB bandwidth/month |
| Gmail | ~500 emails/day per account |

For >500 emails/day, use multiple sender accounts or upgrade to Google Workspace.
