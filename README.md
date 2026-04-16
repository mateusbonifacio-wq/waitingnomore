# Idle-Time Interaction Repo

Clean single-developer structure with a Chrome extension and a web app ready for Vercel.

## Project Structure

```text
.
├── extension/   # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js
│   └── styles.css
└── web/         # Next.js app (deploy target: Vercel)
    ├── app/          # routes: /, /dashboard, /settings
    ├── components/
    ├── lib/
    ├── next.config.mjs
    ├── vercel.json   # forces Next.js on Vercel (see deploy notes)
    └── package.json
```

## Extension

- Location: `extension/`
- Status: keeps current behavior and logic
- Load in Chrome:
  1. Open `chrome://extensions`
  2. Enable Developer mode
  3. Click Load unpacked
  4. Select the `extension/` folder

## Web (Next.js)

- Location: `web/`
- Purpose: landing/dashboard app for session history
- Local run:

```bash
cd web
npm install
npm run dev
```

## Vercel Deployment (web only)

There is **no** `package.json` at the repository root — only inside `web/`. Vercel must treat **`web`** as the app root.

### Recommended setup

1. Import this GitHub repository in Vercel.
2. **Project → Settings → General → Root Directory** → set to **`web`** (not `.`).
3. Under **Build & Development Settings**:
   - **Framework Preset** → **Next.js** (or leave on *Auto* after pulling `web/vercel.json`).
   - **Output Directory** → leave **empty** (do not set `public`). Next.js is built by Vercel’s Next builder; there is no static export output folder to point at.
   - Clear any **overrides** for Install Command and Build Command so defaults apply (`npm install`, `npm run build` inside `web/`).
4. Save, then **Redeploy**.

### If the build fails with `cd: web: No such file or directory`

That happens when **Root Directory is already `web`** but an old **Install Command** still runs `cd web && npm install` (from a previous root `vercel.json` or a manual override). With Root Directory `web`, the shell is already inside `web/`, so there is no nested `web/` folder.

**Fix:** set Root Directory to **`web`**, remove the `cd web` prefix from Install/Build overrides (leave them empty), and redeploy.

### If the build fails with “No Output Directory named `public` found”

The project is a **Next.js** app, not a plain static site. That error means **Output Directory** in Vercel is set to **`public`** (or another static preset). After `next build`, Vercel does **not** expect your deploy output to live in `public/`.

**Fix:** **Project → Settings → General → Build & Development Settings** → set **Output Directory** to **empty** (remove `public`), set **Framework Preset** to **Next.js**, save, redeploy. The repo includes `web/vercel.json` with `"framework": "nextjs"` to steer detection once redeployed from `main`.

### Optional: deploy from repo root (`.`)

If you prefer Root Directory `.`, set **Install Command** to `npm install --prefix ./web` and **Build Command** to `npm run build --prefix ./web` in the Vercel project settings (do not use `cd web` unless the shell cwd is the repository root).

This keeps the extension and web app simple, separated, and easy to maintain.
