import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import briefing from "../../data/briefing.json";
import type { useGameAudio } from "../../hooks/useGameAudio";
import { PLAYER_COLORS } from "../../types/game";
import { Volume2, VolumeX, X } from "../common/Icon";
import "./RuleBriefing.css";

type Audio = ReturnType<typeof useGameAudio>;
type Step = (typeof briefing)[number];

export const BRIEFING_SEEN_KEY = "yunan:briefing-seen";
const STEPS = briefing as Step[];

// Six seats around an oval table, "나" at the near edge; seats 2 and 5 play the switchers.
const SEATS = [
  { name: "나", x: 240, y: 277 },
  { name: "모카", x: 84, y: 221 },
  { name: "올리브", x: 84, y: 109 },
  { name: "루카", x: 240, y: 53 },
  { name: "니나", x: 396, y: 109 },
  { name: "초록", x: 396, y: 221 },
];
const SWITCHERS = [2, 5];
const SCORE_ITEMS: [string, number][] = [
  ["입장 선언", 10], ["사건 대응", 10], ["교차 질문", 10], ["관점 카드 연결", 15],
  ["이유 있는 추리", 10], ["역할 대변 평가", 25], ["내 진짜 목소리", 15], ["들키지 않은 연기", 5],
];

/** Playback length of a step: the clip is slowed by the host-voice detune, plus the start chirp. */
function stepMs(step: Step) {
  return Math.round(step.seconds * 1041 + 200);
}

export function briefingSeen() {
  try { return window.localStorage.getItem(BRIEFING_SEEN_KEY) === "1"; } catch { return false; }
}

/**
 * Pre-game rules briefing in the style of a game-show rule explanation: a narrated,
 * auto-advancing sequence of chapters, each with a small simulation of the table.
 */
export default function RuleBriefing({ audio, autoStart, onClose }: { audio: Audio; autoStart: boolean; onClose: () => void }) {
  const [started, setStarted] = useState(autoStart);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [take, setTake] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const close = useCallback(() => {
    audio.stop();
    try { window.localStorage.setItem(BRIEFING_SEEN_KEY, "1"); } catch { /* Storage can be disabled. */ }
    onClose();
  }, [audio.stop, onClose]);

  const go = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(STEPS.length - 1, next)));
    setPaused(false);
    setTake((v) => v + 1);
  }, []);

  useEffect(() => { closeRef.current?.focus(); }, [started]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (!started) return;
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
      if (event.key === " ") { event.preventDefault(); setPaused((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go, index, started]);

  useEffect(() => {
    if (!started || paused) return;
    const timers: number[] = [];
    let finished = false;
    const advance = () => {
      if (finished) return;
      finished = true;
      if (last) timers.push(window.setTimeout(close, 900));
      else go(index + 1);
    };
    const expected = stepMs(step);
    if (index > 0) audio.playCue("transition");
    timers.push(window.setTimeout(() => {
      const speaking = audio.narrate(step.voice, { onEnd: () => timers.push(window.setTimeout(advance, 850)) });
      // Without sound the chapter holds for a reading pace; with sound this is only a safety net.
      timers.push(window.setTimeout(advance, speaking ? expected * 1.8 + 4000 : expected + 900));
    }, index === 0 ? 250 : 520));
    const upcoming = STEPS[index + 1];
    if (upcoming) audio.preloadNarration(upcoming.voice);
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [started, paused, index, take]);

  useEffect(() => { if (paused) audio.stop(); }, [paused, audio.stop]);

  const begin = () => {
    audio.unlock();
    if (!audio.enabled) audio.toggle();
    setStarted(true);
    setTake((v) => v + 1);
  };

  return (
    <div className="briefing" role="dialog" aria-modal="true" aria-label="게임 설명" data-testid="rule-briefing">
      <div className="briefing__grid" aria-hidden="true" />
      <header className="briefing__top">
        <span className="briefing__brand">GAME RULE</span>
        {started && <span className="briefing__counter" data-testid="briefing-counter">RULE {String(index + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}</span>}
        <button ref={closeRef} type="button" className="briefing__skip" onClick={close}>설명 건너뛰기 <X size={14} /></button>
      </header>

      {!started ? (
        <section className="briefing__gate">
          <span className="briefing__eyebrow">THE OTHER SIDE · 4–6 PLAYERS</span>
          <h1>반대편의 변호인</h1>
          <p>게임을 시작하기 전에, 진행자가 규칙을 설명합니다.<br />약 2분 · 언제든 건너뛸 수 있어요.</p>
          <button type="button" className="briefing__start" onClick={begin}>게임 설명 듣기 <span aria-hidden="true">▶</span></button>
        </section>
      ) : (
        <>
          <div className="briefing__progress" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.id} className={i < index ? "is-done" : i === index ? "is-now" : ""}>
                {i === index && <i key={take} style={{ animationDuration: `${stepMs(s) + 900}ms`, animationPlayState: paused ? "paused" : "running" } as CSSProperties} />}
              </span>
            ))}
          </div>
          <h2 className="briefing__title" key={`title-${index}`}>{step.title}</h2>
          <div className={`briefing__stage briefing-sim--${step.scene}${paused ? " is-paused" : ""}`} key={`${index}-${take}`} data-scene={step.scene}>
            <Simulation scene={step.scene} />
          </div>
          <p className="briefing__caption" aria-live="polite" key={`cap-${index}`}>{step.voice}</p>
          <nav className="briefing__controls" aria-label="설명 조작">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="이전 설명">‹</button>
            <button type="button" className="briefing__play" onClick={() => { setPaused((v) => !v); if (paused) setTake((v) => v + 1); }} aria-label={paused ? "설명 계속 듣기" : "설명 일시정지"}>{paused ? "▶" : "❚❚"}</button>
            {last
              ? <button type="button" className="briefing__done" onClick={close}>테이블로 돌아가기</button>
              : <button type="button" onClick={() => go(index + 1)} aria-label="다음 설명">›</button>}
            <button type="button" className="briefing__sound" onClick={() => { audio.toggle(); setTake((v) => v + 1); }} aria-label={audio.enabled ? "설명 음성 끄기" : "설명 음성 켜기"} aria-pressed={audio.enabled}>
              {audio.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </nav>
        </>
      )}
    </div>
  );
}

function Seat({ index, tag }: { index: number; tag?: string }) {
  const seat = SEATS[index];
  const switcher = SWITCHERS.includes(index);
  return (
    <g className={"sim-seat" + (switcher ? " is-switcher" : "") + (index === 0 ? " is-me" : "")} style={{ "--i": index, "--seat": PLAYER_COLORS[index] } as CSSProperties}
      transform={`translate(${seat.x} ${seat.y})`} data-seat={index}>
      <g className="sim-seat__pop">
        <circle className="sim-seat__ring" r="27" />
        <circle className="sim-seat__body" r="19" />
        <text className="sim-seat__initial" y="6">{seat.name.slice(0, 1)}</text>
        <text className="sim-seat__name" y={index === 3 ? -35 : 45}>{seat.name}</text>
      </g>
      {tag && <text className="sim-seat__tag" y={index === 0 ? 63 : index === 3 ? -52 : -34}>{tag}</text>}
    </g>
  );
}

function Simulation({ scene }: { scene: string }) {
  if (scene === "intro" || scene === "outro") {
    return (
      <div className="sim-title">
        {scene === "intro" ? <>
          <span>유난</span>
          <strong>반대편의 변호인</strong>
          <small>4–6 PLAYERS · 9 ROUNDS · 100 POINTS</small>
        </> : <>
          <strong>반대편을 이기지 마라.</strong>
          <strong className="sim-title__second">반대편이 되어 살아남아라.</strong>
          <small>GAME START</small>
        </>}
      </div>
    );
  }
  if (scene === "score") {
    return (
      <div className="sim-score">
        <ol>
          {SCORE_ITEMS.map(([label, points], i) => (
            <li key={label} style={{ "--i": i } as CSSProperties}><span>{label}</span><strong>{points}</strong></li>
          ))}
        </ol>
        <div className="sim-score__total"><strong>100</strong><span>POINTS</span></div>
        <p className="sim-score__note">의견이 바뀌었는지는 점수에 들어가지 않습니다</p>
      </div>
    );
  }
  const tag = (i: number) => {
    if (scene === "reveal") return SWITCHERS.includes(i) ? "전환자" : "선호 역할";
    return undefined;
  };
  return (
    <svg className="sim-table" viewBox="0 -10 480 340" role="img" aria-label="테이블 시뮬레이션">
      <defs>
        <radialGradient id="sim-felt" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#2f5a45" />
          <stop offset="100%" stopColor="#15291f" />
        </radialGradient>
        <marker id="sim-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="#f0c987" />
        </marker>
      </defs>
      <ellipse className="sim-table__rim" cx="240" cy="165" rx="120" ry="74" />
      <ellipse className="sim-table__felt" cx="240" cy="165" rx="108" ry="64" fill="url(#sim-felt)" />

      {scene === "table" && <g className="sim-topic">
        <rect x="192" y="137" width="96" height="56" rx="4" />
        <text x="240" y="160">오늘의 안건</text>
        <text className="sim-topic__small" x="240" y="178">무작위 선정</text>
      </g>}

      {scene === "initial" && <text className="sim-center-note" x="240" y="170">비공개 제출</text>}
      {scene === "role" && <text className="sim-center-note sim-center-note--late" x="240" y="170">전환자 2명</text>}
      {scene === "question" && <>
        <path className="sim-arrow sim-arrow--ask" d="M226 250 C 170 210, 120 160, 102 128" markerEnd="url(#sim-arrow)" />
        <path className="sim-arrow sim-arrow--answer" d="M112 116 C 150 150, 200 200, 240 246" markerEnd="url(#sim-arrow)" />
        <g className="sim-bubble sim-bubble--q" transform="translate(150 175)"><rect x="-44" y="-15" width="88" height="28" rx="14" /><text y="4">질문</text></g>
        <g className="sim-bubble sim-bubble--a" transform="translate(205 140)"><rect x="-38" y="-15" width="76" height="28" rx="14" /><text y="4">답변</text></g>
      </>}

      {SEATS.map((_, i) => <Seat key={i} index={i} tag={tag(i)} />)}

      {scene === "initial" && SEATS.map((seat, i) => (
        <g key={i} className="sim-secret" style={{ "--i": i } as CSSProperties} transform={`translate(${seat.x + (seat.x < 240 ? 38 : seat.x > 240 ? -38 : 34)} ${seat.y + (i === 3 ? 6 : -6)})`}>
          <rect x="-11" y="-15" width="22" height="30" rx="3" />
          <path d="M-4 -1v-3a4 4 0 0 1 8 0v3M-6 -1h12v8h-12z" />
        </g>
      ))}

      {scene === "role" && SEATS.map((seat, i) => (
        <g key={i} className={"sim-deal" + (SWITCHERS.includes(i) ? " is-switcher" : "")} style={{ "--i": i, "--dx": `${240 - seat.x}px`, "--dy": `${165 - seat.y}px` } as CSSProperties}
          transform={`translate(${seat.x + (seat.x < 240 ? 38 : seat.x > 240 ? -38 : 34)} ${seat.y + (i === 3 ? 6 : -6)})`}>
          <rect x="-11" y="-15" width="22" height="30" rx="3" />
        </g>
      ))}
      {scene === "role" && SWITCHERS.map((i) => (
        <g key={i} className="sim-switch-tag" transform={`translate(${SEATS[i].x} ${SEATS[i].y - 35})`}>
          <text className="sim-switch-tag__real">전환자</text>
          <text className="sim-switch-tag__hidden">?</text>
        </g>
      ))}

      {scene === "claim" && SEATS.map((seat, i) => i === 0 ? null : (
        <g key={i} className="sim-bubble sim-bubble--claim" style={{ "--i": i } as CSSProperties} transform={`translate(${seat.x + (seat.x < 240 ? 52 : seat.x > 240 ? -52 : 0)} ${seat.y + (i === 3 ? 44 : -2)})`}>
          <rect x="-30" y="-13" width="60" height="24" rx="12" />
          <text y="4">{i === 2 || i === 5 ? "변호 중" : "입장"}</text>
        </g>
      ))}
      {scene === "claim" && <g className="sim-evidence" transform="translate(240 168)">
        <rect x="-34" y="-22" width="68" height="44" rx="4" />
        <text y="-2">관점 카드</text>
        <text className="sim-topic__small" y="13">근거</text>
      </g>}
      {scene === "claim" && [[3, "💡"], [1, "👍"], [4, "❓"], [5, "✋"]].map(([seat, icon], n) => (
        <text key={seat} className="sim-react" style={{ "--i": n } as CSSProperties}
          x={SEATS[seat as number].x + (SEATS[seat as number].x < 240 ? -30 : SEATS[seat as number].x > 240 ? 30 : 34)} y={SEATS[seat as number].y - 18}>{icon}</text>
      ))}

      {scene === "guess" && <g className="sim-reticle">
        <circle r="32" />
        <path d="M-44 0h16M28 0h16M0 -44v16M0 28v16" />
        <text className="sim-reticle__label" y="-50">지목</text>
      </g>}

      {scene === "reveal" && [1, 2, 4, 5].map((i, n) => (
        <g key={i} className="sim-stars" style={{ "--i": n } as CSSProperties} transform={`translate(${SEATS[i].x} ${SEATS[i].y + 60})`}>
          {[0, 1, 2, 3, 4].map((k) => <text key={k} x={(k - 2) * 12} className={k < (i === 2 ? 5 : i === 5 ? 4 : 3) ? "is-on" : ""}>★</text>)}
        </g>
      ))}
    </svg>
  );
}
