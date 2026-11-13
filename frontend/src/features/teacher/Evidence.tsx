import type { TranscriptLine } from "../../types/game";
import { KIND_LABEL, PHASE_SHORT } from "../game/phases";

/** The student's own words behind a call, with the phase they were said in. */
export default function Evidence({ lines, onRemove }: { lines: TranscriptLine[]; onRemove?: (id: string) => void }) {
  return (
    <ul className="evidence">
      {lines.map((l) => (
        <li key={l.id}>
          <span className="evidence-tag">
            {PHASE_SHORT[l.phase]}
            {l.kind !== "statement" && ` · ${KIND_LABEL[l.kind]}`}
          </span>
          <q>{l.text}</q>
          {onRemove && (
            <button className="text-button danger" aria-label="이 근거 빼기" onClick={() => onRemove(l.id)}>
              빼기
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
