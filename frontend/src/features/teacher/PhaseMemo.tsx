import { useCallback, useEffect, useState } from "react";
import { NotebookPen, Plus, X } from "lucide-react";
import type { Participant, Phase } from "../../types/game";
import { PHASE_ORDER, PHASE_SHORT } from "../game/phases";
import { loadNotes, saveNotes, type MemoEntry, type PhaseNotes } from "./teacherStorage";

/** Notes per phase for one game, saved in this browser as the teacher adds them. */
export function usePhaseNotes(key: string) {
  const [notes, setNotes] = useState<PhaseNotes>(() => loadNotes(key));
  useEffect(() => setNotes(loadNotes(key)), [key]);
  const update = useCallback(
    (change: (prev: PhaseNotes) => PhaseNotes) =>
      setNotes((prev) => {
        const next = change(prev);
        saveNotes(key, next);
        return next;
      }),
    [key],
  );
  const addNote = useCallback(
    (phase: Phase, uid: string | null, text: string) =>
      update((prev) => ({ ...prev, [phase]: [...(prev[phase] ?? []), { id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, uid, text, at: Date.now() }] })),
    [update],
  );
  const removeNote = useCallback(
    (phase: Phase, id: string) =>
      update((prev) => {
        const list = (prev[phase] ?? []).filter((e) => e.id !== id);
        const next = { ...prev, [phase]: list };
        if (!list.length) delete next[phase];
        return next;
      }),
    [update],
  );
  return { notes, addNote, removeNote };
}

const time = (t: number) => (t ? new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "");

/** The notes themselves: who they are about, what was noticed and when. */
export function MemoList({ entries, participants, phase, onRemove }: { entries: MemoEntry[]; participants: Participant[]; phase?: Phase; onRemove?: (id: string) => void }) {
  const name = (uid: string) => participants.find((p) => p.uid === uid)?.nickname ?? "나간 학생";
  return (
    <ul className="memo-list">
      {entries.map((e) => (
        <li key={e.id} className="memo-entry" data-testid="memo-entry">
          <div className="memo-entry-head">
            {phase && <span className="phase-memo-phase">{PHASE_SHORT[phase]}</span>}
            {e.uid ? <span className="memo-who">{name(e.uid)}</span> : <span className="memo-who general">전체</span>}
            {e.at > 0 && <span className="memo-time">{time(e.at)}</span>}
            {onRemove && (
              <button className="memo-remove" aria-label="메모 지우기" title="지우기" onClick={() => onRemove(e.id)}>
                <X size={13} />
              </button>
            )}
          </div>
          <p>{e.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** A small note pad for the phase on screen: pick a student (or none), write, add. Other phases fold away underneath. */
export default function PhaseMemo({
  phase,
  notes,
  participants,
  onAdd,
  onRemove,
}: {
  phase: Phase;
  notes: PhaseNotes;
  participants: Participant[];
  onAdd: (phase: Phase, uid: string | null, text: string) => void;
  onRemove: (phase: Phase, id: string) => void;
}) {
  const [uid, setUid] = useState("");
  const [text, setText] = useState("");
  const here = notes[phase] ?? [];
  const others = PHASE_ORDER.filter((p) => p !== phase && notes[p]?.length);
  const otherCount = others.reduce((n, p) => n + (notes[p]?.length ?? 0), 0);
  const add = () => {
    if (!text.trim()) return;
    onAdd(phase, uid || null, text.trim());
    setText("");
  };
  return (
    <section className="panel phase-memo" data-testid="phase-memo">
      <div className="phase-memo-head">
        <NotebookPen size={15} aria-hidden />
        <span>메모</span>
        <span className="phase-memo-phase">{PHASE_SHORT[phase]}</span>
        {here.length > 0 && <span className="phase-memo-count">{here.length}개</span>}
      </div>
      {here.length > 0 && <MemoList entries={here} participants={participants} onRemove={(id) => onRemove(phase, id)} />}
      <form
        className="phase-memo-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <select value={uid} onChange={(e) => setUid(e.target.value)} aria-label="메모할 학생" data-testid="memo-student">
          <option value="">선택 없음 (전체)</option>
          {participants.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.nickname}
            </option>
          ))}
        </select>
        <textarea
          id="phase-memo-text"
          rows={2}
          maxLength={1000}
          value={text}
          placeholder={`${uid ? `${participants.find((p) => p.uid === uid)?.nickname}에 대해 ` : ""}${PHASE_SHORT[phase]} 단계에서 눈여겨본 점을 적어 두세요. 이 기기에만 저장돼요.`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button className="button secondary small" type="submit" data-testid="memo-add" disabled={!text.trim()}>
          <Plus size={15} /> 메모 남기기
        </button>
      </form>
      {others.length > 0 && (
        <details className="phase-memo-others">
          <summary>다른 단계 메모 {otherCount}개</summary>
          {others.map((p) => (
            <MemoList key={p} entries={notes[p]!} participants={participants} phase={p} />
          ))}
        </details>
      )}
    </section>
  );
}
