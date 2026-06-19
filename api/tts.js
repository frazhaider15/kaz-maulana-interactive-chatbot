// Vercel Serverless Function — handles POST /api/tts in production.
//
// Mirrors the local dev proxy in vite.config.js: the browser POSTs { text },
// this function adds the secret ELEVENLABS_API_KEY (set in Vercel → Project
// Settings → Environment Variables), calls ElevenLabs, and returns MP3 audio.
// Using a server voice means every user hears the exact same voice.

// NOTE: On the ElevenLabs FREE plan, only built-in "premade" voices work via the
// API — community "Voice Library" voices return 402. Free-tier-OK premade males:
// Bill (older), George (mature British), Brian, Daniel, Arnold, Adam.
const ELEVENLABS_DEFAULT_VOICE_ID = "pqHfZKP75CvOlQylNhV4"; // "Bill" — older American male (premade, free-tier OK)
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
    const { text } = req.body || {};
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${ELEVENLABS_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: (text || "").toString(),
          model_id: ELEVENLABS_MODEL_ID,
          voice_settings: ELEVENLABS_VOICE_SETTINGS,
        }),
      }
    );

    if (!upstream.ok) {
      // Forward the JSON error (e.g. bad voice_id, quota exceeded).
      const errText = await upstream.text();
      res.status(upstream.status);
      res.setHeader("Content-Type", "application/json");
      res.send(errText || JSON.stringify({ error: { message: "TTS request failed" } }));
      return;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audio);
  } catch (err) {
    res.status(500).json({ error: { message: String(err) } });
  }
}
