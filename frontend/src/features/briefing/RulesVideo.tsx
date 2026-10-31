import { memo, useRef } from "react";
import { Play, RotateCcw } from "lucide-react";
import rules from "../../data/rulesVideo.json";
import { PlayerControls } from "./IssueBriefing";
import { Person, playSting } from "./media";
import { clock, useScenePlayer } from "./useScenePlayer";

const SCENES = rules.scenes;
const SEATS = [
  { x: 330, y: 420 },
  { x: 560, y: 360 },
  { x: 800, y: 340 },
  { x: 1040, y: 360 },
  { x: 1270, y: 420 },
];
const SWITCHER = 2;

/** A blocky player seated behind the table. */
function Seat({ x, y, look }: { x: number; y: number; look: number }) {
  const skin = ["#e3ad89", "#d49a73", "#efc39f", "#c98e6a", "#e8b896"][look];
  const hair = ["#2f2420", "#4a3324", "#1d1d22", "#6b4a32", "#2a2a33"][look];
  const top = ["#4a6b5a", "#7a4a5a", "#5a4a7a", "#a56b53", "#667f9c"][look];
  return (
    <g transform={`translate(${x} ${y})`} className="rv-seat">
      <rect x="-70" y="40" width="140" height="130" rx="30" fill={top} />
      <rect x="-56" y="-70" width="112" height="104" rx="22" fill={skin} />
      <rect x="-62" y="-82" width="124" height="38" rx="18" fill={hair} />
      <rect x="-30" y="-24" width="13" height="18" rx="4" fill="#1d2428" />
      <rect x="17" y="-24" width="13" height="18" rx="4" fill="#1d2428" />
      <rect x="-12" y="10" width="24" height="7" rx="3.5" fill="#8a4b45" />
    </g>
  );
}

/** The scene drawn for each rule: the same table, with what changes for that step. */
const Diagram = memo(function Diagram({ id }: { id: string }) {
  return (
    <svg className={`rv-diagram rv-${id}`} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="rv-room" cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor="#24413a" />
          <stop offset="1" stopColor="#0b1210" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#rv-room)" />
      <ellipse cx="800" cy="200" rx="260" ry="60" fill="#f6e3a6" opacity="0.06" />
      {SEATS.map((s, i) => (
        <Seat key={i} x={s.x} y={s.y} look={i} />
      ))}
      <ellipse cx="800" cy="700" rx="700" ry="200" fill="#6b4a32" />
      <ellipse cx="800" cy="690" rx="660" ry="178" fill="#2f6b52" />
      <ellipse cx="800" cy="690" rx="620" ry="160" fill="none" stroke="#e6b85c" strokeOpacity="0.35" strokeWidth="3" />

      {id === "welcome" && (
        <g className="rv-pop">
          <text x="800" y="700" textAnchor="middle" fill="#e6b85c" fontSize="96" fontWeight="900" letterSpacing="6">WHOSE SIDE?</text>
          <text x="800" y="770" textAnchor="middle" fill="#f3eee3" fontSize="40" fontWeight="700">역할 추리 토론</text>
        </g>
      )}

      {id === "choose" &&
        SEATS.map((s, i) => (
          <g key={i} className="rv-pop" style={{ animationDelay: `${i * 0.35}s` }} transform={`translate(${s.x} ${s.y - 190})`}>
            <rect x="-86" y="-50" width="172" height="86" rx="22" fill="#f6efe0" />
            <path d="M-10 36 L0 58 L12 36 Z" fill="#f6efe0" />
            <rect x="-70" y="-36" width="64" height="58" rx="10" fill="#e6b85c" />
            <text x="-38" y="6" textAnchor="middle" fontSize="34" fontWeight="900" fill="#1b1408">1</text>
            <rect x="6" y="-36" width="64" height="58" rx="10" fill="#93b6ea" />
            <text x="38" y="6" textAnchor="middle" fontSize="34" fontWeight="900" fill="#0b1430">2</text>
          </g>
        ))}
      {id === "choose" && (
        <g className="rv-pop" style={{ animationDelay: "2.2s" }}>
          <rect x="560" y="620" width="480" height="96" rx="20" fill="#0b1210" opacity="0.85" />
          <text x="800" y="682" textAnchor="middle" fill="#f3eee3" fontSize="40" fontWeight="800">🔒 내 선택은 나만 봐요</text>
        </g>
      )}

      {id === "assign" &&
        SEATS.map((s, i) => (
          <g key={i} transform={`translate(${s.x} ${s.y + 230})`}>
            <g className="rv-flip" style={{ animationDelay: `${0.4 + i * 0.4}s` }}>
              <rect x="-48" y="-66" width="96" height="132" rx="12" fill={i === SWITCHER ? "#e2503c" : "#e6b85c"} />
              <text x="0" y="16" textAnchor="middle" fontSize="54" fontWeight="900" fill="#1b1408">{i === SWITCHER ? "🎭" : "?"}</text>
            </g>
          </g>
        ))}
      {id === "assign" && (
        <g className="rv-pop" style={{ animationDelay: "2.8s" }}>
          <rect x="560" y="120" width="480" height="92" rx="20" fill="#e2503c" />
          <text x="800" y="180" textAnchor="middle" fill="#fff" fontSize="42" fontWeight="900">역할 전환자는 나만 알아요</text>
        </g>
      )}

      {id === "talk" && (
        <g>
          <g className="rv-pop" transform="translate(800 690)">
            <rect x="-150" y="-80" width="300" height="160" rx="14" fill="#f7f0e1" />
            <rect x="-150" y="-80" width="16" height="160" fill="#e2503c" />
            <text x="10" y="-24" textAnchor="middle" fontSize="34" fontWeight="900" fill="#b23b27">사건 카드</text>
            <rect x="-100" y="0" width="210" height="14" rx="7" fill="#b9b2a3" />
            <rect x="-100" y="32" width="170" height="14" rx="7" fill="#b9b2a3" />
          </g>
          {SEATS.map((s, i) => (
            <g key={i} className="rv-talk" style={{ animationDelay: `${i * 1.1}s` }} transform={`translate(${s.x} ${s.y - 180})`}>
              <rect x="-90" y="-46" width="180" height="76" rx="22" fill={i % 2 ? "#93b6ea" : "#f6efe0"} />
              <path d="M-12 30 L0 54 L14 30 Z" fill={i % 2 ? "#93b6ea" : "#f6efe0"} />
              <text x="0" y="6" textAnchor="middle" fontSize="30" fontWeight="800" fill="#1b2230">{["저는…", "왜죠?", "반론!", "그건…", "질문!"][i]}</text>
            </g>
          ))}
        </g>
      )}

      {id === "vote" && (
        <g>
          <circle className="rv-spot" cx={SEATS[SWITCHER].x} cy={SEATS[SWITCHER].y + 20} r="150" fill="#f6e3a6" opacity="0.18" />
          {SEATS.map((s, i) =>
            i === SWITCHER ? null : (
              <path
                key={i}
                className="rv-arrow"
                style={{ animationDelay: `${i * 0.35}s` }}
                d={`M${s.x} ${s.y + 120} Q ${(s.x + SEATS[SWITCHER].x) / 2} ${s.y + 260} ${SEATS[SWITCHER].x + (s.x < SEATS[SWITCHER].x ? -60 : 60)} ${SEATS[SWITCHER].y + 140}`}
                fill="none"
                stroke="#e2503c"
                strokeWidth="10"
                strokeDasharray="18 14"
                strokeLinecap="round"
              />
            ),
          )}
          <g className="rv-pop" style={{ animationDelay: "2.4s" }} transform={`translate(${SEATS[SWITCHER].x} ${SEATS[SWITCHER].y - 190})`}>
            <rect x="-150" y="-50" width="300" height="88" rx="22" fill="#e2503c" />
            <text x="0" y="8" textAnchor="middle" fontSize="40" fontWeight="900" fill="#fff">🎭 정체 공개!</text>
          </g>
        </g>
      )}

      {id === "safe" && (
        <g>
          <g className="rv-pop" transform="translate(470 680)">
            <rect x="-300" y="-70" width="600" height="140" rx="26" fill="#f6efe0" />
            <text x="-260" y="14" fontSize="40" fontWeight="800" fill="#1b2230">너 진짜 ○○하다</text>
            <path d="M-260 34 q20 10 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#e2503c" strokeWidth="6" fill="none" />
            <g className="rv-pop" style={{ animationDelay: "1.2s" }}>
              <rect x="-280" y="-170" width="560" height="80" rx="18" fill="#f1b65a" />
              <text x="0" y="-118" textAnchor="middle" fontSize="32" fontWeight="900" fill="#1b1408">✏️ 표현을 다듬어 주세요 · 나에게만</text>
            </g>
          </g>
          <g className="rv-pop" style={{ animationDelay: "2.6s" }} transform="translate(1130 680)">
            <rect x="-300" y="-70" width="600" height="140" rx="26" fill="#93b6ea" />
            <text x="-260" y="14" fontSize="38" fontWeight="800" fill="#0b1430">저는 반대해요, 왜냐하면…</text>
            <circle cx="250" cy="-60" r="40" fill="#7fc79c" />
            <text x="250" y="-46" textAnchor="middle" fontSize="44" fontWeight="900" fill="#0b2a1a">✓</text>
          </g>
        </g>
      )}
    </svg>
  );
});

/** The game rules as a short narrated video around the table, like the earlier rule briefing. */
export default function RulesVideo({ onFinish }: { onFinish?: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const player = useScenePlayer({ audioKey: "_rules", scenes: SCENES, onFinish });
  const { scene, line, text, mouth, playing, sound, elapsed, totalSeconds } = player;
  const current = SCENES[scene];

  if (!player.started)
    return (
      <div className="news rules" data-testid="rules-video">
        <button
          className="news-poster rules-poster"
          data-testid="rules-play"
          onClick={() => {
            player.start();
            if (sound) playSting();
          }}
        >
          <span className="play-disc">
            <Play size={30} aria-hidden />
          </span>
          <strong>게임 규칙 영상 보기</strong>
          <span>테이블에서 어떻게 진행되는지 {clock(totalSeconds)} 동안 보여 드려요</span>
        </button>
      </div>
    );

  if (player.ended)
    return (
      <div className="news rules ended" data-testid="rules-video">
        <div className="briefing-end">
          <strong>규칙 영상이 끝났어요.</strong>
          <ol className="rules-list">
            {SCENES.slice(1).map((s) => (
              <li key={s.id}>{s.title.replace(/^\d+\.\s*/, "")}</li>
            ))}
          </ol>
          <button className="button ghost small" onClick={player.restart}>
            <RotateCcw size={15} /> 다시 보기
          </button>
        </div>
      </div>
    );

  return (
    <div className="news rules" data-testid="rules-video" ref={frame}>
      <div className="news-frame rules-frame">
        <div className="news-cut" key={scene}>
          <Diagram id={current.id} />
          <Person mouth={mouth} look={4} className="rules-host" />
          <span className="rules-host-tag">진행자</span>
          <div className="news-bug">
            <span className="news-live">
              <i className="rec" /> 게임 규칙
            </span>
          </div>
          <div className="news-lower rules-lower" key={`l${line}`} aria-live="polite">
            <span className="news-lower-title" data-testid="rules-title">
              {current.title}
            </span>
            <p>{text}</p>
          </div>
        </div>
      </div>
      <PlayerControls player={player} frame={frame} note="게임 규칙 안내" elapsed={elapsed} total={totalSeconds} playing={playing} />
    </div>
  );
}
