// A full-body blocky character dressed for a role, so picking a role feels like picking an outfit.
// The costume is chosen from words in the role name; colours vary with the role's position.

type Kind = "student" | "teacher" | "nutrition" | "cook" | "parent" | "official" | "activist" | "counselor" | "privacy";

export function roleKind(name: string): Kind {
  if (name.includes("조리")) return "cook";
  if (name.includes("영양")) return "nutrition";
  if (name.includes("활동가")) return "activist";
  if (name.includes("상담")) return "counselor";
  if (name.includes("정보보호") || name.includes("개인정보")) return "privacy";
  if (name.includes("교사")) return "teacher";
  if (name.includes("학부모") || name.includes("부모")) return "parent";
  if (name.includes("학생")) return "student";
  return "official";
}

const SKIN = ["#e3ad89", "#d49a73", "#efc39f", "#c98e6a", "#e8b896"];
const HAIR = ["#2f2420", "#4a3324", "#1d1d22", "#6b4a32", "#3a2a22"];
const ACCENT = ["#2c4a7a", "#4a6b5a", "#7a4a5a", "#5a4a7a", "#a56b53"];

export default function RoleAvatar({ name, index, className = "" }: { name: string; index: number; className?: string }) {
  const kind = roleKind(name);
  const skin = SKIN[index % SKIN.length];
  const hair = HAIR[(index + 2) % HAIR.length];
  const accent = ACCENT[index % ACCENT.length];
  const white = "#f2efe6";
  const top = {
    student: accent,
    teacher: "#8a6a4b",
    nutrition: white,
    cook: "#e9edf2",
    parent: "#b0a1c5",
    official: "#27384f",
    activist: "#7fc79c",
    counselor: "#c98d66",
    privacy: "#33476a",
  }[kind];
  const pants = kind === "cook" || kind === "nutrition" ? "#5a6478" : kind === "student" ? "#2a3247" : "#3a3f4d";
  return (
    <svg className={`role-avatar kind-${kind} ${className}`} viewBox="0 -40 240 400" aria-hidden>
      <ellipse cx="120" cy="346" rx="78" ry="12" fill="#000" opacity="0.35" />
      {/* Legs and shoes */}
      <rect x="84" y="250" width="30" height="88" rx="10" fill={pants} />
      <rect x="126" y="250" width="30" height="88" rx="10" fill={pants} />
      <rect x="78" y="326" width="40" height="16" rx="8" fill="#1d2230" />
      <rect x="122" y="326" width="40" height="16" rx="8" fill="#1d2230" />
      {/* Body */}
      <g className="avatar-body">
        <rect x="64" y="132" width="112" height="128" rx="24" fill={top} />
        {(kind === "student" || kind === "official" || kind === "privacy" || kind === "teacher" || kind === "counselor") && <path d="M104 132 L120 176 L136 132 Z" fill={white} />}
        {(kind === "official" || kind === "privacy") && <path d="M114 142 L120 196 L126 142 Z" fill="#c4473a" />}
        {kind === "student" && <path d="M110 142 L120 160 L130 142 Z" fill="#c4473a" />}
        {kind === "student" && (
          <>
            <rect x="74" y="136" width="10" height="110" rx="5" fill="#1d2230" opacity="0.8" />
            <rect x="156" y="136" width="10" height="110" rx="5" fill="#1d2230" opacity="0.8" />
          </>
        )}
        {(kind === "teacher" || kind === "counselor") && (
          <>
            <rect x="64" y="132" width="34" height="128" rx="14" fill="#000" opacity="0.12" />
            <rect x="142" y="132" width="34" height="128" rx="14" fill="#000" opacity="0.12" />
          </>
        )}
        {kind === "counselor" && <path d="M146 168 c-6 -10 -20 -4 -14 6 l14 12 l14 -12 c6 -10 -8 -16 -14 -6 z" fill="#e2503c" />}
        {kind === "privacy" && <path d="M146 158 l14 6 v10 c0 10 -7 16 -14 19 c-7 -3 -14 -9 -14 -19 v-10 z" fill="#e6b85c" />}
        {kind === "parent" && (
          <g opacity="0.3">
            {[0, 1, 2, 3].map((r) => (
              <rect key={r} x="70" y={150 + r * 26} width="100" height="6" rx="3" fill="#fff" />
            ))}
          </g>
        )}
        {kind === "cook" && <rect x="82" y="168" width="76" height="92" rx="12" fill="#f8f8f4" stroke="#c9ccd4" strokeWidth="3" />}
        {kind === "activist" && <rect x="64" y="132" width="112" height="60" rx="20" fill="#3aa36b" />}
        {(kind === "official" || kind === "nutrition") && (
          <>
            <path d="M104 136 L112 186 M136 136 L128 186" stroke="#e6b85c" strokeWidth="3" />
            <rect x="116" y="184" width="22" height="28" rx="4" fill="#f6efe0" stroke="#e6b85c" strokeWidth="2" />
          </>
        )}
      </g>
      {/* Arms */}
      <rect x="40" y="140" width="28" height="100" rx="14" fill={top} />
      <rect x="172" y="140" width="28" height="100" rx="14" fill={top} />
      <rect x="42" y="232" width="24" height="24" rx="10" fill={skin} />
      <rect x="174" y="232" width="24" height="24" rx="10" fill={skin} />
      {/* Props held in the right hand */}
      {(kind === "student" || kind === "teacher") && <rect x="182" y="214" width="40" height="52" rx="6" fill={kind === "student" ? "#e6b85c" : "#c4473a"} transform="rotate(8 202 240)" />}
      {(kind === "official" || kind === "nutrition") && (
        <g transform="rotate(6 200 240)">
          <rect x="178" y="206" width="46" height="62" rx="6" fill="#d6c7a1" />
          <rect x="186" y="218" width="30" height="5" rx="2" fill="#7b8596" />
          <rect x="186" y="230" width="24" height="5" rx="2" fill="#7b8596" />
        </g>
      )}
      {kind === "cook" && <path d="M196 250 L214 170 m-6 0 a14 10 0 1 0 14 0" stroke="#9aa4b6" strokeWidth="7" fill="#9aa4b6" strokeLinecap="round" />}
      {kind === "parent" && (
        <g>
          <path d="M184 238 q14 -28 28 0" stroke="#7a4a3a" strokeWidth="5" fill="none" />
          <rect x="176" y="236" width="46" height="40" rx="10" fill="#a56b53" />
        </g>
      )}
      {kind === "activist" && (
        <g>
          <rect x="196" y="120" width="8" height="140" rx="4" fill="#8a6a4b" />
          <rect x="164" y="74" width="72" height="56" rx="8" fill="#f6efe0" stroke="#3aa36b" strokeWidth="4" />
          <text x="200" y="114" textAnchor="middle" fontSize="34" fontWeight="900" fill="#3aa36b">!</text>
        </g>
      )}
      {kind === "privacy" && <rect x="170" y="226" width="56" height="38" rx="5" fill="#9aa4b6" stroke="#5a6478" strokeWidth="3" />}
      {kind === "counselor" && <rect x="182" y="226" width="30" height="34" rx="6" fill="#f6efe0" />}
      {/* Head */}
      <g className="avatar-head">
        <rect x="108" y="108" width="24" height="28" rx="6" fill={skin} />
        <rect x="70" y="20" width="100" height="94" rx="20" fill={skin} />
        <rect x="64" y="10" width="112" height="34" rx="16" fill={hair} />
        {index % 2 === 1 && <rect x="64" y="22" width="16" height="64" rx="8" fill={hair} />}
        {index % 2 === 1 && <rect x="160" y="22" width="16" height="64" rx="8" fill={hair} />}
        <g className="avatar-eyes">
          <rect x="92" y="58" width="12" height="16" rx="4" fill="#1d2428" />
          <rect x="136" y="58" width="12" height="16" rx="4" fill="#1d2428" />
        </g>
        {(kind === "teacher" || kind === "privacy") && (
          <g fill="none" stroke="#3a3d44" strokeWidth="4">
            <rect x="84" y="52" width="28" height="26" rx="8" />
            <rect x="128" y="52" width="28" height="26" rx="8" />
            <path d="M112 64 h16" />
          </g>
        )}
        <path d="M106 92 q14 10 28 0" stroke="#8a4b45" strokeWidth="5" fill="none" strokeLinecap="round" />
        {kind === "cook" && (
          <g>
            <rect x="74" y="-6" width="92" height="30" rx="8" fill="#fbfbf7" />
            <circle cx="92" cy="-10" r="20" fill="#fbfbf7" />
            <circle cx="120" cy="-18" r="24" fill="#fbfbf7" />
            <circle cx="148" cy="-10" r="20" fill="#fbfbf7" />
          </g>
        )}
        {kind === "nutrition" && <rect x="66" y="6" width="108" height="26" rx="12" fill="#fbfbf7" />}
        {kind === "activist" && (
          <g>
            <rect x="64" y="6" width="112" height="30" rx="14" fill="#3aa36b" />
            <rect x="150" y="26" width="44" height="12" rx="6" fill="#2f8a59" />
          </g>
        )}
      </g>
    </svg>
  );
}
