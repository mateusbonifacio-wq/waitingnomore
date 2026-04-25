# Chrome Web Store Review Notes (Keel Beta)

This document is for Chrome Web Store reviewers testing Keel beta.

## What Keel does

Keel shows a lightweight wellness/game overlay while AI responses are generating on:

- ChatGPT (`chatgpt.com`, `chat.openai.com`)
- Gemini (`gemini.google.com`)
- Claude (`claude.ai`, `www.claude.ai`)

## Quick test flow

1. Install extension and pin Keel.
2. Open ChatGPT, Gemini, or Claude.
3. Start an AI generation/response.
4. Wait a few seconds; Keel overlay appears.
5. Stop generation; overlay hides after completion/summary.
6. Open extension popup and click **Open Keel** (or top-right arrow icon) to open Keel web app.
7. Log in on Keel web app (if needed). This syncs auth to extension.
8. Return to AI site and complete:
   - one game session (sends `game_played`)
   - one brain answer (sends `brain_answer`)
9. In Keel web dashboard, verify leaderboard/events update.

## Permissions used

- `storage`: store extension settings, local queue, and lightweight local session history.

No `tabs`, no `history`, no `cookies`, no `webRequest`, and no `<all_urls>` host permission.

## Data handling summary

Keel does **not** sell personal data and does **not** use data for personalized advertising.

Keel stores:

- account/profile/settings (Supabase)
- leaderboard events (`game_played`, `brain_answer`) (Supabase)
- install/connect telemetry (`extension_version`, `browser_user_agent`) (Supabase)
- local extension settings/queues (`chrome.storage.local`)

Keel does **not** store analytics copies of AI prompts/responses.
