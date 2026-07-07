import { useState, useRef, useEffect } from "react";

// The KAZ (Khanum Amber Zehra) logo is served from the public/ folder at
// /kaz-logo.png, and is also wired up as the site favicon in index.html. If the
// file is missing the <img> onError handler falls back to a styled "KAZ" badge.
const KAZ_LOGO_SRC = "/kaz-logo.png";

// ── Voice (text-to-speech) ────────────────────────────────────────────────────
// Teacher Noor speaks his answers aloud using a SERVER-SIDE cloud voice
// (ElevenLabs), so every user hears the exact same elderly male voice regardless
// of their device — unlike the browser's built-in voices, which differ per OS.
//
// The browser points an <audio> element at /api/tts?text=... ; the server
// (vite.config.js in dev, api/tts.js on Vercel) injects the ElevenLabs key, picks
// the voice, and STREAMS back MP3 audio so playback can start on the first chunk
// instead of waiting for the whole file. The key never reaches the browser.
//
// To change the voice, set ELEVENLABS_VOICE_ID in .env (copy a voice_id from your
// ElevenLabs Voice Library — filter by Age "Old" for a more elderly sound).

// Strip emojis and markdown so the voice doesn't read "asterisk" / "rose emoji" aloud.
function cleanForSpeech(text) {
  if (!text) return "";
  return text
    .replace(/[\p{Extended_Pictographic}‍️⃣]/gu, "")
    .replace(/[*_`~#>]/g, "")
    .replace(/^[ \t]*[-•]\s+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Split streamed text into complete sentences for incremental speaking. A
// sentence is only emitted once it's followed by whitespace, so we never cut a
// word mid-token as the stream trickles in. The trailing remainder is returned
// for the caller to keep accumulating.
function splitSentences(buf) {
  const sentences = [];
  const re = /[^.!?…]*[.!?…]+["')\]]*\s+/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(buf)) !== null) {
    sentences.push(buf.slice(lastIndex, re.lastIndex).trim());
    lastIndex = re.lastIndex;
  }
  return { sentences, rest: buf.slice(lastIndex) };
}

// Pull the text out of one Anthropic SSE event block. Returns "" for pings,
// message_delta, and other non-text events.
function parseSseTextDelta(rawEvent) {
  let data = "";
  for (const line of rawEvent.split("\n")) {
    const l = line.trimStart();
    if (l.startsWith("data:")) data += l.slice(5).trim();
  }
  if (!data || data === "[DONE]") return "";
  try {
    const json = JSON.parse(data);
    if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
      return json.delta.text || "";
    }
  } catch {
    // Non-JSON keepalive line — ignore.
  }
  return "";
}

// A ~20ms silent WAV. Playing it on each pooled <audio> element during the
// opening user gesture "unlocks" them, so later (non-gesture) sentence
// transitions are allowed to autoplay even on stricter browsers.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

// ── Mouth viseme shapes ───────────────────────────────────────────────────────
// While speaking we cycle through a handful of mouth shapes (visemes) to fake
// natural lip movement. Each entry is what to draw for that frame.
const VISEMES = [
  { rx: 5.5, ry: 1.4 },   // nearly closed
  { rx: 6.5, ry: 3.8 },   // open "ah"
  { rx: 4.2, ry: 2.6 },   // round "oo"
  { rx: 7.5, ry: 2.0 },   // wide "ee"
  { rx: 5.0, ry: 4.6 },   // open wide
  { rx: 5.8, ry: 2.2 },   // mid
];

// ── Animated Scholar Avatar ───────────────────────────────────────────────────
// state: "idle" | "thinking" | "speaking" | "greeting"
function ScholarAvatar({ size = 80, state = "idle", floating = false }) {
  const speaking = state === "speaking";
  const thinking = state === "thinking";
  const greeting = state === "greeting";

  // Drive the mouth visemes only while actually speaking. A short, slightly
  // irregular interval reads as natural talking without needing audio analysis.
  const [viseme, setViseme] = useState(0);
  useEffect(() => {
    if (!speaking) return;
    let alive = true;
    let timer;
    const tick = () => {
      if (!alive) return;
      setViseme((v) => (v + 1 + Math.floor(Math.random() * 2)) % VISEMES.length);
      timer = setTimeout(tick, 90 + Math.random() * 80);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [speaking]);

  const mouth = VISEMES[viseme];
  // Unique-ish gradient ids so multiple avatars on the page don't clash.
  const uid = `${size}`;

  // Head wrapper animation: gentle bob while speaking, attentive lean while
  // thinking, soft float when idle (if requested).
  const headAnim = speaking
    ? "headBob 1.6s ease-in-out infinite"
    : thinking
    ? "headTilt 2.4s ease-in-out infinite"
    : floating
    ? "floatScholar 3.5s ease-in-out infinite"
    : "none";

  return (
    <svg
      width={size} height={size} viewBox="0 0 120 120"
      style={{
        flexShrink: 0,
        filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.65))",
        overflow: "visible",
      }}
    >
      <defs>
        <radialGradient id={`bg-${uid}`} cx="50%" cy="38%">
          <stop offset="0%" stopColor="#3a0f0f" />
          <stop offset="70%" stopColor="#1a0404" />
          <stop offset="100%" stopColor="#080000" />
        </radialGradient>
        <radialGradient id={`face-${uid}`} cx="42%" cy="32%">
          <stop offset="0%" stopColor="#f6d3a8" />
          <stop offset="60%" stopColor="#e0a86e" />
          <stop offset="100%" stopColor="#bd7a44" />
        </radialGradient>
        <linearGradient id={`turban-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2c2c34" />
          <stop offset="55%" stopColor="#161618" />
          <stop offset="100%" stopColor="#070708" />
        </linearGradient>
        <linearGradient id={`robe-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#26262a" />
          <stop offset="55%" stopColor="#131315" />
          <stop offset="100%" stopColor="#060607" />
        </linearGradient>
        <linearGradient id={`gold-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff1b0" />
          <stop offset="50%" stopColor="#ffd24d" />
          <stop offset="100%" stopColor="#c8920f" />
        </linearGradient>
        <filter id={`glow-${uid}`}>
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Outer halo rings */}
      <circle cx="60" cy="60" r="58.5" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1.2" opacity="0.45"/>
      <circle cx="60" cy="60" r="57" fill={`url(#bg-${uid})`}/>

      {/* ── Aba: black cleric cloak (static, sits behind the head) ── */}
      <ellipse cx="60" cy="116" rx="47" ry="31" fill={`url(#robe-${uid})`}/>
      <path d="M16 117 Q34 86 52 89 Q60 95 68 89 Q86 86 104 117Z" fill={`url(#robe-${uid})`}/>
      {/* inner qaba peeking at the neckline */}
      <path d="M52 89 L60 116 L68 89 Q60 95 52 89Z" fill="#2e2a22"/>
      <path d="M52 89 Q60 95 68 89" stroke="#4a4236" strokeWidth="1.3" fill="none" opacity="0.85"/>
      {/* aba shoulder folds & seams */}
      <path d="M30 110 Q40 92 51 90" stroke="#000" strokeWidth="1" fill="none" opacity="0.28"/>
      <path d="M90 110 Q80 92 69 90" stroke="#000" strokeWidth="1" fill="none" opacity="0.28"/>
      <path d="M34 96 Q44 90 52 91" stroke="#34343c" strokeWidth="0.7" fill="none" opacity="0.5"/>
      <path d="M86 96 Q76 90 68 91" stroke="#34343c" strokeWidth="0.7" fill="none" opacity="0.5"/>

      {/* ── Head + ammama (bobs / tilts with state) ── */}
      <g style={{ animation: headAnim, transformOrigin: "60px 70px" }}>
        {/* Neck + soft shadow */}
        <rect x="53" y="74" width="14" height="14" rx="6" fill="#bd7a44"/>
        <ellipse cx="60" cy="80" rx="9" ry="4" fill="#000" opacity="0.18"/>

        {/* Ears */}
        <ellipse cx="37.5" cy="66" rx="4" ry="6" fill={`url(#face-${uid})`}/>
        <ellipse cx="82.5" cy="66" rx="4" ry="6" fill={`url(#face-${uid})`}/>

        {/* Face base */}
        <ellipse cx="60" cy="64" rx="23" ry="25" fill={`url(#face-${uid})`}/>
        {/* Soft side shading for depth */}
        <path d="M60 40 Q80 44 82 64 Q82 84 60 88 Q74 70 72 56 Q70 46 60 40Z" fill="#a8682f" opacity="0.16"/>
        {/* Cheek warmth */}
        <ellipse cx="46" cy="68" rx="6" ry="4" fill="#e08858" opacity="0.32"/>
        <ellipse cx="74" cy="68" rx="6" ry="4" fill="#e08858" opacity="0.32"/>
        {/* Forehead shine */}
        <ellipse cx="54" cy="49" rx="9" ry="5" fill="#fff" opacity="0.12"/>

        {/* ── Full WHITE beard of an elderly scholar (drawn before mouth) ── */}
        {/* main mass: jaw + chin, leaving cheeks & eyes clear */}
        <path d="M37 60 Q36 88 49 101 Q60 109 71 101 Q84 88 83 60 Q80 73 74 79 L74 70 Q60 74 46 70 L46 79 Q40 73 37 60Z" fill="#efe9de"/>
        <path d="M40 62 Q40 86 52 98 Q60 104 68 98 Q80 86 80 62 Q74 78 60 82 Q46 78 40 62Z" fill="#dcd4c5"/>
        {/* sideburns connecting to turban */}
        <path d="M37 56 Q35 64 39 72 Q40 64 42 58Z" fill="#efe9de"/>
        <path d="M83 56 Q85 64 81 72 Q80 64 78 58Z" fill="#efe9de"/>
        {/* soft grey strands for texture */}
        <path d="M50 78 Q53 91 58 99" stroke="#b3aa99" strokeWidth="0.8" fill="none" opacity="0.55"/>
        <path d="M70 78 Q67 91 62 99" stroke="#b3aa99" strokeWidth="0.8" fill="none" opacity="0.55"/>
        <path d="M60 80 L60 101" stroke="#a89f8e" strokeWidth="0.7" fill="none" opacity="0.5"/>
        <path d="M55 82 Q56 93 59 100" stroke="#a89f8e" strokeWidth="0.5" fill="none" opacity="0.4"/>
        <path d="M65 82 Q64 93 61 100" stroke="#a89f8e" strokeWidth="0.5" fill="none" opacity="0.4"/>

        {/* ── Eyes ── */}
        {/* whites — a touch larger & brighter so he looks alert */}
        <ellipse cx="51" cy="60" rx="5.4" ry="4" fill="#fffaf2"/>
        <ellipse cx="69" cy="60" rx="5.4" ry="4" fill="#fffaf2"/>
        {/* iris + pupil (look slightly up when thinking) */}
        <g style={{ transform: thinking ? "translateY(-1px)" : "none" }}>
          <circle cx="51" cy="60" r="3.2" fill="#5a300d"/>
          <circle cx="69" cy="60" r="3.2" fill="#5a300d"/>
          <circle cx="51" cy="60" r="1.6" fill="#1a0c02"/>
          <circle cx="69" cy="60" r="1.6" fill="#1a0c02"/>
          <circle cx="52.4" cy="58.6" r="1.1" fill="#fff" opacity="0.95"/>
          <circle cx="70.4" cy="58.6" r="1.1" fill="#fff" opacity="0.95"/>
        </g>
        {/* Blinking eyelids (skin-coloured shutters that scale up to cover the eye) */}
        <g style={{ animation: "blinkLids 5.2s ease-in-out infinite", transformOrigin: "60px 60px" }}>
          <rect x="45.4" y="54" width="11.2" height="6.5" rx="3" fill={`url(#face-${uid})`}/>
          <rect x="63.4" y="54" width="11.2" height="6.5" rx="3" fill={`url(#face-${uid})`}/>
        </g>

        {/* Thin round wire spectacles */}
        <circle cx="51" cy="60" r="6.8" fill="none" stroke="#d8d3c8" strokeWidth="1.1" opacity="0.9"/>
        <circle cx="69" cy="60" r="6.8" fill="none" stroke="#d8d3c8" strokeWidth="1.1" opacity="0.9"/>
        <circle cx="51" cy="60" r="6.8" fill="#fff" opacity="0.06"/>
        <circle cx="69" cy="60" r="6.8" fill="#fff" opacity="0.06"/>
        <path d="M57.8 60 Q60 58.6 62.2 60" stroke="#d8d3c8" strokeWidth="1.1" fill="none" opacity="0.9"/>
        <path d="M44.2 60 Q40 59 37.5 61" stroke="#d8d3c8" strokeWidth="0.9" fill="none" opacity="0.65"/>
        <path d="M75.8 60 Q80 59 82.5 61" stroke="#d8d3c8" strokeWidth="0.9" fill="none" opacity="0.65"/>

        {/* Grey eyebrows of an elderly man — raise when speaking/thinking */}
        <g style={{ transform: (speaking || thinking) ? "translateY(-1.5px)" : "none", transition: "transform 0.25s" }}>
          <path d="M43 51 Q51 47.5 59 50.5" stroke="#8d8577" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
          <path d="M61 50.5 Q69 47.5 77 51" stroke="#8d8577" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
        </g>

        {/* Gentle age lines under the eyes */}
        <path d="M45.5 66.5 Q48.5 68 51.5 67.2" stroke="#a8682f" strokeWidth="0.7" fill="none" opacity="0.3"/>
        <path d="M68.5 67.2 Q71.5 68 74.5 66.5" stroke="#a8682f" strokeWidth="0.7" fill="none" opacity="0.3"/>

        {/* Nose */}
        <path d="M60 61 Q57.5 69 56 71 Q60 73.5 64 71 Q62.5 69 60 61Z" fill="#c98a52" opacity="0.5"/>
        <ellipse cx="57.6" cy="71" rx="1.3" ry="1" fill="#9c5f2c" opacity="0.5"/>
        <ellipse cx="62.4" cy="71" rx="1.3" ry="1" fill="#9c5f2c" opacity="0.5"/>

        {/* ── White mustache (on top of beard, above the lip) ── */}
        <path d="M48 74 Q54 70.5 60 73 Q66 70.5 72 74 Q66 79 60 76.5 Q54 79 48 74Z" fill="#f3eee4"/>
        <path d="M52 74.5 Q56 72.5 60 74 Q64 72.5 68 74.5" stroke="#c4bcac" strokeWidth="0.6" fill="none" opacity="0.6"/>

        {/* ── Mouth (sits in the gap below the mustache) ── */}
        {speaking ? (
          <g>
            <ellipse cx="60" cy="81" rx={mouth.rx} ry={mouth.ry} fill="#5e1c0c"/>
            <ellipse cx="60" cy={81 + mouth.ry * 0.35} rx={mouth.rx * 0.7} ry={mouth.ry * 0.5} fill="#8b3a1a"/>
            {mouth.ry > 2.4 && <ellipse cx="60" cy={81 - mouth.ry * 0.45} rx={mouth.rx * 0.8} ry="1.1" fill="#fff" opacity="0.85"/>}
          </g>
        ) : greeting ? (
          /* warm open smile with teeth */
          <g>
            <path d="M52 79 Q60 88 68 79 Q60 83 52 79Z" fill="#6e2410"/>
            <path d="M53.5 79.4 Q60 82 66.5 79.4 Q60 81 53.5 79.4Z" fill="#fff" opacity="0.9"/>
          </g>
        ) : (
          /* gentle resting smile */
          <path d="M53.5 79 Q60 83.5 66.5 79" stroke="#7a2a12" strokeWidth="2" fill="none" strokeLinecap="round"/>
        )}

        {/* ── Black AMMAMA (Shia cleric turban) ── */}
        {/* A low, wide drum of wrapped coils with a flat-ish top — not a dome. */}
        {/* thin white under-cap edge peeking at the brow */}
        <path d="M40 49 Q60 44.5 80 49 Q60 47 40 49Z" fill="#e2dac6" opacity="0.55"/>
        {/* wrapped coils, bottom -> top (each narrower; gradient gives each a rounded wrap) */}
        <ellipse cx="60" cy="46.5" rx="30.5" ry="7.5" fill={`url(#turban-${uid})`}/>
        <ellipse cx="60" cy="42" rx="30.5" ry="8" fill={`url(#turban-${uid})`}/>
        <ellipse cx="60" cy="37.5" rx="29" ry="8" fill={`url(#turban-${uid})`}/>
        <ellipse cx="60" cy="33.5" rx="26.5" ry="8" fill={`url(#turban-${uid})`}/>
        <ellipse cx="60" cy="30" rx="23" ry="7.5" fill={`url(#turban-${uid})`}/>
        {/* flat top of the drum */}
        <ellipse cx="60" cy="27.5" rx="18.5" ry="6" fill={`url(#turban-${uid})`}/>
        <ellipse cx="60" cy="26.5" rx="18.5" ry="5.5" fill="#16161a"/>
        {/* coil seam highlights along each wrap's upper edge */}
        <path d="M30 45 Q60 39.5 90 45" stroke="#42424a" strokeWidth="0.8" fill="none" opacity="0.65"/>
        <path d="M30 40.5 Q60 35 90 40.5" stroke="#42424a" strokeWidth="0.8" fill="none" opacity="0.6"/>
        <path d="M31.5 36 Q60 30.5 88.5 36" stroke="#3c3c44" strokeWidth="0.8" fill="none" opacity="0.55"/>
        <path d="M34 32 Q60 26.5 86 32" stroke="#3c3c44" strokeWidth="0.7" fill="none" opacity="0.5"/>
        {/* soft top sheen */}
        <ellipse cx="55" cy="26" rx="8" ry="2.2" fill="#fff" opacity="0.06"/>
        {/* small loose tail of the ammama tucked at the left side */}
        <path d="M32 45 Q27 56 30 66 Q32 71 35 69 Q32 58 36 49Z" fill="#16161a"/>
        <path d="M32 47 Q29 57 31 65" stroke="#34343c" strokeWidth="0.7" fill="none" opacity="0.5"/>
      </g>

      {/* Speaking ripple effects */}
      {speaking && (
        <>
          <circle cx="60" cy="60" r="60" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1.5" opacity="0.18" style={{animation:"speakRing 0.9s ease-out infinite", transformOrigin:"60px 60px"}}/>
          <circle cx="60" cy="60" r="62" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1" opacity="0.1" style={{animation:"speakRing 0.9s ease-out 0.35s infinite", transformOrigin:"60px 60px"}}/>
        </>
      )}
      {/* Thinking shimmer */}
      {thinking && (
        <circle cx="60" cy="60" r="59" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1.2" opacity="0.25" strokeDasharray="4 8" style={{animation:"spinRing 6s linear infinite", transformOrigin:"60px 60px"}}/>
      )}
    </svg>
  );
}

function Scholar({ size = 80, state = "idle", floating = false }) {
  return <ScholarAvatar size={size} state={state} floating={floating} />;
}

const starPositions = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  top: Math.random() * 100,
  size: Math.random() * 3 + 1,
  delay: Math.random() * 4,
}));

// ── Bunting: Ahlul Bayt pennants strung on a rope ─────────────────────────────
// Black mosque-arch pennants with a gold filigree double border and a gold
// tassel at the tip, cycling through "Ya <name>, peace be upon him/her" —
// styled after traditional Muharram processional flags.
const PENNANTS = [
  { name: "أبا عبدالله", suffix: "عليه السلام" },
  { name: "حسين", suffix: "عليه السلام" },
  { name: "زينب", suffix: "عليها السلام" },
  { name: "عباس", suffix: "عليه السلام" },
  { name: "علي", suffix: "عليه السلام" },
  { name: "سجاد", suffix: "عليه السلام" },
  { name: "فاطمة", suffix: "عليها السلام" },
  { name: "قاسم", suffix: "عليه السلام" },
];
function HussainBunting() {
  const pennants = Array.from({ length: 24 });
  return (
    <div style={s.buntingWrap}>
      <div style={s.rope} />
      <div style={s.pennantRow}>
        {pennants.map((_, i) => {
          const p = PENNANTS[i % PENNANTS.length];
          const uid = `pn${i}`;
          // Longer names need a smaller font to still fit the flag's width.
          const nameSize = p.name.length > 8 ? 11 : p.name.length > 4 ? 14 : 17;
          return (
            <div key={i} style={{ ...s.pennant, animationDelay: `${(i % 7) * 0.25}s` }}>
              <svg width="64" height="113" viewBox="0 0 84 148" style={{ display: "block", overflow: "visible" }}>
                <defs>
                  <linearGradient id={`pgold-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fff1b0" />
                    <stop offset="50%" stopColor="#ffd24d" />
                    <stop offset="100%" stopColor="#a8790a" />
                  </linearGradient>
                </defs>
                {/* loop hanging over the rope */}
                <circle cx="42" cy="7" r="4" fill="none" stroke={`url(#pgold-${uid})`} strokeWidth="2" />
                {/* outer flag body: flat top tapering to a point, like a mosque arch */}
                <path
                  d="M12 14 L72 14 C72 52 65 88 42 124 C19 88 12 52 12 14 Z"
                  fill="#100e10"
                  stroke={`url(#pgold-${uid})`}
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                />
                {/* inner ornamental border line */}
                <path
                  d="M18 20 L66 20 C66 52 60 82 42 112 C24 82 18 52 18 20 Z"
                  fill="none"
                  stroke={`url(#pgold-${uid})`}
                  strokeWidth="1"
                  opacity="0.85"
                />
                {/* small medallion flourish under the top edge */}
                <g transform="translate(42 26)">
                  <rect x="-4" y="-4" width="8" height="8" rx="1.5" fill="#c81e1e" stroke={`url(#pgold-${uid})`}
                    strokeWidth="1" transform="rotate(45)" />
                  <circle cx="-11" cy="0" r="1.4" fill={`url(#pgold-${uid})`} />
                  <circle cx="11" cy="0" r="1.4" fill={`url(#pgold-${uid})`} />
                </g>
                {/* "Ya <name>, peace be upon him/her" */}
                <text x="42" y="42" textAnchor="middle" fontFamily="'Amiri', serif" fontSize="13" fontWeight="700"
                  fill="#fdf3df">يا</text>
                <text x="42" y="65" textAnchor="middle" fontFamily="'Amiri', serif" fontSize={nameSize} fontWeight="700"
                  fill="#e2291f">{p.name}</text>
                <text x="42" y="82" textAnchor="middle" fontFamily="'Amiri', serif" fontSize="9"
                  fill="#fdf3df">{p.suffix}</text>
                {/* gold tassel at the tip */}
                <circle cx="42" cy="124" r="2.6" fill={`url(#pgold-${uid})`} />
                {[-4, -2, 0, 2, 4].map((dx) => (
                  <line key={dx} x1="42" y1="127" x2={42 + dx} y2="144" stroke={`url(#pgold-${uid})`}
                    strokeWidth="1.4" strokeLinecap="round" />
                ))}
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SUGGESTED_QUESTIONS = [
  "Who was Imam Hussain (AS)?",
  "What happened in Karbala?",
  "Why do we remember Muharram?",
  "Who were the 72 companions?",
  "What is Ashura?",
  "Who was Hazrat Abbas (AS)?",
  "Who was Hur ibn Yazid?",
  "What is Azadari?",
  "Why is Muharram important?",
  "Who was Bibi Zainab (SA)?",
];

const systemPrompt = `You are "Teacher Noor" — a warm, gentle, and knowledgeable Islamic educator helping children (ages 6–14) learn about the events of Karbala, Imam Hussain (AS), Muharram, and Azadari. You are displayed on a projector in a classroom, speaking to a group of students.

Your answer is read aloud by a text-to-speech voice, so it MUST be plain spoken English:
- Do NOT use any emojis, emoticons, or pictographic symbols.
- Do NOT use any markdown or formatting characters: no asterisks (*), underscores (_), backticks, hashes (#), bullet points, numbered lists, or headings.
- Write in ordinary sentences with normal punctuation, exactly as a teacher would speak out loud.

Your rules:
- Always answer in simple, age-appropriate English
- Be respectful and reverent about all Islamic figures — use (AS) for Imams and (SA) for ladies like Bibi Zainab
- Keep answers short and easy to understand (3–5 sentences max)
- Use simple analogies and comparisons kids can relate to
- Gently encourage curiosity and follow-up questions
- Only answer questions related to: Muharram, Karbala, Imam Hussain (AS), Azadari, the companions of Karbala, Islamic months, Yazid, the events of Ashura, and closely related Islamic history
- If a question is off-topic, kindly say: "That's a great question! But I'm here specially to help you learn about Karbala and Muharram. Can you ask me something about Imam Hussain (AS)?"
- Never discuss anything inappropriate or unrelated to this topic
- End each answer with a warm, encouraging sentence (in plain words, with no emoji)

You are part of KAZ School & Welfare, an Islamic educational organization based in Australia.`;

// The opening message Teacher Noor shows and speaks aloud on startup.
const GREETING =
  "As-salamu alaykum, dear students! 🌹 I am Teacher Noor, your Karbala Guide. Ask me anything about Imam Hussain (AS), the events of Karbala, Muharram, or Azadari. I am here to help you learn! 💫";

export default function KarbalaChatbot() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const bottomRef = useRef(null);
  // Two pooled <audio> elements for gapless playback: while one speaks a
  // sentence, the next sentence preloads into the other.
  const audioPoolRef = useRef([]);
  const mutedRef = useRef(false);
  // Mutable state for the in-progress spoken answer (refs, not React state, so
  // producing/consuming sentences doesn't trigger re-renders).
  const speechRef = useRef({
    seq: 0,            // bumped per answer; invalidates stale producers/consumers
    queue: [],         // cleaned sentences ready to speak, in order
    notify: null,      // resolve fn that wakes the consumer when a sentence lands
    streamDone: true,  // true once the producer (Claude stream) has finished
    sentenceBuf: "",   // streamed text not yet a complete sentence
    pendingChunk: "",  // complete sentences being batched before flushing
    spokeFirst: false, // has the first chunk been flushed yet (fast start)
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Two reusable <audio> elements (a playback pool). Created once and reused so
  // the page's audio stays "unlocked" after the first user gesture.
  useEffect(() => {
    const make = () => {
      const a = new Audio();
      a.preload = "auto";
      a.onplay = () => setSpeaking(true);
      return a;
    };
    const pool = [make(), make()];
    audioPoolRef.current = pool;
    return () => pool.forEach((a) => { a.pause(); a.removeAttribute("src"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ttsUrl = (s) => `/api/tts?text=${encodeURIComponent(s)}`;

  // Cancel the current spoken answer: invalidate the producer/consumer (bump
  // seq), clear the queue, and stop both pooled elements.
  function stopAudio() {
    const sp = speechRef.current;
    sp.seq++;
    sp.queue = [];
    sp.streamDone = true;
    sp.sentenceBuf = "";
    sp.pendingChunk = "";
    sp.spokeFirst = false;
    if (sp.notify) { sp.notify(); sp.notify = null; }
    audioPoolRef.current.forEach((a) => { a.pause(); a.removeAttribute("src"); a.load(); });
    setSpeaking(false);
  }

  // Start a fresh spoken answer and kick off the consumer loop (which waits for
  // sentences to be enqueued). Returns the seq token identifying this answer.
  function beginSpeechTurn() {
    stopAudio();                 // bump seq, clear any prior answer
    const sp = speechRef.current;
    sp.streamDone = false;
    const seq = sp.seq;
    consumeSpeech(seq);          // async; plays sentences as they arrive
    return seq;
  }

  // Queue one sentence for speaking and wake the consumer.
  function enqueueSpeech(sentence, seq) {
    const sp = speechRef.current;
    if (seq !== sp.seq) return;
    const clean = cleanForSpeech(sentence);
    if (!clean) return;
    sp.queue.push(clean);
    if (sp.notify) { sp.notify(); sp.notify = null; }
  }

  // Feed streamed text in. Whole sentences are extracted and batched; the first
  // chunk flushes immediately (fast first audio), later chunks once they reach a
  // comfortable length so playback stays smooth.
  function feedSpeech(textChunk, seq) {
    const sp = speechRef.current;
    if (seq !== sp.seq) return;
    sp.sentenceBuf += textChunk;
    const { sentences, rest } = splitSentences(sp.sentenceBuf);
    sp.sentenceBuf = rest;
    for (const sentence of sentences) {
      sp.pendingChunk = sp.pendingChunk ? `${sp.pendingChunk} ${sentence}` : sentence;
      if (!sp.spokeFirst || sp.pendingChunk.length >= 80) {
        enqueueSpeech(sp.pendingChunk, seq);
        sp.pendingChunk = "";
        sp.spokeFirst = true;
      }
    }
  }

  // No more text is coming: flush whatever's left and let the consumer drain.
  function endSpeech(seq) {
    const sp = speechRef.current;
    if (seq !== sp.seq) return;
    const tail = `${sp.pendingChunk} ${sp.sentenceBuf}`.trim();
    sp.pendingChunk = "";
    sp.sentenceBuf = "";
    if (tail) enqueueSpeech(tail, seq);
    sp.streamDone = true;
    if (sp.notify) { sp.notify(); sp.notify = null; }
  }

  // Resolve once the next sentence is available, or the turn ends/supersedes.
  function waitForSentence(seq) {
    return new Promise((resolve) => {
      const sp = speechRef.current;
      if (seq !== sp.seq || sp.queue.length || sp.streamDone) { resolve(); return; }
      sp.notify = resolve;
    });
  }

  // Pull the next sentence, waiting for the producer if needed. null = no more.
  async function takeSentence(seq) {
    const sp = speechRef.current;
    while (sp.queue.length === 0) {
      if (sp.streamDone || seq !== sp.seq) return null;
      await waitForSentence(seq);
      if (seq !== sp.seq) return null;
    }
    return sp.queue.shift();
  }

  // Play one clip on a pooled element; resolves when it ends, errors, or is
  // interrupted by stopAudio() (which pauses it).
  function playClip(el, seq) {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        el.onended = null; el.onerror = null; el.onpause = null;
        resolve();
      };
      el.onended = done;
      el.onerror = done;
      el.onpause = done; // fires when stopAudio() interrupts a playing clip
      if (seq !== speechRef.current.seq) { done(); return; }
      const p = el.play();
      if (p?.catch) p.catch(done);
    });
  }

  // Consumer loop: plays queued sentences back-to-back, preloading the next
  // sentence into the other pooled element so transitions are near-gapless.
  async function consumeSpeech(seq) {
    const sp = speechRef.current;
    const pool = audioPoolRef.current;
    if (pool.length < 2) return;
    let idx = 0;

    let current = await takeSentence(seq);
    if (current == null) { if (seq === sp.seq) setSpeaking(false); return; }
    pool[idx].src = ttsUrl(current);

    while (current != null && seq === sp.seq) {
      const playing = playClip(pool[idx], seq);
      const next = await takeSentence(seq);                 // wait for the next sentence
      if (next != null && seq === sp.seq) pool[1 - idx].src = ttsUrl(next); // preload it
      await playing;                                        // until current finishes
      current = next;
      idx = 1 - idx;
    }
    if (seq === sp.seq) setSpeaking(false);
  }

  // Speak a complete, already-known string (greeting, error messages) through
  // the same queue/pool as streamed answers.
  function speak(text) {
    if (mutedRef.current) return;
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const seq = beginSpeechTurn();
    const { sentences, rest } = splitSentences(clean + " ");
    for (const sentence of sentences) enqueueSpeech(sentence, seq);
    const tail = rest.trim();
    if (tail) enqueueSpeech(tail, seq);
    endSpeech(seq);
  }

  // Browsers block audio until a deliberate user gesture, so we show a "Tap to
  // begin" overlay. That one tap both speaks the greeting and unlocks audio for
  // the rest of the session (so later replies play without further interaction).
  function beginSession() {
    if (started) return;
    setStarted(true);
    // Unlock BOTH pooled elements within this user gesture by playing a tiny
    // silent clip, so later (non-gesture) sentence transitions can autoplay.
    audioPoolRef.current.forEach((a) => {
      try {
        a.src = SILENT_WAV;
        const p = a.play();
        if (p?.then) p.then(() => { a.pause(); a.removeAttribute("src"); }).catch(() => {});
      } catch { /* ignore */ }
    });
    speak(GREETING);
  }

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (next) stopAudio();
      return next;
    });
  }

  async function sendMessage(text) {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput("");
    // Interrupt any answer currently being spoken.
    stopAudio();

    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    // The assistant reply is added lazily on the first token and updated in
    // place as more arrive (so no empty bubble flashes before text appears).
    const assistantIndex = newMessages.length;
    let added = false;
    const setAssistant = (content) => {
      if (!added) {
        added = true;
        setMessages([...newMessages, { role: "assistant", content }]);
      } else {
        setMessages((cur) => {
          const copy = cur.slice();
          if (copy[assistantIndex]) copy[assistantIndex] = { role: "assistant", content };
          return copy;
        });
      }
    };

    // Speak the answer sentence-by-sentence as it streams (skip when muted).
    const wantSpeech = !mutedRef.current;
    const seq = wantSpeech ? beginSpeechTurn() : null;

    let acc = "";
    try {
      // Calls our own dev-server proxy (see vite.config.js) / serverless function
      // (api/chat.js), which injects the Anthropic API key server-side and
      // streams Claude's response back as Server-Sent Events.
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok || !response.body) {
        let msg = "I'm sorry, I couldn't answer that. Please try again! 🌹";
        try { const d = await response.json(); msg = d.error?.message || msg; } catch { /* not JSON */ }
        acc = msg;
        setAssistant(acc);
        if (wantSpeech) { feedSpeech(acc, seq); endSpeech(seq); }
        return;
      }

      // Read the SSE stream: accumulate text_delta tokens, update the bubble
      // live, and hand each token to the speech pipeline.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: rdDone } = await reader.read();
        if (rdDone) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const evt = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const token = parseSseTextDelta(evt);
          if (token) {
            acc += token;
            setAssistant(acc);
            if (wantSpeech) feedSpeech(token, seq);
          }
          if (evt.includes('"type":"message_stop"')) done = true;
        }
      }

      if (!acc.trim()) {
        acc = "I'm sorry, I couldn't answer that. Please try again! 🌹";
        setAssistant(acc);
        if (wantSpeech) feedSpeech(acc, seq);
      }
      if (wantSpeech) endSpeech(seq);
    } catch {
      const errReply = "Oops! Something went wrong. Please try again! 🌹";
      setAssistant(errReply);
      speak(errReply); // begins a fresh turn (invalidates any partial speech)
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.wrapper}>
      {/* Start overlay — one tap plays the greeting and unlocks audio. */}
      {!started && (
        <div style={s.startOverlay} onClick={beginSession}>
          <div style={s.startCard}>
            <Scholar size={140} state="greeting" floating />
            <div style={s.startName}>Teacher Noor</div>
            <div style={s.startSub}>Your Karbala Guide 🌹</div>
            <button style={s.startBtn} onClick={beginSession}>▶ Tap to begin</button>
            <div style={s.startHint}>Tap anywhere to start and hear Teacher Noor</div>
          </div>
        </div>
      )}

      {/* Stars */}
      {starPositions.map((st) => (
        <div key={st.id} style={{ ...s.star, left:`${st.left}%`, top:`${st.top}%`, width:st.size, height:st.size, animationDelay:`${st.delay}s` }}/>
      ))}

      {/* "Hussain" pennant bunting strung across the top */}
      <HussainBunting />

      {/* Main layout: Scholar LEFT, Chat RIGHT (stacks vertically on mobile) */}
      <div style={s.mainLayout} className="kaz-main-layout">

        {/* ── LEFT: Scholar Panel ── */}
        <div style={s.scholarSide} className="kaz-scholar-side">
          <div style={s.scholarCircle}>
            <Scholar
              size={180}
              state={speaking ? "speaking" : loading ? "thinking" : "idle"}
              floating={!speaking && !loading}
            />
            {(speaking || loading) && (
              <div style={s.speechWave}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{ ...s.waveBar, animationDelay:`${i*0.12}s`, height: `${20 + Math.sin(i)*12}px` }}/>
                ))}
              </div>
            )}
          </div>
          <div style={s.scholarName}>Teacher Noor</div>
          <div style={s.scholarTitle}>Your Karbala Guide 🌹</div>
          <div style={s.statusBadge}>
            <span style={{ ...s.statusDot, background: speaking ? "#22c55e" : loading ? "#f59e0b" : "#6b7280" }}/>
            {speaking ? "Speaking..." : loading ? "Thinking..." : "Ready"}
          </div>
          <button
            style={s.muteBtn}
            onClick={toggleMute}
            title={muted ? "Voice off — tap to turn on" : "Voice on — tap to mute"}
            aria-label={muted ? "Unmute voice" : "Mute voice"}
          >
            {muted ? "🔇 Voice off" : "🔊 Voice on"}
          </button>
          {logoOk ? (
            <img
              src={KAZ_LOGO_SRC}
              alt="Khanum Amber Zehra (KAZ)"
              style={s.kazLogo}
              onError={() => setLogoOk(false)}
            />
          ) : (
            <div style={s.kazLogoFallback}>KAZ</div>
          )}
        </div>

        {/* ── RIGHT: Chat Panel ── */}
        <div style={s.chatSide} className="kaz-chat-side">
          {/* Header */}
          <div style={s.header}>
            <div style={s.headerTitle}>🕌 Ask Teacher Noor</div>
            <div style={s.headerSub}>About Imam Hussain (AS), Karbala & Muharram</div>
          </div>

          {/* Messages */}
          <div style={s.messages}>
            {messages.map((msg, i) => (
              <div key={i} style={{ ...s.msgRow, justifyContent: msg.role==="user" ? "flex-end" : "flex-start" }}>
                {msg.role === "assistant" && <Scholar size={40}/>}
                <div style={msg.role==="user" ? s.userBubble : s.botBubble}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && messages[messages.length - 1]?.role !== "assistant" && (
              <div style={{ ...s.msgRow, justifyContent:"flex-start" }}>
                <Scholar size={40} state="thinking"/>
                <div style={s.botBubble}>
                  <span style={s.dot}/><span style={{...s.dot,animationDelay:"0.2s"}}/><span style={{...s.dot,animationDelay:"0.4s"}}/>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Quick Questions */}
          <div style={s.qWrap}>
            <div style={s.qLabel}>✨ Quick Questions — Tap to Ask</div>
            <div style={s.qGrid}>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button key={i} style={s.qChip} onClick={() => sendMessage(q)} disabled={loading}
                  onMouseEnter={e=>e.currentTarget.style.background="#b71c1c"}
                  onMouseLeave={e=>e.currentTarget.style.background="#8b0000"}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div style={s.inputRow}>
            <input style={s.input} value={input} placeholder="Type your question here..."
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter" && sendMessage()}
              disabled={loading}/>
            <button style={{...s.sendBtn, opacity: loading ? 0.5 : 1}} onClick={()=>sendMessage()} disabled={loading}>➤</button>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; }

        @keyframes twinkle {
          0%,100% { opacity:0.2; transform:scale(1); }
          50% { opacity:0.9; transform:scale(1.5); }
        }
        @keyframes pennantSway {
          0%,100% { transform:rotate(-3.5deg); }
          50% { transform:rotate(3.5deg); }
        }
        @keyframes dotBounce {
          0%,80%,100% { transform:translateY(0); opacity:0.4; }
          40% { transform:translateY(-6px); opacity:1; }
        }
        @keyframes floatScholar {
          0%,100% { transform:translateY(0); }
          50% { transform:translateY(-8px); }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(8px); }
          to { opacity:1; transform:translateY(0); }
        }
        @keyframes speakRing {
          0% { transform:scale(1); opacity:0.2; }
          100% { transform:scale(1.15); opacity:0; }
        }
        @keyframes blinkLids {
          0%,93%,100% { transform:scaleY(0); }
          96% { transform:scaleY(1); }
        }
        @keyframes headBob {
          0%,100% { transform:translateY(0) rotate(0deg); }
          25% { transform:translateY(-1.5px) rotate(-1deg); }
          50% { transform:translateY(0.5px) rotate(0.5deg); }
          75% { transform:translateY(-1px) rotate(1deg); }
        }
        @keyframes headTilt {
          0%,100% { transform:rotate(0deg) translateY(0); }
          50% { transform:rotate(-2.5deg) translateY(-1px); }
        }
        @keyframes spinRing {
          from { transform:rotate(0deg); }
          to { transform:rotate(360deg); }
        }
        @keyframes waveAnim {
          0%,100% { transform:scaleY(0.4); }
          50% { transform:scaleY(1); }
        }
        @keyframes pulseDot {
          0%,100% { transform:scale(1); opacity:1; }
          50% { transform:scale(1.4); opacity:0.7; }
        }
        input::placeholder { color: rgba(255,200,150,0.4); }
        input:focus { border-color: rgba(255,150,100,0.8) !important; }
        button:hover { cursor: pointer; }

        /* Mobile: stack the scholar panel above the chat panel instead of
           squeezing them side by side (which was crushing the chat column
           down to a sliver a few pixels wide). */
        @media (max-width: 820px) {
          .kaz-main-layout {
            flex-direction: column !important;
            align-items: center !important;
            padding: 0 14px !important;
          }
          .kaz-scholar-side {
            width: 100% !important;
            max-width: 340px !important;
          }
          .kaz-chat-side {
            width: 100% !important;
            min-height: 420px !important;
          }
        }
      `}</style>
    </div>
  );
}

const s = {
  wrapper: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse at 20% 10%, #1a0000 0%, #080000 50%, #000 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: "'Nunito', sans-serif",
    position: "relative",
    overflow: "hidden",
    padding: "0 0 20px 0",
  },
  // ── Start overlay ──
  startOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background: "radial-gradient(ellipse at 50% 40%, rgba(26,0,0,0.96), rgba(0,0,0,0.98))",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    animation: "fadeUp 0.4s ease",
  },
  startCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    textAlign: "center",
    padding: 24,
  },
  startName: {
    fontFamily: "'Amiri', serif",
    fontSize: 34,
    fontWeight: 700,
    color: "#ffd700",
    letterSpacing: 1,
    textShadow: "0 0 14px rgba(255,215,0,0.4)",
    marginTop: 10,
  },
  startSub: {
    fontSize: 15,
    color: "rgba(255,200,150,0.75)",
  },
  startBtn: {
    marginTop: 14,
    background: "linear-gradient(135deg, #8b0000, #c0392b)",
    color: "#ffd700",
    border: "1px solid rgba(255,215,0,0.4)",
    borderRadius: 40,
    padding: "14px 32px",
    fontSize: 18,
    fontWeight: 800,
    fontFamily: "'Nunito', sans-serif",
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(139,0,0,0.6)",
  },
  startHint: {
    marginTop: 10,
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
  },
  star: {
    position: "absolute",
    borderRadius: "50%",
    background: "#fff8e1",
    animation: "twinkle 4s ease-in-out infinite",
    zIndex: 0,
    pointerEvents: "none",
  },
  buntingWrap: {
    position: "relative",
    width: "100%",
    overflow: "hidden",
    display: "flex",
    justifyContent: "center",
    paddingTop: 4,
    marginBottom: 10,
    zIndex: 2,
  },
  // Gold rope the pennants hang from (runs edge to edge).
  rope: {
    position: "absolute",
    top: 9, left: "-2%", width: "104%", height: 4,
    background: "linear-gradient(180deg,#8a6a34 0%,#e0b64a 45%,#6d4f26 100%)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
    zIndex: 1,
  },
  pennantRow: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 5,
    flexWrap: "nowrap",
  },
  pennant: {
    flex: "0 0 auto",
    transformOrigin: "top center",
    animation: "pennantSway 3.6s ease-in-out infinite",
    filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.5))",
  },
  mainLayout: {
    display: "flex",
    gap: 24,
    width: "100%",
    maxWidth: 1100,
    zIndex: 2,
    padding: "0 20px",
    alignItems: "flex-start",
  },
  // ── Scholar Side ──
  scholarSide: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: 240,
    flexShrink: 0,
    gap: 8,
  },
  scholarCircle: {
    width: 200, height: 200,
    borderRadius: "50%",
    background: "radial-gradient(circle, #2a0000 0%, #0a0000 100%)",
    border: "2px solid rgba(255,215,0,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 40px rgba(139,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.5)",
    position: "relative",
  },
  speechWave: {
    position: "absolute",
    bottom: -24,
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  waveBar: {
    width: 5,
    borderRadius: 3,
    background: "linear-gradient(to top, #ffd700, #ff6b00)",
    animation: "waveAnim 0.5s ease-in-out infinite",
    transformOrigin: "bottom",
  },
  scholarName: {
    fontFamily: "'Amiri', serif",
    fontSize: 26,
    fontWeight: 700,
    color: "#ffd700",
    letterSpacing: 1,
    textShadow: "0 0 10px rgba(255,215,0,0.4)",
    marginTop: 16,
  },
  scholarTitle: {
    fontSize: 13,
    color: "rgba(255,200,150,0.7)",
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 20,
    padding: "5px 14px",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  statusDot: {
    width: 8, height: 8,
    borderRadius: "50%",
    animation: "pulseDot 1.5s ease-in-out infinite",
  },
  muteBtn: {
    marginTop: 6,
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,215,0,0.3)",
    borderRadius: 20,
    padding: "5px 14px",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'Nunito', sans-serif",
    color: "#ffd0a0",
    cursor: "pointer",
  },
  kazLogo: {
    width: 132,
    height: 132,
    objectFit: "contain",
    marginTop: 14,
    filter: "drop-shadow(0 0 12px rgba(255,170,70,0.3))",
  },
  kazLogoFallback: {
    width: 80, height: 80,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Amiri', serif",
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: 1,
    color: "#ffd700",
    background: "radial-gradient(circle, #2a0000 0%, #0a0000 100%)",
    border: "2px solid rgba(255,215,0,0.4)",
    marginTop: 12,
    boxShadow: "0 0 16px rgba(255,150,50,0.3)",
  },
  // ── Chat Side ──
  chatSide: {
    flex: 1,
    background: "rgba(15,0,0,0.85)",
    border: "1.5px solid rgba(139,0,0,0.6)",
    borderRadius: 24,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backdropFilter: "blur(16px)",
    boxShadow: "0 0 40px rgba(139,0,0,0.3)",
    minHeight: 580,
  },
  header: {
    background: "linear-gradient(135deg, #5a0000, #8b0000 60%, #3a0000)",
    padding: "14px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  headerTitle: {
    fontFamily: "'Amiri', serif",
    fontSize: 22,
    fontWeight: 700,
    color: "#ffd700",
  },
  headerSub: {
    fontSize: 12,
    color: "rgba(255,200,150,0.65)",
    marginTop: 2,
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 260,
    maxHeight: 320,
  },
  msgRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    animation: "fadeUp 0.3s ease",
  },
  botBubble: {
    background: "linear-gradient(135deg, rgba(60,0,0,0.95), rgba(30,0,0,0.98))",
    border: "1px solid rgba(139,0,0,0.5)",
    color: "#ffecd2",
    padding: "10px 14px",
    borderRadius: "18px 18px 18px 4px",
    fontSize: 14,
    lineHeight: 1.65,
    maxWidth: "80%",
    display: "flex",
    gap: 5,
    alignItems: "center",
    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
  },
  userBubble: {
    background: "linear-gradient(135deg, #7a0000, #a01010)",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: "18px 18px 4px 18px",
    fontSize: 14,
    lineHeight: 1.65,
    maxWidth: "80%",
    boxShadow: "0 2px 12px rgba(139,0,0,0.4)",
  },
  dot: {
    display: "inline-block",
    width: 7, height: 7,
    borderRadius: "50%",
    background: "#ffd700",
    animation: "dotBounce 1.2s ease-in-out infinite",
  },
  qWrap: {
    padding: "10px 16px 6px",
    borderTop: "1px solid rgba(255,255,255,0.05)",
  },
  qLabel: {
    fontSize: 10,
    color: "rgba(255,215,0,0.45)",
    fontWeight: 700,
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  qGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    maxHeight: 96,
    overflowY: "auto",
  },
  qChip: {
    background: "#8b0000",
    color: "#ffd0a0",
    border: "1px solid rgba(255,120,80,0.3)",
    borderRadius: 20,
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'Nunito', sans-serif",
    fontWeight: 600,
    transition: "background 0.2s",
    whiteSpace: "nowrap",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: "12px 16px 16px",
    borderTop: "1px solid rgba(255,255,255,0.05)",
  },
  input: {
    flex: 1,
    background: "rgba(40,0,0,0.7)",
    border: "1.5px solid rgba(139,0,0,0.5)",
    borderRadius: 50,
    padding: "11px 20px",
    color: "#fff",
    fontSize: 14,
    fontFamily: "'Nunito', sans-serif",
    outline: "none",
    transition: "border-color 0.2s",
  },
  sendBtn: {
    background: "linear-gradient(135deg, #8b0000, #c0392b)",
    color: "#ffd700",
    border: "none",
    borderRadius: "50%",
    width: 46, height: 46,
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 10px rgba(139,0,0,0.5)",
    transition: "opacity 0.2s",
  },
};
