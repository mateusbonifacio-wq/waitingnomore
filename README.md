# Keel

Chrome extension + Next.js web companion for ChatGPT — calm, minimal, ready for Vercel + Supabase.

## Project Structure

```text
.
├── extension/   # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js
│   └── styles.css
└── web/         # Next.js app (deploy target: Vercel)
    ├── app/          # routes: /, /dashboard, /settings, /install, /login
    ├── components/
    ├── lib/
    ├── supabase/     # SQL schema bootstrap
    ├── next.config.mjs
    ├── vercel.json   # forces Next.js on Vercel (see deploy notes)
    └── package.json
```

## Extension

- Location: `extension/`
- **Web ↔ extension (local / Vercel previews):** `webBridge.js` is injected on the same URL patterns as `externally_connectable` (localhost, `*.vercel.app`, etc.). The web app talks to Keel via `postMessage` — testers do **not** need `NEXT_PUBLIC_EXTENSION_ID`.
- **Custom apex domain:** add your `https://your.domain/*` to both `content_scripts` (webBridge entry) and `externally_connectable` in `extension/manifest.json`, or set `NEXT_PUBLIC_EXTENSION_ID` once for the sendMessage fallback.
- **Chrome Web Store:** the published extension has a stable ID; you can ship that ID in production env if you prefer, but the bridge still covers listed origins.
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

### Environment

Create `web/.env.local` from `web/.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# Or use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... (same value as “publishable” / “anon” in Supabase UI).
# Optional: NEXT_PUBLIC_EXTENSION_ID — only for custom domains / sendMessage fallback
```

## Supabase setup

1. Create a Supabase project.
2. In **Authentication**, enable Email OTP / magic link.
3. Run `web/supabase/schema.sql` in the SQL editor.
4. Add the app URL(s) to Supabase Auth redirect allow-list (e.g. `http://localhost:3000/auth/callback` and your production callback URL).

This first version includes:
- `profiles` (user record),
- `user_settings` (per-user extension settings),
- `extension_installs` (install/connect events from web install flow),
- `idle_sessions` (ready for extension session upload).

## Vercel Deployment (web only)

There is **no** `package.json` at the repository root — only inside `web/`. Vercel must treat **`web`** as the app root.

### Recommended setup

1. Import this GitHub repository in Vercel.
2. **Project → Settings → General → Root Directory** → set to **`web`** (not `.`).
3. Under **Build & Development Settings** (Framework Settings):
   - **Framework Preset** → choose **Next.js** explicitly. Do **not** leave it as **Other** — *Other* uses a static-style pipeline (and may look for a `public` output folder), which breaks this app and can show a **blank** site.
   - **Output Directory** → leave **empty** (do not set `public`). Next.js is built by Vercel’s Next builder; there is no static export output folder to point at.
   - Clear any **overrides** for Install Command and Build Command so defaults apply (`npm install`, `npm run build` inside `web/`).
4. Click **Save**, then trigger a **new Production deployment** (Redeploy). If Vercel shows a warning that Production differs from Project Settings, saving here and redeploying clears that drift.

### If the build fails with `cd: web: No such file or directory`

That happens when **Root Directory is already `web`** but an old **Install Command** still runs `cd web && npm install` (from a previous root `vercel.json` or a manual override). With Root Directory `web`, the shell is already inside `web/`, so there is no nested `web/` folder.

**Fix:** set Root Directory to **`web`**, remove the `cd web` prefix from Install/Build overrides (leave them empty), and redeploy.

### If the build fails with “No Output Directory named `public` found”

The project is a **Next.js** app, not a plain static site. That error means **Output Directory** in Vercel is set to **`public`** (or another static preset). After `next build`, Vercel does **not** expect your deploy output to live in `public/`.

**Fix:** **Project → Settings → General → Build & Development Settings** → set **Output Directory** to **empty** (remove `public`), set **Framework Preset** to **Next.js**, save, redeploy. The repo includes `web/vercel.json` with `"framework": "nextjs"` to steer detection once redeployed from `main`.

### Optional: deploy from repo root (`.`)

If you prefer Root Directory `.`, set **Install Command** to `npm install --prefix ./web` and **Build Command** to `npm run build --prefix ./web` in the Vercel project settings (do not use `cd web` unless the shell cwd is the repository root).

This keeps the extension and web app simple, separated, and easy to maintain.
