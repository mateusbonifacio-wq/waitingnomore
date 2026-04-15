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

- Import this GitHub repository in Vercel
- Set Root Directory to `web`
- Build command: `npm run build`
- Output: default Next.js output

This keeps the extension and web app simple, separated, and easy to maintain.
