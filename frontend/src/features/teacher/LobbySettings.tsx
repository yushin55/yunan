import { useState } from "react";
import { Save } from "lucide-react";
import type { GameSettings, TimedPhase } from "../../types/game";
import { PHASE_LABELS } from "../game/phases";

const PHASES: TimedPhase[] = ["role", "statement", "event", "rebuttal", "vote"];

export default function LobbySettings({
  settings,
  range,
  busy,
  onSave,
}: {
  settings: GameSettings;
  range: { min: number; max: number };
  busy: boolean;
  onSave: (settings: GameSettings) => void;
}) {
  const [count, setCount] = useState(settings.switcherCount);
  const [seconds, setSeconds] = useState(settings.phaseSeconds);
  const total = PHASES.reduce((sum, p) => sum + (seconds[p] || 0), 0);
  const changed = count !== settings.switcherCount || PHASES.some((p) => seconds[p] !== settings.phaseSeconds[p]);
  return (
    <div className="lobby-settings">
      <fieldset>
        <legend>역할 전환자 수</legend>
        <div className="segmented">
          {([1, 2] as const).map((n) => (
            <label key={n} className={count === n ? "active" : ""}>
              <input type="radio" name="switchers" checked={count === n} onChange={() => setCount(n)} /> {n}명
            </label>
          ))}
        </div>
        <small className="muted">2명은 최다 선택 1순위 역할을 고른 학생이 2명 이상일 때만 시작할 수 있어요.</small>
      </fieldset>
      <fieldset>
        <legend>단계별 시간(초)</legend>
        <div className="seconds-grid">
          {PHASES.map((p) => (
            <label key={p}>
              <span>{PHASE_LABELS[p]}</span>
              <input
                type="number"
                min={range.min}
                max={range.max}
                step={5}
                value={seconds[p]}
                onChange={(e) => setSeconds({ ...seconds, [p]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <small className="muted">진행 시간 합계 약 {Math.round(total / 60)}분 (대기실·결과 확인 제외)</small>
      </fieldset>
      <button
        className="button secondary"
        disabled={busy || !changed || PHASES.some((p) => !(seconds[p] >= range.min && seconds[p] <= range.max))}
        onClick={() => onSave({ switcherCount: count, phaseSeconds: seconds })}
      >
        <Save size={16} /> 설정 저장
      </button>
    </div>
  );
}
