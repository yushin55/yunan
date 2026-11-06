import { useState } from "react";
import { Save } from "lucide-react";
import type { GameSettings, TimedPhase } from "../../types/game";
import { PHASE_LABELS } from "../game/phases";

const PHASES: TimedPhase[] = ["role", "statement", "event", "rebuttal", "vote"];
const PER_STUDENT: TimedPhase[] = ["statement"];
const MIC_RANGE = { min: 10, max: 120 };

export default function LobbySettings({
  settings,
  students,
  range,
  busy,
  onSave,
}: {
  settings: GameSettings;
  /** How many students give a statement. */
  students: number;
  range: { min: number; max: number };
  busy: boolean;
  onSave: (settings: GameSettings) => void;
}) {
  const [count, setCount] = useState(settings.switcherCount);
  const [seconds, setSeconds] = useState(settings.phaseSeconds);
  const [micSeconds, setMicSeconds] = useState(settings.micSeconds);
  const total = PHASES.reduce((sum, p) => sum + (seconds[p] || 0) * (PER_STUDENT.includes(p) ? students : 1), 0);
  const changed = count !== settings.switcherCount || micSeconds !== settings.micSeconds || PHASES.some((p) => seconds[p] !== settings.phaseSeconds[p]);
  const micOk = micSeconds >= MIC_RANGE.min && micSeconds <= MIC_RANGE.max;
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
        <legend>시간(초)</legend>
        <div className="seconds-grid">
          {PHASES.map((p) => (
            <label key={p}>
              <span>{PHASE_LABELS[p]}{PER_STUDENT.includes(p) && " (1명당)"}</span>
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
          <label>
            <span>질문·답변·반론 (1번 말할 때)</span>
            <input type="number" min={MIC_RANGE.min} max={MIC_RANGE.max} step={5} value={micSeconds} onChange={(e) => setMicSeconds(Number(e.target.value))} />
          </label>
        </div>
        <small className="muted">학생 {students}명 기준 진행 시간 합계 약 {Math.round(total / 60)}분 (대기실·결과 확인 제외). 입장 발표는 1명당 시간이 끝나면 다음 학생으로 넘어가요. 사건·반론 단계는 단계 전체 시간 안에서 누구나 마이크를 켜고, 한 번 켜면 정해진 시간까지 말할 수 있어요.</small>
      </fieldset>
      <button
        className="button secondary"
        disabled={busy || !changed || !micOk || PHASES.some((p) => !(seconds[p] >= range.min && seconds[p] <= range.max))}
        onClick={() => onSave({ switcherCount: count, phaseSeconds: seconds, micSeconds })}
      >
        <Save size={16} /> 설정 저장
      </button>
    </div>
  );
}
