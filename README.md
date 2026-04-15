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
    ├── app/
    │   ├── layout.js
    │   └── page.js
    ├── next.config.mjs
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

The repository root also contains an unrelated `package.json` (Express backend). **If Vercel builds from the repo root without pointing at `web`, you will get a broken deploy or a `404 NOT_FOUND` page.**

Do **one** of the following:

### Option A (recommended)

1. Import this GitHub repository in Vercel
2. **Project → Settings → General → Root Directory** → set to **`web`**
3. Save, then **Redeploy**
4. Leave **Build Command** and **Output Directory** empty (defaults for Next.js)

### Option B

- Leave Root Directory as `.` (repository root). A root `vercel.json` is included so install/build run inside `web/`. Redeploy after pulling the latest `main`.

This keeps the extension and web app simple, separated, and easy to maintain.
