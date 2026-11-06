import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { Participant, Topic, TranscriptLine } from "../../types/game";
import { KIND_LABEL, PHASE_SHORT, SPEAKING } from "../game/phases";
import { roleName } from "../roles/roleName";

const LIMIT = 400;

/**
 * What was said, one block per turn, under its phase: side by side when there is room, stacked when
 * not. The teacher can correct what speech recognition got wrong.
 */
export default function TranscriptFeed({
  lines,
  participants,
  topic,
  myUid,
  speakingUid,
  emptyText = "아직 기록된 발언이 없어요.",
  disabled,
  onEdit,
  onDelete,
}: {
  lines: TranscriptLine[];
  participants: Participant[];
  topic: Topic;
  myUid?: string;
  /** Who has the floor now: their turn stands out while it is the newest one in the record. */
  speakingUid?: string;
  emptyText?: string;
  disabled?: boolean;
  onEdit?: (lineId: string, text: string) => void;
  onDelete?: (lineId: string) => void;
}) {
  const feed = useRef<HTMLDivElement>(null);
  // Follow new lines without scrolling the whole page, and leave the other phases where they are.
  const newestPhase = lines.at(-1)?.phase;
  useEffect(() => {
    const el = feed.current;
    const column = el?.querySelector(`[data-phase="${newestPhase}"]`);
    for (const box of [el, column]) box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [lines.length, newestPhase]);
  const turns: { key: number; uid: string; phase: TranscriptLine["phase"]; kind: TranscriptLine["kind"]; lines: TranscriptLine[] }[] = [];
  for (const line of lines) {
    const last = turns.at(-1);
    if (last && last.key === line.turn) last.lines.push(line);
    else turns.push({ key: line.turn, uid: line.uid, phase: line.phase, kind: line.kind, lines: [line] });
  }
  return (
    <div className="transcript" ref={feed} role="log" tabIndex={0} aria-label="발언 기록">
      {turns.length === 0 && <p className="muted empty">{emptyText}</p>}
      {turns.length > 0 && (
        <div className="transcript-columns">
          {SPEAKING.map((phase) => {
            const said = turns.filter((turn) => turn.phase === phase);
            return (
              <section key={phase} className={`transcript-column${said.length ? "" : " vacant"}`} data-phase={phase}>
                <h4 className="transcript-phase">{PHASE_SHORT[phase]}</h4>
                {!said.length && <p className="muted small">아직 발언이 없어요.</p>}
                {said.map((turn) => {
                  const speaker = participants.find((p) => p.uid === turn.uid);
                  const live = turn === turns.at(-1) && turn.uid === speakingUid;
                  return (
                    <article key={turn.key} className={`transcript-turn${turn.uid === myUid ? " mine" : ""}${live ? " live" : ""}`} data-testid="transcript-turn">
                      <header>
                        <strong>{turn.uid === myUid ? "나" : (speaker?.nickname ?? "나간 참가자")}</strong>
                        {turn.kind !== "statement" && <span className="turn-kind">{KIND_LABEL[turn.kind]}</span>}
                        {speaker?.roleId && <span className="turn-role">{roleName(topic, speaker.roleId)}</span>}
                        {live && <span className="turn-live">말하는 중</span>}
                      </header>
                      {turn.lines.map((line) => (
                        <Line key={line.id} line={line} disabled={disabled} onEdit={onEdit} onDelete={onDelete} />
                      ))}
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Line({ line, disabled, onEdit, onDelete }: { line: TranscriptLine; disabled?: boolean; onEdit?: (lineId: string, text: string) => void; onDelete?: (lineId: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null)
    return (
      <form
        className="line-edit"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onEdit?.(line.id, draft.trim());
          setDraft(null);
        }}
      >
        <textarea value={draft} autoFocus maxLength={LIMIT} rows={2} aria-label="발언 고치기" onChange={(e) => setDraft(e.target.value)} />
        <button className="icon-button" type="submit" aria-label="고친 내용 저장" title="저장" disabled={!draft.trim()}>
          <Check size={16} />
        </button>
        <button className="icon-button" type="button" aria-label="고치기 취소" title="취소" onClick={() => setDraft(null)}>
          <X size={16} />
        </button>
      </form>
    );
  return (
    <div className="transcript-line" data-testid="transcript-line">
      <p>
        {line.text}
        {onEdit && onDelete && (
          <span className="line-tools">
            <button className="icon-button" aria-label="이 발언 고치기" title="고치기" disabled={disabled} onClick={() => setDraft(line.text)}>
              <Pencil size={14} />
            </button>
            <button className="icon-button" aria-label="이 발언 지우기" title="지우기" disabled={disabled} onClick={() => onDelete(line.id)}>
              <Trash2 size={14} />
            </button>
          </span>
        )}
      </p>
    </div>
  );
}

/** For when the microphone missed something: the line is recorded for the current speaker. */
export function LineInput({ speaker, disabled, onAdd }: { speaker: string; disabled?: boolean; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="line-input"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text.trim());
        setText("");
      }}
    >
      <input value={text} maxLength={LIMIT} disabled={disabled} data-testid="line-input" aria-label={`${speaker}의 발언 직접 입력`} placeholder={`${speaker}의 발언을 직접 입력`} onChange={(e) => setText(e.target.value)} />
      <button className="button secondary small" type="submit" data-testid="line-add" disabled={disabled || !text.trim()}>
        기록
      </button>
    </form>
  );
}
