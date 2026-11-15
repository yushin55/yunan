import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { Participant, Topic, TranscriptLine } from "../../types/game";
import { KIND_LABEL } from "../game/phases";
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
  questionsNow = false,
}: {
  /** Questions and answers are going on now: their record is the one shown first. */
  questionsNow?: boolean;
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
  // One record at a time: the statements, or every question and answer (after the statements and about the event).
  const [view, setView] = useState<"statement" | "qa">(questionsNow ? "qa" : "statement");
  useEffect(() => setView(questionsNow ? "qa" : "statement"), [questionsNow]);
  // Follow new lines without scrolling the whole page.
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, view]);
  const turns: { key: number; uid: string; phase: TranscriptLine["phase"]; kind: TranscriptLine["kind"]; lines: TranscriptLine[] }[] = [];
  for (const line of lines) {
    const last = turns.at(-1);
    if (last && last.key === line.turn) last.lines.push(line);
    else turns.push({ key: line.turn, uid: line.uid, phase: line.phase, kind: line.kind, lines: [line] });
  }
  const shown = turns.filter((turn) => (view === "statement") === (turn.kind === "statement"));
  return (
    <>
      <div className="segmented transcript-tabs" role="tablist" aria-label="기록 고르기">
        {(["statement", "qa"] as const).map((v) => (
          <button key={v} role="tab" type="button" aria-selected={view === v} className={`button small ${view === v ? "primary" : "ghost"}`} data-testid={`transcript-tab-${v}`} onClick={() => setView(v)}>
            {v === "statement" ? "입장 발표" : "질문"}
          </button>
        ))}
      </div>
      <div className="transcript" ref={feed} role="log" tabIndex={0} aria-label="발언 기록">
        {shown.length === 0 && <p className="muted empty">{turns.length ? "아직 기록이 없어요." : emptyText}</p>}
        {shown.map((turn) => {
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
      </div>
    </>
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
        <textarea
          value={draft}
          autoFocus
          maxLength={LIMIT}
          rows={2}
          aria-label="발언 고치기"
          data-testid="line-edit-text"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter saves, Shift+Enter starts a new line, Esc cancels. Enter that finishes a Korean syllable is left alone.
            if (e.key === "Escape") setDraft(null);
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }}
        />
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
            <button className="icon-button" aria-label="이 발언 고치기" title="고치기" data-testid="line-edit" disabled={disabled} onClick={() => setDraft(line.text)}>
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

/**
 * The teacher writes down what a student said when the microphone missed it (or could not turn it
 * into text): pick the student and what kind of words they were. Starts on whoever is speaking now.
 */
