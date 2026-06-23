// Vercel Serverless Function — handles POST /api/tts in production.
//
// Mirrors the local dev proxy in vite.config.js: the browser POSTs { text },
// this function adds the secret ELEVENLABS_API_KEY (set in Vercel → Project
// Settings → Environment Variables), calls ElevenLabs, and returns MP3 audio.
// Using a server voice means every user hears the exact same voice.

import { Readable } from "node:stream";

// NOTE: On the ElevenLabs FREE plan, only built-in "premade" voices work via the
// API — community "Voice Library" voices return 402. Free-tier-OK premade males:
// Bill (older), George (mature British), Brian, Daniel, Arnold, Adam.
const ELEVENLABS_DEFAULT_VOICE_ID = "pqHfZKP75CvOlQylNhV4"; // "Bill" — older American male (premade, free-tier OK)
// eleven_flash_v2_5 is ElevenLabs' lowest-latency model (~75ms model latency,
// 32 languages). Swap to "eleven_turbo_v2_5" for a touch more warmth at slightly
// higher latency, or back to "eleven_multilingual_v2" for max fidelity (slowest).
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";
// Lighter format = smaller payload + faster first audio chunk when streaming.
// 22050/32kbps is plenty for spoken speech on a projector; bump to mp3_44100_64
// or mp3_44100_128 via env if you want richer audio.
const ELEVENLABS_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_22050_32";
const ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};

export default async function handler(req, res) {
  // GET lets the browser's <audio> element stream the endpoint directly (text
  // rides in the query string); POST is kept for programmatic callers.
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: {
        message:
          "ELEVENLABS_API_KEY is not set. Add it in Vercel → Project Settings → Environment Variables, then redeploy.",
      },
    });
    return;
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || ELEVENLABS_DEFAULT_VOICE_ID;

  try {
    // Text comes from the query string (GET, native <audio> streaming) or the
    // JSON body (POST).
    const text = (req.query?.text ?? req.body?.text ?? "").toString();

    // The /stream endpoint returns audio as it's generated; piping it straight
    // through lets the browser start playing the first words almost immediately.
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${ELEVENLABS_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL_ID,
          voice_settings: ELEVENLABS_VOICE_SETTINGS,
        }),
      }
    );

    if (!upstream.ok || !upstream.body) {
      // Forward the JSON error (e.g. bad voice_id, quota exceeded).
      const errText = await upstream.text();
      res.status(upstream.status || 502);
      res.setHeader("Content-Type", "application/json");
      res.send(errText || JSON.stringify({ error: { message: "TTS request failed" } }));
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    // Pipe ElevenLabs' chunked audio straight to the client (no full-buffer wait).
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    res.status(500).json({ error: { message: String(err) } });
  }
}
