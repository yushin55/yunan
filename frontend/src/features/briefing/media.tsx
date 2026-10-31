// Shared pieces of the briefing and rules videos: the on-screen people and the opening sting.

let audioContext: AudioContext | null = null;

/** A short synthesised sting for an opening title card. */
export function playSting() {
  try {
    audioContext ??= new AudioContext();
    const ctx = audioContext;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    gain.connect(ctx.destination);
    [392, 523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.14;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, t + (i === 3 ? 1.2 : 0.35));
      osc.connect(env).connect(gain);
      osc.start(t);
      osc.stop(t + 1.3);
    });
  } catch {
    /* Audio is optional. */
  }
}

/** A blocky bust. `look` 0 is the anchor; the mouth opens with the narration's loudness. */
export function Person({ mouth, look, className = "" }: { mouth: number; look: number; className?: string }) {
  const skin = ["#e3ad89", "#d49a73", "#efc39f", "#c98e6a", "#e8b896", "#b98060"][look % 6];
  const hair = ["#2f2420", "#4a3324", "#1d1d22", "#6b4a32", "#2a2a33", "#5a3a28"][look % 6];
  const suit = ["#27384f", "#4a6b5a", "#7a4a5a", "#5a4a7a", "#a56b53", "#667f9c"][look % 6];
  return (
    <svg className={`news-person ${className}`} viewBox="0 0 220 260" aria-hidden>
      <rect x="30" y="150" width="160" height="120" rx="26" fill={suit} />
      <path d="M90 150 L110 196 L130 150 Z" fill="#f4efe4" />
      {look === 0 && <path d="M104 160 L110 205 L116 160 Z" fill="#c4473a" />}
      {look === 0 && <circle cx="150" cy="178" r="5" fill="#e6b85c" />}
      <rect x="96" y="128" width="28" height="26" rx="6" fill={skin} />
      <g className="person-head">
        <rect x="58" y="40" width="104" height="96" rx="20" fill={skin} />
        <rect x="52" y="30" width="116" height="34" rx="16" fill={hair} />
        <rect x="52" y="44" width="16" height={look === 2 ? 70 : 44} rx="8" fill={hair} />
        <rect x="152" y="44" width="16" height={look === 2 ? 70 : 44} rx="8" fill={hair} />
        <g className="person-eyes">
          <rect x="80" y="78" width="12" height="16" rx="4" fill="#1d2428" />
          <rect x="128" y="78" width="12" height="16" rx="4" fill="#1d2428" />
        </g>
        {look === 3 && (
          <g fill="none" stroke="#4d4c44" strokeWidth="4">
            <rect x="72" y="72" width="28" height="26" rx="8" />
            <rect x="120" y="72" width="28" height="26" rx="8" />
          </g>
        )}
        <rect x="76" y="70" width="20" height="4" rx="2" fill={hair} />
        <rect x="124" y="70" width="20" height="4" rx="2" fill={hair} />
        <rect x="98" y={113 - mouth * 1.4} width="24" height={6 + mouth * 2.8} rx="4" fill="#8a4b45" />
      </g>
    </svg>
  );
}
