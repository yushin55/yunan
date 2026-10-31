import { memo } from "react";

// Illustrated "footage" for the issue briefing: one animated scene per topic, drawn in SVG
// so it ships with the game (no stock photos, no real people or places).

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function Classroom() {
  return (
    <>
      <rect width="1600" height="900" fill="#2b3b55" />
      <rect y="640" width="1600" height="260" fill="#4a3628" />
      <rect x="300" y="110" width="960" height="380" rx="10" fill="#6b4f3a" />
      <rect x="320" y="128" width="920" height="344" rx="6" fill="#2f5d4c" />
      <text x="370" y="220" fill="#eef3ea" opacity="0.85" fontSize="64" fontFamily="'Noto Serif KR', serif">수업 중</text>
      {range(4).map((i) => (
        <rect key={i} x={370} y={270 + i * 46} width={[520, 640, 420, 580][i]} height="10" rx="5" fill="#eef3ea" opacity="0.35" />
      ))}
      <circle cx="1420" cy="160" r="54" fill="#f1ece0" stroke="#3a2f26" strokeWidth="8" />
      <path d="M1420 160 L1420 125 M1420 160 L1446 172" stroke="#3a2f26" strokeWidth="7" strokeLinecap="round" />
      {/* Phone storage pockets on the side wall. */}
      <rect x="40" y="170" width="200" height="300" rx="10" fill="#1d2a40" />
      {range(12).map((i) => (
        <g key={i}>
          <rect x={56 + (i % 3) * 62} y={190 + Math.floor(i / 3) * 70} width="50" height="58" rx="6" fill="#33476a" />
          {i % 4 !== 1 && <rect x={66 + (i % 3) * 62} y={198 + Math.floor(i / 3) * 70} width="30" height="44" rx="5" fill="#0f1726" />}
        </g>
      ))}
      {/* Rows of desks and students seen from the back. */}
      {range(3).flatMap((row) =>
        range(5).map((col) => {
          const scale = 0.7 + row * 0.18;
          const x = 260 + col * 260 + (row % 2) * 40;
          const y = 520 + row * 105;
          return (
            <g key={`${row}-${col}`} transform={`translate(${x} ${y}) scale(${scale})`}>
              <rect x="-70" y="40" width="140" height="22" rx="4" fill="#8a6a4b" />
              <rect x="-42" y="-40" width="84" height="84" rx="14" fill={["#e3ad89", "#d49a73", "#efc39f"][(row + col) % 3]} />
              <rect x="-46" y="-48" width="92" height="40" rx="14" fill={["#2f2420", "#4a3324", "#1d1d22"][(row * 2 + col) % 3]} />
              <rect x="-58" y="40" width="116" height="70" rx="16" fill={["#2c4a7a", "#4a6b5a", "#7a4a5a"][(row + col * 2) % 3]} />
            </g>
          );
        }),
      )}
      {/* A phone in hand, buzzing with notifications. */}
      <g className="art-buzz" transform="translate(1210 470)">
        <rect x="0" y="120" width="190" height="320" rx="60" fill="#e3ad89" />
        <rect x="-10" y="-20" width="230" height="430" rx="36" fill="#0d121b" />
        <rect x="6" y="0" width="198" height="380" rx="24" fill="url(#cls-screen)" />
        {range(3).map((i) => (
          <g key={i} className="art-pop" style={{ animationDelay: `${i * 0.9}s` }}>
            <rect x="20" y={40 + i * 92} width="170" height="72" rx="16" fill="#f4f7fb" opacity="0.95" />
            <circle cx="50" cy={76 + i * 92} r="16" fill={["#e2503c", "#e6b85c", "#5d93e6"][i]} />
            <rect x="76" y={62 + i * 92} width="96" height="10" rx="5" fill="#9aa6b8" />
            <rect x="76" y={82 + i * 92} width="70" height="10" rx="5" fill="#c3ccd8" />
          </g>
        ))}
      </g>
      <defs>
        <linearGradient id="cls-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b6fd4" />
          <stop offset="1" stopColor="#7a4fd0" />
        </linearGradient>
      </defs>
    </>
  );
}

function Homework() {
  return (
    <>
      <rect width="1600" height="900" fill="#18213a" />
      <rect x="1120" y="80" width="360" height="300" rx="12" fill="#0e1528" stroke="#3a4766" strokeWidth="10" />
      <circle cx="1380" cy="170" r="46" fill="#f2e7c4" />
      {range(14).map((i) => (
        <circle key={i} cx={1150 + ((i * 97) % 300)} cy={110 + ((i * 53) % 240)} r="3" fill="#cfd8ea" opacity="0.7" />
      ))}
      <rect y="600" width="1600" height="300" fill="#5a4232" />
      <polygon points="1400,600 1500,330 1560,330 1460,600" fill="#3a2d24" />
      <polygon points="1380,330 1580,330 1640,900 1250,900" fill="#f6e3a6" opacity="0.08" />
      {/* Report with highlighted lines under a moving magnifier. */}
      <g transform="translate(150 470) rotate(-8)">
        <rect width="420" height="400" rx="8" fill="#f7f3ea" />
        <rect x="30" y="30" width="220" height="22" rx="6" fill="#2b3550" />
        {range(9).map((i) => (
          <rect key={i} x="30" y={80 + i * 32} width={[340, 320, 360, 300, 350, 280, 340, 310, 200][i]} height="12" rx="6" fill={i === 3 || i === 4 ? "#f2d35c" : "#b9c0cc"} opacity={i === 3 || i === 4 ? 0.9 : 0.8} />
        ))}
        <g className="art-scan">
          <circle cx="180" cy="210" r="70" fill="#d8ecff" opacity="0.25" stroke="#2b3550" strokeWidth="14" />
          <rect x="226" y="262" width="30" height="110" rx="12" fill="#2b3550" transform="rotate(-40 241 317)" />
        </g>
      </g>
      {/* Laptop with an AI chat in progress. */}
      <polygon points="560,780 1240,780 1300,840 500,840" fill="#9aa4b6" />
      <rect x="600" y="330" width="600" height="450" rx="22" fill="#141a26" />
      <rect x="622" y="352" width="556" height="406" rx="12" fill="#eef2f8" />
      <rect x="622" y="352" width="556" height="52" rx="12" fill="#2f4a7a" />
      <circle cx="656" cy="378" r="14" fill="#7fc79c" />
      <text x="682" y="388" fill="#fff" fontSize="26" fontWeight="700">AI</text>
      <rect x="900" y="430" width="250" height="56" rx="18" fill="#5d93e6" />
      <rect x="650" y="506" width="330" height="96" rx="18" fill="#d5dbe6" />
      <rect x="880" y="622" width="270" height="56" rx="18" fill="#5d93e6" />
      <g className="art-typing">
        <rect x="650" y="696" width="120" height="44" rx="18" fill="#d5dbe6" />
        {range(3).map((i) => (
          <circle key={i} cx={684 + i * 26} cy="718" r="7" fill="#6b778c" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </g>
    </>
  );
}

function Hallway() {
  const lockers = range(7);
  return (
    <>
      <polygon points="0,0 1600,0 980,330 620,330" fill="#1b2335" />
      <polygon points="0,900 1600,900 980,470 620,470" fill="#3a4258" />
      <polygon points="0,0 620,330 620,470 0,900" fill="#2b3550" />
      <polygon points="1600,0 980,330 980,470 1600,900" fill="#2b3550" />
      <rect x="620" y="330" width="360" height="140" fill="#3d4a66" />
      <rect x="760" y="360" width="80" height="110" fill="#1b2335" />
      {range(5).map((i) => {
        const t = i / 5;
        const w = 220 * (1 - t * 0.85);
        const y = 60 + t * 250;
        return <rect key={i} x={800 - w / 2} y={y} width={w} height={14 * (1 - t * 0.8)} rx="4" fill="#f4f1e6" opacity={0.85 - t * 0.4} />;
      })}
      {/* Lockers on both walls, shrinking toward the far end. */}
      {lockers.map((i) => {
        const t = i / 7;
        const x0 = 20 + t * 560;
        const w = 80 * (1 - t * 0.8);
        const top = 250 + t * 105;
        const bottom = 820 - t * 360;
        const fill = i % 2 ? "#4f6d9a" : "#5a7aaa";
        return (
          <g key={i}>
            <polygon points={`${x0},${top} ${x0 + w},${top + w * 0.5} ${x0 + w},${bottom - w * 0.7} ${x0},${bottom}`} fill={fill} stroke="#22314c" strokeWidth="3" />
            <polygon points={`${1600 - x0},${top} ${1600 - x0 - w},${top + w * 0.5} ${1600 - x0 - w},${bottom - w * 0.7} ${1600 - x0},${bottom}`} fill={fill} stroke="#22314c" strokeWidth="3" />
          </g>
        );
      })}
      <g transform="translate(860 410) scale(0.45)">
        <rect x="-30" y="-120" width="60" height="60" rx="14" fill="#e3ad89" />
        <rect x="-42" y="-64" width="84" height="120" rx="18" fill="#2c4a7a" />
        <rect x="-30" y="56" width="22" height="70" rx="8" fill="#1d2a40" />
        <rect x="8" y="56" width="22" height="70" rx="8" fill="#1d2a40" />
      </g>
      {/* Ceiling camera sweeping the hallway. */}
      <g transform="translate(1310 120)">
        <rect x="-10" y="-80" width="20" height="90" fill="#9aa4b6" />
        <g className="art-sweep">
          <polygon points="-40,40 -560,700 -120,760" fill="#ff6b5a" opacity="0.12" />
          <rect x="-150" y="0" width="190" height="80" rx="18" fill="#dfe5ee" />
          <rect x="-190" y="12" width="56" height="56" rx="12" fill="#2b3550" />
          <circle cx="-162" cy="40" r="16" fill="#0b1220" stroke="#5d93e6" strokeWidth="5" />
        </g>
      </g>
      <g className="art-rec">
        <circle cx="90" cy="80" r="16" fill="#ff3b30" />
        <text x="118" y="92" fill="#fff" fontSize="36" fontWeight="800" letterSpacing="4">REC</text>
      </g>
    </>
  );
}

function Wardrobe() {
  const Hanger = ({ x, children, delay }: { x: number; children: React.ReactNode; delay: number }) => (
    <g transform={`translate(${x} 170)`}>
      <g className="art-swing" style={{ animationDelay: `${delay}s` }}>
        <path d="M0 -10 q0 -28 22 -28" stroke="#c9ccd4" strokeWidth="8" fill="none" />
        <path d="M-110 40 L0 0 L110 40" stroke="#c9ccd4" strokeWidth="10" fill="none" strokeLinecap="round" />
        {children}
      </g>
    </g>
  );
  return (
    <>
      <rect width="1600" height="900" fill="#2b3348" />
      <rect y="760" width="1600" height="140" fill="#4a3a2e" />
      <rect x="120" y="120" width="1360" height="20" rx="10" fill="#b8bec9" />
      <Hanger x={400} delay={0}>
        {/* Blazer with tie and a price tag. */}
        <path d="M-120 40 L120 40 L140 470 L-140 470 Z" fill="#23365c" />
        <path d="M-40 40 L0 150 L40 40 Z" fill="#f2efe6" />
        <path d="M-12 60 L0 220 L12 60 Z" fill="#c4473a" />
        <path d="M-40 40 L-10 260 L-70 120 Z" fill="#1a2946" />
        <path d="M40 40 L10 260 L70 120 Z" fill="#1a2946" />
        <circle cx="-70" cy="200" r="16" fill="#e6b85c" />
        <g className="art-tag">
          <line x1="110" y1="300" x2="160" y2="370" stroke="#d6c7a1" strokeWidth="4" />
          <rect x="140" y="360" width="90" height="56" rx="10" fill="#f6efe0" transform="rotate(14 185 388)" />
          <text x="164" y="402" fill="#c4473a" fontSize="34" fontWeight="900" transform="rotate(14 185 388)">₩</text>
        </g>
      </Hanger>
      <Hanger x={780} delay={0.6}>
        {/* Hoodie. */}
        <path d="M-130 40 L130 40 L120 440 L-120 440 Z" fill="#8c95a6" />
        <path d="M-70 40 q70 110 140 0" fill="#7a8395" />
        <rect x="-70" y="290" width="140" height="80" rx="16" fill="#7a8395" />
        <line x1="-24" y1="80" x2="-24" y2="180" stroke="#e8ebf0" strokeWidth="6" />
        <line x1="24" y1="80" x2="24" y2="180" stroke="#e8ebf0" strokeWidth="6" />
      </Hanger>
      <Hanger x={1150} delay={1.1}>
        {/* Class T-shirt. */}
        <path d="M-120 40 L-200 120 L-150 170 L-110 130 L-110 380 L110 380 L110 130 L150 170 L200 120 L120 40 Z" fill="#e6b85c" />
        <circle cx="0" cy="210" r="48" fill="#c4473a" />
        <text x="-26" y="226" fill="#fff" fontSize="46" fontWeight="900">3반</text>
      </Hanger>
      <rect x="1400" y="260" width="150" height="460" rx="70" fill="#c9d6e6" opacity="0.18" stroke="#9aa4b6" strokeWidth="6" />
      <line x1="1440" y1="320" x2="1500" y2="260" stroke="#fff" strokeWidth="6" opacity="0.35" />
    </>
  );
}

function Cafeteria() {
  return (
    <>
      <rect width="1600" height="900" fill="#d9dfe6" />
      {range(12).flatMap((i) => range(5).map((j) => <rect key={`${i}-${j}`} x={i * 134} y={j * 80} width="132" height="78" fill="#cfd6df" />))}
      <rect y="300" width="1600" height="160" fill="#9aa4b6" />
      <rect y="290" width="1600" height="20" fill="#c3cad6" />
      {/* Steaming pots on the serving counter. */}
      {range(4).map((i) => (
        <g key={i} transform={`translate(${200 + i * 360} 300)`}>
          <rect x="-90" y="-60" width="180" height="70" rx="10" fill="#7b8596" />
          {range(3).map((k) => (
            <path key={k} className="art-steam" style={{ animationDelay: `${k * 0.7 + i * 0.3}s` }} d={`M${-40 + k * 40} -70 q-20 -40 0 -80 q20 -40 0 -80`} stroke="#fff" strokeWidth="10" fill="none" opacity="0.6" strokeLinecap="round" />
          ))}
        </g>
      ))}
      <rect y="460" width="1600" height="440" fill="#bfc6d1" />
      {/* Tray with leftovers. */}
      <g transform="translate(200 520)">
        <rect width="820" height="340" rx="40" fill="url(#caf-tray)" />
        <rect x="30" y="30" width="250" height="140" rx="28" fill="#aab3c0" />
        <ellipse cx="155" cy="100" rx="90" ry="44" fill="#fbfbf7" />
        <rect x="300" y="30" width="230" height="140" rx="28" fill="#aab3c0" />
        <ellipse cx="415" cy="100" rx="84" ry="48" fill="#d9773a" />
        <rect x="550" y="30" width="240" height="140" rx="28" fill="#aab3c0" />
        <ellipse cx="640" cy="110" rx="50" ry="26" fill="#c94a3a" />
        {range(3).map((i) => (
          <rect key={i} x={30 + i * 255} y="190" width="235" height="120" rx="28" fill="#aab3c0" />
        ))}
        <ellipse cx="150" cy="250" rx="70" ry="30" fill="#6c9a4f" />
        <ellipse cx="660" cy="250" rx="40" ry="20" fill="#e6b85c" />
      </g>
      {/* Leftover bin. */}
      <g transform="translate(1180 480)">
        <rect x="0" y="80" width="300" height="320" rx="20" fill="#5d93e6" />
        <rect x="-20" y="40" width="340" height="60" rx="16" fill="#3f6fbf" />
        {range(7).map((i) => (
          <ellipse key={i} cx={50 + ((i * 43) % 220)} cy={38 - (i % 3) * 14} rx="34" ry="18" fill={["#d9773a", "#6c9a4f", "#fbfbf7", "#c94a3a"][i % 4]} />
        ))}
        <text x="96" y="270" fill="#fff" fontSize="64" fontWeight="900">잔반</text>
      </g>
      <defs>
        <linearGradient id="caf-tray" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9edf2" />
          <stop offset="1" stopColor="#9aa4b6" />
        </linearGradient>
      </defs>
    </>
  );
}

function NightBus() {
  return (
    <>
      <rect width="1600" height="900" fill="url(#bus-sky)" />
      {range(24).map((i) => (
        <circle key={i} cx={(i * 137) % 1600} cy={(i * 53) % 260} r="2.5" fill="#fff" opacity="0.6" />
      ))}
      {range(10).map((i) => {
        const w = 120 + ((i * 37) % 80);
        const h = 220 + ((i * 71) % 260);
        const x = i * 165 - 20;
        return (
          <g key={i}>
            <rect x={x} y={640 - h} width={w} height={h} fill={i % 2 ? "#1c2740" : "#16203a"} />
            {range(Math.floor(h / 50)).flatMap((r) =>
              range(Math.floor(w / 40)).map((c) =>
                (r * 3 + c + i) % 4 ? null : <rect key={`${r}-${c}`} x={x + 14 + c * 38} y={640 - h + 20 + r * 48} width="18" height="24" fill="#f6d77a" opacity="0.8" />,
              ),
            )}
          </g>
        );
      })}
      <rect y="640" width="1600" height="260" fill="#232a36" />
      <g className="art-lanes">
        {range(12).map((i) => (
          <rect key={i} x={i * 180} y="780" width="100" height="12" rx="6" fill="#e6b85c" opacity="0.8" />
        ))}
      </g>
      {/* Bus stop with a student waiting. */}
      <g transform="translate(150 430)">
        <rect x="0" y="0" width="300" height="20" fill="#9aa4b6" />
        <rect x="10" y="20" width="12" height="230" fill="#9aa4b6" />
        <rect x="278" y="20" width="12" height="230" fill="#9aa4b6" />
        <rect x="30" y="40" width="240" height="140" rx="8" fill="#5d93e6" opacity="0.25" />
        <rect x="120" y="96" width="60" height="60" rx="14" fill="#e3ad89" />
        <rect x="108" y="150" width="84" height="110" rx="18" fill="#7a4a5a" />
        <rect x="170" y="160" width="40" height="70" rx="12" fill="#e6b85c" />
      </g>
      {/* A bus driving through, with the card reader by the door. */}
      <g className="art-drive">
        <rect x="0" y="470" width="620" height="230" rx="34" fill="#3aa36b" />
        <rect x="0" y="470" width="620" height="44" rx="22" fill="#2f8a59" />
        {range(5).map((i) => (
          <rect key={i} x={40 + i * 112} y="530" width="92" height="80" rx="12" fill="#f6d77a" opacity="0.85" />
        ))}
        <rect x="560" y="530" width="40" height="150" rx="8" fill="#1d2a40" />
        <circle cx="140" cy="705" r="44" fill="#141922" />
        <circle cx="480" cy="705" r="44" fill="#141922" />
        <circle className="art-beep" cx="540" cy="610" r="14" fill="#7fc79c" />
      </g>
      <defs>
        <linearGradient id="bus-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1430" />
          <stop offset="1" stopColor="#3a3463" />
        </linearGradient>
      </defs>
    </>
  );
}

const SCENES: Record<string, () => React.ReactElement> = {
  smartphone_class: Classroom,
  ai_homework: Homework,
  school_cctv: Hallway,
  uniform_choice: Wardrobe,
  lunch_waste: Cafeteria,
  youth_transit: NightBus,
};

/** Full-bleed topic footage; `shot` picks a different slow camera move for each cut. */
function TopicArt({ topicId, shot = 0 }: { topicId?: string; shot?: number }) {
  const Scene = SCENES[topicId ?? ""] ?? Classroom;
  return (
    <div className={`art-wrap shot-${shot % 3}`} aria-hidden>
      <svg className="art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <Scene />
      </svg>
    </div>
  );
}

// The footage only changes with the topic or the cut; skip re-rendering it on every caption tick.
export default memo(TopicArt);
