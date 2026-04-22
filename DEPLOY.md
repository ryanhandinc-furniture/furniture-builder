# Deploying the Furniture Builder

This walks you through getting the app on the public internet at URLs like
`furniture-builder.vercel.app` (frontend) and
`furniture-builder-backend.onrender.com` (backend), using only free
services.

**Time:** ~25 minutes the first time.

**You'll need:** a GitHub account (you have one), a Render account (sign up
at render.com, free), and a Vercel account (sign up at vercel.com, free).
Both Render and Vercel let you "Sign in with GitHub", which is the easiest
path.

**Cost:** $0 for testing. Both free tiers are generous enough for a
single-user preview.

---

## Step 1 — Put the code on GitHub

### 1a. Create an empty repo on GitHub

1. Go to https://github.com/new
2. Repository name: `furniture-builder` (anything you like)
3. Keep it **Private** if you prefer (deployment still works with private repos).
4. Leave "Initialize this repository" unchecked — we already have files.
5. Click **Create repository**.
6. On the next page, copy the URL shown under "…or push an existing
   repository from the command line". It looks like:
   `https://github.com/YOUR_USERNAME/furniture-builder.git`

### 1b. Push the code from your Mac

Open the **Terminal** app (Cmd + Space, type "Terminal", hit Enter).

Paste the following, **one line at a time**, pressing Enter after each.
Replace `YOUR_USERNAME` with your actual GitHub username.

```bash
cd "/Users/ryanhand/Documents/Claude/Projects/Furniture Builder"
git init
git add .
git commit -m "Initial scaffold"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/furniture-builder.git
git push -u origin main
```

If you've never used git on this Mac before, the first `git commit` may ask
you to set your name and email — run these once:

```bash
git config --global user.name "Ryan Hand"
git config --global user.email "ryan@inhabitr.ai"
```

then re-run the commit + push.

The final `git push` will open a browser window asking you to authorize
GitHub. Accept it. Your code is now at
`https://github.com/YOUR_USERNAME/furniture-builder`.

---

## Step 2 — Deploy the backend on Render

1. Go to https://dashboard.render.com and sign in with GitHub.
2. Click **New +** → **Web Service**.
3. Under "Connect a repository", find `furniture-builder` and click
   **Connect**. (If it doesn't appear, click "Configure account" to grant
   Render access to the repo.)
4. Render should auto-detect our `render.yaml` and pre-fill most fields.
   Confirm:
   - **Name:** `furniture-builder-backend`
   - **Region:** pick the one closest to you (Oregon / Frankfurt / Singapore)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Scroll to the bottom, click **Create Web Service**.
6. Render will start building. You'll see a log stream. First build takes
   ~3-5 minutes (installing sharp, better-sqlite3 native deps).
7. When you see `[boot] listening on http://localhost:...` in the logs, the
   service is live. Copy the URL at the top of the Render page — it looks
   like `https://furniture-builder-backend.onrender.com`. **Save this, you'll
   need it in Step 3.**
8. **Quick sanity check:** paste that URL + `/api/health` into your browser,
   e.g.
   `https://furniture-builder-backend.onrender.com/api/health`.
   You should see `{"ok": true, "ai": "mock"}`. If you see a spinner for
   ~50 seconds, that's the free-tier cold start — it's normal.

### Env vars already set for you (by render.yaml)

| Var                | Value              |
|--------------------|--------------------|
| `AI_PROVIDER`      | `mock`             |
| `STORAGE_DIR`      | `/tmp/storage`     |
| `DB_PATH`          | `/tmp/app.db`      |

When you're ready to flip on real AI:

1. On Render, open your service → **Environment** tab.
2. Change `AI_PROVIDER` to `anthropic`.
3. Add `ANTHROPIC_API_KEY` with your key.
4. Click **Save Changes** — Render redeploys automatically.

---

## Step 3 — Deploy the frontend on Vercel

1. Go to https://vercel.com/new and sign in with GitHub.
2. Click **Import** next to your `furniture-builder` repo.
3. Vercel auto-detects the root `vercel.json`, which handles the monorepo
   layout for you. You shouldn't need to change any build settings, but
   confirm:
   - **Framework Preset:** Other (or left blank)
   - **Build Command:** `cd frontend && npm install && npm run build`
     (auto-filled from vercel.json)
   - **Output Directory:** `frontend/dist`
4. Before clicking Deploy, expand **Environment Variables** and add:
   - Name: `VITE_API_URL`
   - Value: the Render URL you copied in Step 2, e.g.
     `https://furniture-builder-backend.onrender.com`
   - (no trailing slash)
5. Click **Deploy**. First build takes ~1-2 minutes.
6. When it's done, Vercel shows a big "Congratulations" screen with your
   URL — `https://furniture-builder-<hash>.vercel.app`. Click **Visit**.

You should see the Furniture Builder UI. Upload any PDF to try the mock AI
flow; you'll get a canned 12-unit matrix and can click into any unit to
place furniture.

---

## Step 4 — Iterating

Any time I change code in the repo, the workflow is:

```bash
cd "/Users/ryanhand/Documents/Claude/Projects/Furniture Builder"
git add .
git commit -m "describe the change"
git push
```

Vercel and Render both watch the GitHub repo and **auto-deploy on push**.
Typically: ~90 seconds for Vercel, ~2-3 minutes for Render.

You can also ping me to make changes — I'll edit the files, then you run
the three git commands above to publish.

---

## Known free-tier limitations (for later, not now)

- **Backend cold start (~50 sec):** Render free-tier services sleep after
  15 minutes of inactivity. First request after sleep wakes it up. If
  annoying, Render's $7/month Starter tier keeps it warm.
- **Data not persistent:** SQLite DB and uploaded plans live on
  `/tmp/` which Render wipes on every redeploy. When we're happy with the
  feature set, moving to a Render Postgres instance ($7/mo) + S3 or Render
  Disks storage would fix this.
- **Open CORS:** backend currently accepts requests from any origin. Fine
  for a private preview; tighten to the Vercel origin before anything real.

---

## Troubleshooting

**Render build fails at `npm install sharp`:** should be rare — sharp ships
prebuilt binaries. If it happens, check the logs for the exact error and
ping me.

**Frontend loads but every request fails with "Failed to fetch":**
`VITE_API_URL` is probably wrong. In Vercel: Settings → Environment
Variables — confirm it matches your Render URL exactly. After changing it,
click Deployments → ⋯ → **Redeploy** (env var changes don't trigger auto
redeploys).

**First request after a break hangs:** cold start. Wait ~50 seconds.

**"Application not found" on the Vercel URL:** build probably failed. Check
the Vercel deployment log — likely a TypeScript error.
