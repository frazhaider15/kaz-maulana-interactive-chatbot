# Ustadh Noor — Interactive Karbala Guide

An interactive Islamic education chatbot that helps children (ages 6–14) learn
about Karbala, Imam Hussain (AS), Muharram, and Azadari. Built with React + Vite.
KAZ School & Welfare.

Students type a question (or tap one of the suggested prompts), it's sent to
Claude, and Ustadh Noor — an animated scholar avatar — replies in a chat panel.

## Prerequisites

- **Node.js 18+** (this project was set up on Node 22)
- An **Anthropic API key** — https://console.anthropic.com/settings/keys

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
Browser (React)  ──POST /api/chat──►  Vite dev-server proxy  ──►  Anthropic API
   (no API key)                        (injects ANTHROPIC_API_KEY)
```

- `src/KarbalaChatbot.jsx` — the UI component (animated avatar, chat panel,
  suggested questions). It POSTs the full conversation to `/api/chat`.
- `vite.config.js` — a small middleware that proxies `/api/chat` to Anthropic so
  the **API key stays on the server** and is never shipped to the browser. It
  also avoids the CORS block that prevents calling Anthropic directly from a page.

The proxy pins the model to `claude-sonnet-4-6`. To change it, edit the `MODEL`
constant near the top of `vite.config.js` (and `api/chat.js` for production).

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

The local proxy in `vite.config.js` does **not** run on Vercel (Vercel serves the
static `dist/` build, with no Vite server). Instead, `api/chat.js` is a **Vercel
serverless function** that does the same job in production — Vercel automatically
exposes any file in the root `api/` folder, so it becomes `/api/chat`.

Two things are required for it to work:

1. **The `api/chat.js` file must be deployed** (commit/push it, or redeploy).
2. **Set the API key in Vercel:** Project → Settings → Environment Variables →
   add `ANTHROPIC_API_KEY` = your key (apply to Production, and Preview if you
   use it). Then **redeploy** — env-var changes only take effect on a new build.

Until the key is set, the app shows
"ANTHROPIC_API_KEY is not set…" as its on-screen reply.

> Local dev (`vite.config.js` proxy) and production (`api/chat.js` function) share
> the same `MODEL`/`max_tokens` settings — if you change the model, update both.
