# Ustadh Noor — Interactive Karbala Guide

An interactive Islamic education chatbot that helps children (ages 6–14) learn
about Karbala, Imam Hussain (AS), Muharram, and Azadari. Built with React + Vite.
KAZ School & Welfare.

Students type a question (or tap one of the suggested prompts), it's sent to
Claude, and Ustadh Noor — an animated scholar avatar — replies in a chat panel.

## Prerequisites

- **Node.js 18+** (this project was set up on Node 22)
- An **Anthropic API key** — https://console.anthropic.com/settings/keys
- An **ElevenLabs API key** — https://elevenlabs.io (powers the spoken voice)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Add your API key
cp .env.example .env       # on Windows PowerShell: copy .env.example .env
# then edit .env and paste your Anthropic key

# 3. Start the dev server
npm run dev
```

Open the URL Vite prints (default http://localhost:5173). Type a question, press
Enter, or tap one of the **Quick Questions** chips.

## How it works

```
Browser (React) ──POST /api/chat──► Vite proxy ──► Anthropic API   (the answer text)
   (no keys)     ──POST /api/tts ──► Vite proxy ──► ElevenLabs API  (the spoken MP3)
                                     (inject keys server-side)
```

- `src/KarbalaChatbot.jsx` — the UI component (animated avatar, chat panel,
  suggested questions). It POSTs the conversation to `/api/chat`, then POSTs the
  reply text to `/api/tts` and plays the returned audio.
- `vite.config.js` — middleware that proxies `/api/chat` to Anthropic and
  `/api/tts` to ElevenLabs so the **API keys stay on the server** and are never
  shipped to the browser (also avoids the CORS block on direct browser calls).

The chat proxy pins the model to `claude-sonnet-4-6` (edit the `MODEL` constant
in `vite.config.js` and `api/chat.js`).

## Voice (same voice for every user)

The spoken voice comes from **ElevenLabs**, generated server-side, so every user
hears the exact same elderly/mature male voice regardless of their device — the
browser's built-in voices differ per OS and can't be enforced.

- The default voice is **"Bill"** (an older American male). To change it, set
  `ELEVENLABS_VOICE_ID` in `.env` to any usable `voice_id`.
- **Free plan caveat:** on the ElevenLabs free tier, only built-in **premade**
  voices work via the API — community **Voice Library** voices return
  `402 paid_plan_required`. Premade male voices that are free-tier OK:
  `Bill` (older, `pqHfZKP75CvOlQylNhV4`), `George` (mature British,
  `JBFqnCBsd6RMkjVDRZzb`), `Brian` (`nPczCjzI2devNBz1zQrb`),
  `Daniel` (`onwK4e9ZLuTAKqWW03F9`), `Arnold` (`VR6AewLTigWG4xSOukaG`),
  `Adam` (`pNInz6obpgDQGcFmaJgB`). To use a Voice-Library/"Age: Old" voice,
  upgrade to a paid plan.
- Voice/model settings live in the `ELEVENLABS_*` constants in `vite.config.js`
  (dev) and `api/tts.js` (production) — keep them in sync.
- A 🔊/🔇 toggle on screen lets you mute the voice (useful in a classroom).

> Browsers block audio until the user interacts with the page, so the opening
> greeting speaks on the **first click or key press**, which also unlocks audio
> for the rest of the session.

## Optional: KAZ logo

`src/KarbalaChatbot.jsx` has a `KAZ_LOGO_B64` constant set to `"LOGO_PLACEHOLDER"`.
Until you replace it with a real base64 data URI (`data:image/png;base64,...`),
a styled "KAZ" text badge is shown in its place.

## Build for production

```bash
npm run build     # outputs to dist/
npm run preview   # serves dist/ with the same /api/chat proxy
```

> **Note:** `npm run preview` is for local verification only. The `/api/chat`
> proxy in `vite.config.js` only runs locally — see deployment below for how it
> works in production.

## Deploying to Vercel

The local proxies in `vite.config.js` do **not** run on Vercel (Vercel serves the
static `dist/` build, with no Vite server). Instead, `api/chat.js` and `api/tts.js`
are **Vercel serverless functions** that do the same job in production — Vercel
automatically exposes any file in the root `api/` folder, so they become
`/api/chat` and `/api/tts`.

Two things are required for it to work:

1. **The `api/chat.js` and `api/tts.js` files must be deployed** (commit/push, or redeploy).
2. **Set the keys in Vercel:** Project → Settings → Environment Variables → add
   `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` (and optionally `ELEVENLABS_VOICE_ID`),
   applied to Production (and Preview if you use it). Then **redeploy** — env-var
   changes only take effect on a new build.

Until the keys are set, the app shows an "…API_KEY is not set…" message (the chat
reply on screen, or silent audio for TTS).

> Local dev (`vite.config.js` proxies) and production (`api/chat.js`, `api/tts.js`)
> share the same model/voice settings — if you change one, update both.
