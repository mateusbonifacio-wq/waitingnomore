# Keel site adapters

## How it works

1. **Manifest** loads one `*-generation.js` script **before** `content.js` for each host pattern.
2. That script assigns **`globalThis.__KEEL_GENERATION_API`** with:
   - `siteId` — short string for logging
   - `isStopGenerationControl(el)` — used for overlay positioning (avoid covering the stop control)
   - `detectGeneratingState()` — returns whether the model is currently generating

3. **`content.js`** holds all shared overlay, sessions, storage, and polling logic.

## Add a new site

1. Copy `gemini-generation.js` to `sites/yoursite-generation.js`.
2. Implement the same three exports on `__KEEL_GENERATION_API` (match the ChatGPT file as reference).
3. Add a **`content_scripts`** entry in `manifest.json`:
   - `matches`: URL patterns for that product
   - `js`: `["sites/yoursite-generation.js", "content.js"]`
   - `css`: `["styles.css"]`
   - `run_at`: `"document_start"` (same as ChatGPT) unless the app needs `document_idle`
4. Reload the unpacked extension and verify **Stop** / **streaming** detection in DevTools.

## Limits

- **Chrome Web Store** builds use a fixed extension id; **webBridge** / `externally_connectable` must include any new **https** origins you ship to.
- Google UIs change often — prefer several small checks over one brittle selector.
