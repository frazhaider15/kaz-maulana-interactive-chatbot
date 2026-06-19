import { useState, useRef, useEffect } from "react";

// To show the KAZ logo, paste a base64 data URI (e.g. "data:image/png;base64,...")
// here. While it stays as the placeholder, a styled "KAZ" badge is shown instead.
const KAZ_LOGO_B64 = "LOGO_PLACEHOLDER";
const hasLogo = KAZ_LOGO_B64 && KAZ_LOGO_B64 !== "LOGO_PLACEHOLDER";

// ── Voice (text-to-speech) ────────────────────────────────────────────────────
// Ustadh Noor speaks his answers aloud via the browser's Web Speech API. We
// prefer a male English voice so he sounds like a male scholar; if none is
// available the browser default is used.
//
// To sound like an elderly man, we slow the delivery and lower the pitch — a
// slower, deeper, measured voice reads as an older, wiser scholar. Tune here.
const SPEECH_RATE = 0.82;  // < 1 = slower, more deliberate (elderly cadence)
const SPEECH_PITCH = 0.75; // < 1 = deeper, lower (older male timbre)
const SPEECH_LANG = "en-US"; // force English if the chosen voice has no lang
const MALE_VOICE_PREFERENCES = [
  // Classic local Windows male (always play offline)
  "Microsoft David", "Microsoft Mark", "Microsoft George", "Microsoft Ravi",
  // macOS local male
  "Daniel", "Alex", "Arthur", "Rishi", "Fred",
  // Chrome
  "Google UK English Male",
  // Edge "Online (Natural)" male voices — last resort (cloud-dependent)
  "Guy", "Christopher", "Eric", "Roger", "Steffan", "Brian", "Andrew",
  "Ryan", "Thomas", "Brandon",
];

// Substrings that indicate a female voice — used to avoid picking one as a fallback.
const FEMALE_VOICE_HINTS = [
  "female",
  "aria", "jenny", "michelle", "microsoft ana", "sonia", "libby", "emma", "nancy", "ava",
  "zira", "hazel", "susan", "samantha", "victoria", "karen",
  "moira", "tessa", "fiona", "veena", "catherine", "linda", "heera",
  "google us english",
];

// Pick the best available male English voice, or null to fall back to the browser default.
// Local voices are strongly preferred: Edge's cloud "Online (Natural)" voices are listed
// by getVoices() but often don't actually play and fall back to the default female voice.
function pickMaleVoice(voices) {
  if (!voices || !voices.length) return null;
  const isEnglish = v => v.lang && v.lang.toLowerCase().startsWith("en");
  const isFemale = v => FEMALE_VOICE_HINTS.some(h => v.name.toLowerCase().includes(h));
  const matchesPref = v => MALE_VOICE_PREFERENCES.some(p => v.name.includes(p));

  const localKnownMale = voices.find(v => v.localService && isEnglish(v) && matchesPref(v));
  if (localKnownMale) return localKnownMale;
  const localEnglishMale = voices.find(v => v.localService && isEnglish(v) && !isFemale(v));
  if (localEnglishMale) return localEnglishMale;
  for (const pref of MALE_VOICE_PREFERENCES) {
    const hit = voices.find(v => v.name.includes(pref));
    if (hit) return hit;
  }
  const labelledMale = voices.find(v => /male/i.test(v.name) && !isFemale(v));
  if (labelledMale) return labelledMale;
  const englishNonFemale = voices.find(v => isEnglish(v) && !isFemale(v));
  if (englishNonFemale) return englishNonFemale;
  return null;
}

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

// ── Animated Scholar Avatar with black turban, speaking mouth ─────────────────
function ScholarAvatar({ size = 80, speaking = false, floating = false }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 120 120"
      style={{
        flexShrink: 0,
        filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.6))",
        animation: floating ? "floatScholar 3s ease-in-out infinite" : "none",
        overflow: "visible",
      }}
    >
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="40%">
          <stop offset="0%" stopColor="#2a0a0a" />
          <stop offset="100%" stopColor="#0a0000" />
        </radialGradient>
        <radialGradient id="faceGrad" cx="45%" cy="35%">
          <stop offset="0%" stopColor="#f0c090" />
          <stop offset="100%" stopColor="#c8844a" />
        </radialGradient>
        <radialGradient id="robeGrad" cx="50%" cy="0%">
          <stop offset="0%" stopColor="#1a1a2e" />
          <stop offset="100%" stopColor="#0a0a18" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Outer glow ring */}
      <circle cx="60" cy="60" r="58" fill="none" stroke="#ffd700" strokeWidth="1" opacity="0.3"/>

      {/* Background */}
      <circle cx="60" cy="60" r="57" fill="url(#bgGrad)"/>

      {/* Robe / shoulders */}
      <ellipse cx="60" cy="112" rx="42" ry="28" fill="url(#robeGrad)"/>
      <ellipse cx="60" cy="104" rx="32" ry="22" fill="#111128"/>
      {/* Robe collar */}
      <path d="M45 85 Q60 92 75 85 L78 105 Q60 110 42 105Z" fill="#0d0d20"/>

      {/* Neck */}
      <rect x="53" y="76" width="14" height="12" rx="5" fill="#c8844a"/>

      {/* Face base */}
      <ellipse cx="60" cy="66" rx="22" ry="24" fill="url(#faceGrad)"/>

      {/* Cheek warmth */}
      <ellipse cx="45" cy="70" rx="6" ry="4" fill="#e09060" opacity="0.3"/>
      <ellipse cx="75" cy="70" rx="6" ry="4" fill="#e09060" opacity="0.3"/>

      {/* Beard - full, dark */}
      <ellipse cx="60" cy="84" rx="18" ry="12" fill="#1a0f08"/>
      <ellipse cx="60" cy="80" rx="14" ry="9" fill="#120a05"/>
      <path d="M46 76 Q60 90 74 76 Q68 95 60 96 Q52 95 46 76Z" fill="#1a0f08"/>

      {/* Mustache */}
      <path d="M50 72 Q55 69 60 71 Q65 69 70 72 Q65 75 60 74 Q55 75 50 72Z" fill="#120a05"/>

      {/* Eyes - warm brown */}
      <ellipse cx="51" cy="62" rx="4" ry="4.5" fill="#0a0500"/>
      <ellipse cx="69" cy="62" rx="4" ry="4.5" fill="#0a0500"/>
      {/* Iris */}
      <ellipse cx="51" cy="62" rx="2.5" ry="3" fill="#3d1a00"/>
      <ellipse cx="69" cy="62" rx="2.5" ry="3" fill="#3d1a00"/>
      {/* Shine */}
      <circle cx="52.5" cy="60.5" r="1.2" fill="white" opacity="0.9"/>
      <circle cx="70.5" cy="60.5" r="1.2" fill="white" opacity="0.9"/>

      {/* Eyebrows - strong */}
      <path d="M45 57 Q51 54.5 57 56.5" stroke="#1a0a00" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M63 56.5 Q69 54.5 75 57" stroke="#1a0a00" strokeWidth="2" fill="none" strokeLinecap="round"/>

      {/* Nose */}
      <ellipse cx="60" cy="68" rx="3" ry="4" fill="#b87040" opacity="0.6"/>
      <path d="M56 71 Q60 73 64 71" stroke="#a06030" strokeWidth="1" fill="none"/>

      {/* Mouth - animated when speaking */}
      {speaking ? (
        <ellipse cx="60" cy="77" rx="5" ry="3.5" fill="#8b3010" style={{animation:"speakMouth 0.25s ease-in-out infinite alternate"}}/>
      ) : (
        <path d="M54 76 Q60 80 66 76" stroke="#8b3010" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      )}

      {/* ── BLACK TURBAN ── */}
      {/* Turban base wrap */}
      <ellipse cx="60" cy="44" rx="26" ry="10" fill="#111111"/>
      {/* Main turban body layers */}
      <path d="M34 44 Q36 28 60 24 Q84 28 86 44 Q74 36 60 35 Q46 36 34 44Z" fill="#1a1a1a"/>
      <path d="M36 40 Q38 24 60 20 Q82 24 84 40 Q72 32 60 31 Q48 32 36 40Z" fill="#222222"/>
      <path d="M39 36 Q42 20 60 17 Q78 20 81 36 Q70 28 60 27 Q50 28 39 36Z" fill="#1a1a1a"/>
      <path d="M42 32 Q46 16 60 14 Q74 16 78 32 Q68 25 60 24 Q52 25 42 32Z" fill="#111111"/>
      {/* Turban peak */}
      <ellipse cx="60" cy="14" rx="10" ry="6" fill="#0a0a0a"/>
      <ellipse cx="60" cy="11" rx="6" ry="5" fill="#111111"/>
      {/* Wrap detail lines */}
      <path d="M36 40 Q60 47 84 40" stroke="#333" strokeWidth="0.8" fill="none" opacity="0.8"/>
      <path d="M38 36 Q60 43 82 36" stroke="#2a2a2a" strokeWidth="0.8" fill="none" opacity="0.6"/>
      {/* Golden turban pin/badge */}
      <circle cx="60" cy="27" r="3.5" fill="#ffd700" opacity="0.8" filter="url(#glow)"/>
      <circle cx="60" cy="27" r="2" fill="#ffaa00"/>
      {/* Loose end of turban hanging on left */}
      <path d="M36 38 Q30 50 33 62 Q35 68 38 66 Q36 55 40 45Z" fill="#1a1a1a"/>

      {/* Book in right hand area */}
      <rect x="76" y="90" width="18" height="22" rx="2.5" fill="#5c2a00"/>
      <rect x="78" y="90" width="14" height="22" rx="1.5" fill="#f5e8c0"/>
      <rect x="76" y="90" width="3" height="22" rx="1" fill="#3d1a00"/>
      <line x1="80" y1="95" x2="90" y2="95" stroke="#8b4513" strokeWidth="0.8" opacity="0.5"/>
      <line x1="80" y1="99" x2="90" y2="99" stroke="#8b4513" strokeWidth="0.8" opacity="0.5"/>
      <line x1="80" y1="103" x2="90" y2="103" stroke="#8b4513" strokeWidth="0.8" opacity="0.5"/>
      <line x1="80" y1="107" x2="90" y2="107" stroke="#8b4513" strokeWidth="0.8" opacity="0.5"/>

      {/* Speaking ripple effects */}
      {speaking && (
        <>
          <circle cx="60" cy="60" r="62" fill="none" stroke="#ffd700" strokeWidth="1.5" opacity="0.15" style={{animation:"speakRing 0.8s ease-out infinite"}}/>
          <circle cx="60" cy="60" r="64" fill="none" stroke="#ffd700" strokeWidth="1" opacity="0.08" style={{animation:"speakRing 0.8s ease-out 0.3s infinite"}}/>
        </>
      )}
    </svg>
  );
}

const starPositions = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  top: Math.random() * 100,
  size: Math.random() * 3 + 1,
  delay: Math.random() * 4,
}));

const lanternColors = ["#c0392b", "#8e44ad", "#e67e22", "#27ae60", "#2980b9"];

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

const systemPrompt = `You are "Ustadh Noor" — a warm, gentle, and knowledgeable Islamic educator helping children (ages 6–14) learn about the events of Karbala, Imam Hussain (AS), Muharram, and Azadari. You are displayed on a projector in a classroom, speaking to a group of students.

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

// The opening message Ustadh Noor shows and speaks aloud on startup.
const GREETING =
  "As-salamu alaykum, dear students! 🌹 I am Ustadh Noor, your Karbala Guide. Ask me anything about Imam Hussain (AS), the events of Karbala, Muharram, or Azadari. I am here to help you learn! 💫";

export default function KarbalaChatbot() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const bottomRef = useRef(null);
  const synthRef = useRef(typeof window !== "undefined" ? window.speechSynthesis : null);
  const voicesRef = useRef([]);
  const mutedRef = useRef(false);
  const greetedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Voices load asynchronously — getVoices() is often empty on first call, so
  // cache them now and refresh when the browser fires `voiceschanged`.
  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;
    const loadVoices = () => { voicesRef.current = synth.getVoices(); };
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    // Stop any speech if the component unmounts (e.g. dev hot-reload).
    return () => {
      synth.removeEventListener("voiceschanged", loadVoices);
      synth.cancel();
    };
  }, []);

  // Speak the given text aloud and drive the avatar's speaking animation from
  // the real audio (onstart → animate, onend → stop). `onStart` fires only when
  // audio actually begins (used to confirm the startup greeting played).
  function speak(text, onStart) {
    const synth = synthRef.current;
    if (!synth || mutedRef.current) return;
    synth.cancel();
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = SPEECH_RATE; utter.pitch = SPEECH_PITCH; utter.volume = 1;
    const voices = voicesRef.current.length ? voicesRef.current : synth.getVoices();
    const v = pickMaleVoice(voices);
    if (v) utter.voice = v;
    utter.lang = (v && v.lang) || SPEECH_LANG;
    utter.onstart = () => { setSpeaking(true); onStart?.(); };
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    synth.speak(utter);
  }

  // Speak the opening greeting on startup. Browsers block speech until the user
  // interacts with the page, so we try immediately (works where allowed) and
  // also arm a one-time "first interaction" fallback that guarantees it plays.
  useEffect(() => {
    const markGreeted = () => { greetedRef.current = true; };
    const tryGreet = () => {
      if (greetedRef.current) return;
      speak(GREETING, markGreeted);
    };
    const onGesture = () => {
      if (!greetedRef.current) tryGreet();
      detach();
    };
    const detach = () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    // Optimistic attempt for browsers that allow speech without a gesture.
    const t = setTimeout(tryGreet, 400);
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => { clearTimeout(t); detach(); };
  }, []);

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (next) { synthRef.current?.cancel(); setSpeaking(false); }
      return next;
    });
  }

  async function sendMessage(text) {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput("");
    // Interrupt any answer currently being spoken.
    synthRef.current?.cancel();
    setSpeaking(false);

    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Calls our own dev-server proxy (see vite.config.js) / serverless function
      // (api/chat.js), which injects the Anthropic API key server-side. The
      // browser never sees the key, and there's no CORS block.
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      const reply =
        data.content?.[0]?.text ||
        data.error?.message ||
        "I'm sorry, I couldn't answer that. Please try again! 🌹";
      setMessages([...newMessages, { role: "assistant", content: reply }]);
      speak(reply);
    } catch {
      const errReply = "Oops! Something went wrong. Please try again! 🌹";
      setMessages([...newMessages, { role: "assistant", content: errReply }]);
      speak(errReply);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.wrapper}>
      {/* Stars */}
      {starPositions.map((st) => (
        <div key={st.id} style={{ ...s.star, left:`${st.left}%`, top:`${st.top}%`, width:st.size, height:st.size, animationDelay:`${st.delay}s` }}/>
      ))}

      {/* Top lanterns string */}
      <div style={s.lanternBar}>
        {lanternColors.map((col, i) => (
          <div key={i} style={{ ...s.lanternWrap, animationDelay:`${i*0.5}s` }}>
            <div style={s.lanternString}/>
            <div style={{ ...s.lantern, background: col }}>
              <div style={s.lanternCap}/>
              <div style={s.lanternFlame}/>
            </div>
          </div>
        ))}
      </div>

      {/* Main layout: Scholar LEFT, Chat RIGHT */}
      <div style={s.mainLayout}>

        {/* ── LEFT: Scholar Panel ── */}
        <div style={s.scholarSide}>
          <div style={s.scholarCircle}>
            <ScholarAvatar size={180} speaking={speaking || loading} floating={!speaking && !loading}/>
            {(speaking || loading) && (
              <div style={s.speechWave}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{ ...s.waveBar, animationDelay:`${i*0.12}s`, height: `${20 + Math.sin(i)*12}px` }}/>
                ))}
              </div>
            )}
          </div>
          <div style={s.scholarName}>Ustadh Noor</div>
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
          {hasLogo ? (
            <img src={KAZ_LOGO_B64} alt="KAZ" style={s.kazLogo}/>
          ) : (
            <div style={s.kazLogoFallback}>KAZ</div>
          )}
        </div>

        {/* ── RIGHT: Chat Panel ── */}
        <div style={s.chatSide}>
          {/* Header */}
          <div style={s.header}>
            <div style={s.headerTitle}>🕌 Ask Ustadh Noor</div>
            <div style={s.headerSub}>About Imam Hussain (AS), Karbala & Muharram</div>
          </div>

          {/* Messages */}
          <div style={s.messages}>
            {messages.map((msg, i) => (
              <div key={i} style={{ ...s.msgRow, justifyContent: msg.role==="user" ? "flex-end" : "flex-start" }}>
                {msg.role === "assistant" && <ScholarAvatar size={40}/>}
                <div style={msg.role==="user" ? s.userBubble : s.botBubble}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ ...s.msgRow, justifyContent:"flex-start" }}>
                <ScholarAvatar size={40}/>
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
        @keyframes swingLantern {
          0%,100% { transform:rotate(-8deg); }
          50% { transform:rotate(8deg); }
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
        @keyframes speakMouth {
          0% { ry:2; }
          100% { ry:5; }
        }
        @keyframes speakRing {
          0% { transform:scale(1); opacity:0.2; }
          100% { transform:scale(1.15); opacity:0; }
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
  star: {
    position: "absolute",
    borderRadius: "50%",
    background: "#fff8e1",
    animation: "twinkle 4s ease-in-out infinite",
    zIndex: 0,
    pointerEvents: "none",
  },
  lanternBar: {
    display: "flex",
    gap: "60px",
    alignItems: "flex-start",
    marginBottom: 8,
    zIndex: 2,
    paddingTop: 0,
  },
  lanternWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    animation: "swingLantern 4s ease-in-out infinite",
    transformOrigin: "top center",
  },
  lanternString: { width:2, height:40, background:"#666" },
  lantern: {
    width:32, height:48,
    borderRadius: "50% 50% 45% 45%",
    position: "relative",
    boxShadow: "0 0 20px 8px rgba(255,150,50,0.3)",
  },
  lanternCap: {
    position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)",
    width:24, height:12, background:"#444", borderRadius:"4px 4px 0 0",
  },
  lanternFlame: {
    position:"absolute", inset:6, borderRadius:"50%",
    background:"rgba(255,220,80,0.65)",
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
    width: 80, height: 80,
    borderRadius: "50%",
    objectFit: "cover",
    border: "2px solid rgba(255,215,0,0.4)",
    marginTop: 12,
    boxShadow: "0 0 16px rgba(255,150,50,0.3)",
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
