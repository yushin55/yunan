import { useCallback, useEffect, useRef, useState } from "react";
import { Check, NotebookPen } from "lucide-react";
import type { Phase } from "../../types/game";
import { PHASE_ORDER, PHASE_SHORT } from "../game/phases";
import { loadNotes, saveNotes, type PhaseNotes } from "./teacherStorage";

/** Notes per phase for one game, saved in this browser as the teacher types. */
export function usePhaseNotes(key: string) {
  const [notes, setNotes] = useState<PhaseNotes>(() => loadNotes(key));
  useEffect(() => setNotes(loadNotes(key)), [key]);
  const setNote = useCallback(
    (phase: Phase, text: string) =>
      setNotes((prev) => {
        const next = { ...prev, [phase]: text };
        if (!text.trim()) delete next[phase];
        saveNotes(key, next);
        return next;
      }),
    [key],
  );
  return { notes, setNote };
}

/** A small note pad for the phase on screen; other phases' notes fold away underneath. */
export default function PhaseMemo({ phase, notes, onChange }: { phase: Phase; notes: PhaseNotes; onChange: (phase: Phase, text: string) => void }) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const others = PHASE_ORDER.filter((p) => p !== phase && notes[p]);
  return (
    <section className="panel phase-memo" data-testid="phase-memo">
      <label className="phase-memo-head" htmlFor="phase-memo-text">
        <NotebookPen size={15} aria-hidden />
        <span>메모</span>
        <span className="phase-memo-phase">{PHASE_SHORT[phase]}</span>
        <span className={`phase-memo-saved${saved ? " show" : ""}`} aria-live="polite">
          {saved && (
            <>
              <Check size={13} aria-hidden /> 저장됨
            </>
          )}
        </span>
      </label>
      <textarea
        id="phase-memo-text"
        rows={2}
        maxLength={1000}
        value={notes[phase] ?? ""}
        placeholder={`${PHASE_SHORT[phase]} 단계에서 눈여겨본 점을 적어 두세요. 이 기기에만 저장돼요.`}
        onChange={(e) => {
          onChange(phase, e.target.value);
          setSaved(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setSaved(false), 1200);
        }}
      />
      {others.length > 0 && (
        <details className="phase-memo-others">
          <summary>다른 단계 메모 {others.length}개</summary>
          <ul>
            {others.map((p) => (
              <li key={p}>
                <span className="phase-memo-phase">{PHASE_SHORT[p]}</span>
                <p>{notes[p]}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
