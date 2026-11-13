import { useEffect, useMemo, useRef, useState } from "react";
import Tabs from "../../components/Tabs";
import type { ModerationEntry, Participant, Phase, Topic, TranscriptLine } from "../../types/game";
import TranscriptFeed from "../discussion/TranscriptFeed";
import { KIND_LABEL, PHASE_ORDER, PHASE_SHORT } from "../game/phases";
import { roleName } from "../roles/roleName";
import { applyEdits, buildReport, CRITERIA, GROUPS, LEVEL_LABEL, MAX_SCORE, type ClassReport, type CriterionId, type Level, type ReportEdits, type StudentReport } from "./report";
import AiStudentReport from "./AiStudentReport";
import Evidence from "./Evidence";
import { MemoList } from "./PhaseMemo";
import { countNotes, loadEdits, saveEdits, type MemoEntry, type PhaseNotes } from "./teacherStorage";

const LEVELS: Level[] = ["met", "partial", "weak", "none"];
/** What a rubric cell says: a word, so the table reads without a legend. */
const LEVEL_SHORT: Record<Level, string> = { met: "충족", partial: "부분", weak: "보완", none: "–" };

/** A correction to one student's rubric: a level, a comment or the record draft. `null` puts the automatic value back. */
type Change = { uid: string } & ({ criterion: CriterionId; level?: Level | null; comment?: string } | { record: string | null });

type Tab = "rubric" | "students" | "log" | "notes";

const fmtDate = (t: number) => new Date(t).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

/**
 * The teacher's report at the end of a game: the 토론·발표 수행평가 rubric read against the transcript,
 * with the lines behind each call one click away, plus the full record and the phase notes.
 */
export default function TeacherReport({
  topic,
  participants,
  transcript,
  moderation = [],
  notes = {},
  at,
  editKey,
  roomId,
  fill = false,
}: {
  topic: Topic;
  participants: Participant[];
  transcript: TranscriptLine[];
  moderation?: ModerationEntry[];
  notes?: PhaseNotes;
  at?: number;
  /** The game's key: when given, the rubric can be corrected and the corrections are kept for that game. */
  editKey?: string;
  /** A real room: the per-student reports can be drafted by the server's AI. */
  roomId?: string;
  /** Fill the space it is given, scrolling inside, instead of growing with its content. */
  fill?: boolean;
}) {
  const [edits, setEdits] = useState<ReportEdits>(() => (editKey ? loadEdits(editKey) : {}));
  useEffect(() => setEdits(editKey ? loadEdits(editKey) : {}), [editKey]);
  const [editing, setEditing] = useState(false);
  const auto = useMemo(() => buildReport(topic, participants, transcript, moderation), [topic, participants, transcript, moderation]);
  const report = useMemo(() => applyEdits(auto, edits), [auto, edits]);
  const editedCount = report.students.reduce((n, st) => n + CRITERIA.filter((c) => st.findings[c.id].autoLevel).length + (st.autoRecordDraft !== undefined ? 1 : 0), 0);
  const change = (c: Change) => {
    if (!editKey) return;
    setEdits((prev) => {
      const cur = { ...prev[c.uid] };
      if ("record" in c) {
        if (c.record === null) delete cur.record;
        else cur.record = c.record;
      } else {
        if (c.level !== undefined) {
          const levels = { ...cur.levels };
          const autoLevel = auto.students.find((st) => st.uid === c.uid)?.findings[c.criterion].level;
          if (c.level === null || c.level === autoLevel) delete levels[c.criterion];
          else levels[c.criterion] = c.level;
          cur.levels = levels;
        }
        if (c.comment !== undefined) {
          const comments = { ...cur.comments };
          if (c.comment.trim()) comments[c.criterion] = c.comment;
          else delete comments[c.criterion];
          cur.comments = comments;
        }
      }
      const next = { ...prev, [c.uid]: cur };
      saveEdits(editKey, next);
      return next;
    });
  };
  const [tab, setTab] = useState<Tab>("rubric");
  const [selected, setSelected] = useState<{ uid: string; criterion?: CriterionId } | null>(null);
  const noteCount = countNotes(notes);
  const memosOf = (uid: string) => PHASE_ORDER.flatMap((p) => (notes[p] ?? []).filter((e) => e.uid === uid).map((e) => ({ phase: p, entry: e })));
  const student = report.students.find((s) => s.uid === selected?.uid);

  return (
    <section className={`panel teacher-report${fill ? " fill" : ""}`} data-testid="teacher-report">
      <header className="report-head">
        <span className="eyebrow">선생님 레포트</span>
        <h3>토론·발표 수행평가</h3>
        <p className="report-meta">
          {at ? `${fmtDate(at)} · ` : ""}참여 {participants.length}명 · 발언 {report.totalLines}개 · 단원 마무리 주간 · 반영 예시 10~20%
        </p>
      </header>

      <Tabs<Tab>
        label="레포트 보기"
        variant="line"
        active={tab}
        onChange={setTab}
        items={[
          { id: "rubric", label: "평가 기준표" },
          { id: "students", label: "학생별 리포트" },
          { id: "log", label: "전체 발언 기록" },
          { id: "notes", label: `단계별 메모${noteCount ? ` ${noteCount}` : ""}` },
        ]}
      />

      {tab === "rubric" && (
        <div className="report-body">
          <Highlights report={report} topic={topic} onPick={(uid) => setSelected({ uid })} />

          <div className="rubric-toolbar">
            <p className="small">
              {editing
                ? "칸이나 학생 이름을 눌러 판정을 고치고 의견을 남겨 주세요. 고친 내용은 이 기기에 바로 저장돼요."
                : `칸을 누르면 그렇게 판단한 이유와 근거 발언이 아래에 열려요.${editedCount ? ` 선생님이 고친 항목 ${editedCount}개가 반영돼 있어요.` : ""}`}
            </p>
            {editKey && (
              <button className={`button small ${editing ? "primary" : "ghost"}`} data-testid="rubric-edit-toggle" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
                {editing ? "수정 마치기" : "판정 고치기"}
              </button>
            )}
          </div>

          <RubricMatrix
            report={report}
            topic={topic}
            selected={selected}
            onSelect={(uid, criterion) => setSelected((cur) => (cur?.uid === uid && cur.criterion === criterion ? null : { uid, criterion }))}
          />
          <p className="rubric-legend small muted">
            충족 2점 · 부분 충족 1점 · 보완 필요 0점 · – 기록된 발언 없음 · <span className="edited-mark">*</span> 선생님이 고친 칸
          </p>

          {student && (
            <StudentDetail
              key={`${student.uid}-${selected?.criterion}`}
              student={student}
              topic={topic}
              focus={selected?.criterion}
              onChange={editing ? change : undefined}
              onClose={() => setSelected(null)}
              memos={memosOf(student.uid)}
              participants={participants}
            />
          )}
          <p className="report-note">발언 기록에서 표현을 찾아 자동으로 고른 참고 자료예요. 점수로 바로 쓰지 말고, 근거 발언과 수업 중 관찰을 함께 보고 판단해 주세요.</p>
        </div>
      )}

      {tab === "students" && (
        <div className="report-body">
          <AiStudentReport storageKey={editKey} roomId={roomId} topic={topic} participants={participants} transcript={transcript} moderation={moderation} />
        </div>
      )}

      {tab === "log" && (
        <div className="report-body">
          <FullLog topic={topic} participants={participants} transcript={transcript} />
        </div>
      )}

      {tab === "notes" && (
        <div className="report-body">
          <NotesTab notes={notes} participants={participants} />
        </div>
      )}
    </section>
  );
}

/** Three plain sentences before the table: what the class did well, what to practise, who to look at. */
function Highlights({ report, topic, onPick }: { report: ClassReport; topic: Topic; onPick: (uid: string) => void }) {
  const total = report.students.length;
  if (!total) return null;
  const strong = CRITERIA.filter((c) => report.coverage[c.id].met * 2 >= total).sort((a, b) => report.coverage[b.id].met - report.coverage[a.id].met);
  const weakest = Math.min(...CRITERIA.map((c) => report.coverage[c.id].met));
  const weak = CRITERIA.filter((c) => report.coverage[c.id].met === weakest && report.coverage[c.id].met * 2 < total);
  const watch = [...report.students].filter((s) => !s.lines.length || s.score <= MAX_SCORE / 3).sort((a, b) => a.score - b.score);
  const best = [...report.students].sort((a, b) => b.score - a.score)[0];
  return (
    <dl className="report-highlights">
      <div>
        <dt>반 전체가 잘한 항목</dt>
        <dd>{strong.length ? strong.map((c) => `${c.label} ${report.coverage[c.id].met}/${total}명`).join(", ") : "절반 이상이 충족한 항목은 아직 없어요."}</dd>
      </div>
      <div>
        <dt>함께 더 연습할 항목</dt>
        <dd>{weak.length ? `${weak.map((c) => c.label).join(", ")} (충족 ${weakest}/${total}명)` : "모든 항목을 절반 이상이 충족했어요."}</dd>
      </div>
      <div>
        <dt>더 살펴볼 학생</dt>
        <dd>
          {watch.length
            ? watch.map((s, i) => (
                <span key={s.uid}>
                  {i > 0 && ", "}
                  <button className="text-button" onClick={() => onPick(s.uid)}>
                    {s.nickname}
                  </button>{" "}
                  <span className="muted">{s.lines.length ? `${s.score}/${MAX_SCORE}점` : "발언 없음"}</span>
                </span>
              ))
            : "점수가 낮은 학생 없이 고르게 참여했어요."}
          {best && best.score > 0 && (
            <span className="muted">
              {" "}
              · 가장 높은 점수{" "}
              <button className="text-button" onClick={() => onPick(best.uid)}>
                {best.nickname}
              </button>{" "}
              {best.score}/{MAX_SCORE}점{best.roleId ? ` (${roleName(topic, best.roleId)})` : ""}
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function RubricMatrix({
  report,
  topic,
  selected,
  onSelect,
}: {
  report: ClassReport;
  topic: Topic;
  selected: { uid: string; criterion?: CriterionId } | null;
  onSelect: (uid: string, criterion?: CriterionId) => void;
}) {
  const students = report.students;
  return (
    <div className="rubric-scroll">
      <table className="rubric-matrix">
        <thead>
          <tr className="group-row">
            <th scope="col" rowSpan={2} className="name-col">
              학생
            </th>
            <th scope="col" rowSpan={2} className="score-col">
              점수
            </th>
            {GROUPS.map((g) => (
              <th key={g.id} scope="colgroup" colSpan={CRITERIA.filter((c) => c.group === g.id).length} className="group-head">
                {g.label}
              </th>
            ))}
          </tr>
          <tr className="criteria-row">
            {CRITERIA.map((c) => (
              <th key={c.id} scope="col" title={`${c.label}: ${c.looksFor}`} className={c.id === "attitude" || c.id === "counter" ? "group-end" : ""}>
                {c.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.uid} className={selected?.uid === s.uid ? "selected" : ""} data-testid="rubric-row">
              <th scope="row" className="name-col">
                <button className="rubric-name" onClick={() => onSelect(s.uid)} aria-expanded={selected?.uid === s.uid}>
                  <strong>{s.nickname}</strong>
                  {s.roleId && <span>{roleName(topic, s.roleId)}</span>}
                </button>
              </th>
              <td className="score-col">
                <span className="score">
                  <strong>{s.score}</strong>
                  <span className="muted">/{MAX_SCORE}</span>
                </span>
                <span className="score-bar" aria-hidden>
                  <i style={{ width: `${(s.score / MAX_SCORE) * 100}%` }} />
                </span>
              </td>
              {CRITERIA.map((c) => {
                const f = s.findings[c.id];
                const active = selected?.uid === s.uid && selected.criterion === c.id;
                return (
                  <td key={c.id} className={c.id === "attitude" || c.id === "counter" ? "group-end" : ""}>
                    <button
                      className={`lv-cell ${f.level}${active ? " active" : ""}`}
                      onClick={() => onSelect(s.uid, c.id)}
                      aria-label={`${s.nickname} ${c.label}: ${LEVEL_LABEL[f.level]}`}
                      title={`${c.label} · ${LEVEL_LABEL[f.level]}${f.autoLevel ? ` (선생님 수정 · 자동 판정 ${LEVEL_LABEL[f.autoLevel]})` : ""}`}
                    >
                      {LEVEL_SHORT[f.level]}
                      {f.autoLevel && <span className="edited-mark">*</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="name-col">
              충족한 학생
            </th>
            <td className="score-col" />
            {CRITERIA.map((c) => (
              <td key={c.id} className={c.id === "attitude" || c.id === "counter" ? "group-end" : ""}>
                {report.coverage[c.id].met}/{report.coverage[c.id].total}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StudentDetail({
  student,
  topic,
  focus,
  onChange,
  onClose,
  memos = [],
  participants = [],
}: {
  student: StudentReport;
  topic: Topic;
  focus?: CriterionId;
  onChange?: (c: Change) => void;
  onClose: () => void;
  memos?: { phase: Phase; entry: MemoEntry }[];
  participants?: Participant[];
}) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // Opened from the table: bring it into view without jumping past it.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  const role = roleName(topic, student.roleId);
  return (
    <article className="student-detail" data-testid="student-detail" ref={ref}>
      <header>
        <div>
          <h4>{student.nickname}</h4>
          <p className="muted small">
            {role ? `${role} · ` : ""}발언 {student.lines.length}개 · {student.score}/{MAX_SCORE}점 · 충족 {CRITERIA.filter((c) => student.findings[c.id].level === "met").length}/{CRITERIA.length}항목
          </p>
        </div>
        <button className="button ghost small" onClick={onClose}>
          닫기
        </button>
      </header>
      {memos.length > 0 && (
        <section className="detail-group">
          <h5>이 학생에 대한 선생님 메모</h5>
          {memos.map(({ phase, entry }) => (
            <MemoList key={entry.id} entries={[entry]} participants={participants} phase={phase} />
          ))}
        </section>
      )}
      {GROUPS.map((g) => (
        <section key={g.id} className="detail-group">
          <h5>{g.label}</h5>
          {CRITERIA.filter((c) => c.group === g.id).map((c) => {
            const f = student.findings[c.id];
            return (
              <details key={c.id} className="criterion" open={focus === c.id}>
                <summary>
                  <span className={`lv-text ${f.level}`}>{LEVEL_LABEL[f.level]}</span>
                  <strong>
                    {c.label}
                    {f.autoLevel && <span className="edited-tag">선생님 수정</span>}
                  </strong>
                  <span className="criterion-reason">{f.reason}</span>
                </summary>
                <div className="criterion-body">
                  {onChange ? (
                    <div className="level-edit">
                      <div className="level-picker" role="radiogroup" aria-label={`${c.label} 판정`}>
                        {LEVELS.map((lv) => (
                          <button key={lv} role="radio" aria-checked={f.level === lv} className={`level-option${f.level === lv ? " active" : ""}`} onClick={() => onChange({ uid: student.uid, criterion: c.id, level: lv })}>
                            {LEVEL_LABEL[lv]}
                          </button>
                        ))}
                        {f.autoLevel && (
                          <button className="text-button" onClick={() => onChange({ uid: student.uid, criterion: c.id, level: null })} title={`자동 판정(${LEVEL_LABEL[f.autoLevel]})으로 되돌리기`}>
                            자동 판정으로 되돌리기
                          </button>
                        )}
                      </div>
                      <textarea
                        className="teacher-comment"
                        rows={2}
                        maxLength={500}
                        value={f.comment ?? ""}
                        placeholder="선생님 의견 (예: 수업 중 준비한 자료를 직접 보여 주며 말함)"
                        aria-label={`${c.label} 선생님 의견`}
                        onChange={(e) => onChange({ uid: student.uid, criterion: c.id, comment: e.target.value })}
                      />
                    </div>
                  ) : (
                    f.comment && <p className="teacher-comment-view">선생님 의견 · {f.comment}</p>
                  )}
                  <p className="muted small">살펴본 점 · {c.looksFor}</p>
                  {f.evidence.length ? <Evidence lines={f.evidence} /> : <p className="muted small">근거로 보여 줄 발언이 없어요.</p>}
                </div>
              </details>
            );
          })}
        </section>
      ))}
      <section className="record-draft">
        <div className="panel-head">
          <h5>학생부 기록 초안</h5>
          <button
            className="button ghost small"
            onClick={() => {
              void navigator.clipboard?.writeText(student.recordDraft);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "복사했어요" : "복사"}
          </button>
        </div>
        {onChange ? (
          <>
            <textarea className="record-edit" rows={4} maxLength={1500} value={student.recordDraft} aria-label="학생부 기록 초안 고치기" onChange={(e) => onChange({ uid: student.uid, record: e.target.value })} />
            {student.autoRecordDraft !== undefined && (
              <button className="text-button" onClick={() => onChange({ uid: student.uid, record: null })}>
                자동 초안으로 되돌리기
              </button>
            )}
          </>
        ) : (
          <p className="record-text">
            {student.recordDraft}
            {student.autoRecordDraft !== undefined && <span className="edited-tag">선생님 수정</span>}
          </p>
        )}
        <p className="muted small">토론 전후로 관점이 어떻게 바뀌었는지와 자료 검증 과정을 남기면 학생부 소재가 됩니다. 충족한 항목만으로 만든 초안이니 다듬어 써 주세요.</p>
      </section>
    </article>
  );
}

function FullLog({ topic, participants, transcript }: { topic: Topic; participants: Participant[]; transcript: TranscriptLine[] }) {
  const [who, setWho] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const lines = transcript.filter((l) => (!who || l.uid === who) && (!query.trim() || l.text.includes(query.trim())));
  const download = () => {
    const name = (uid: string) => participants.find((p) => p.uid === uid)?.nickname ?? "나간 참가자";
    const text = [
      `${topic.title} — 전체 발언 기록`,
      "",
      ...transcript.map((l) => `[${PHASE_SHORT[l.phase]}${l.kind !== "statement" ? `·${KIND_LABEL[l.kind]}` : ""}] ${name(l.uid)}${participants.find((p) => p.uid === l.uid)?.roleId ? ` (${roleName(topic, participants.find((p) => p.uid === l.uid)?.roleId)})` : ""}: ${l.text}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `발언기록-${topic.shortTitle}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="full-log">
      <div className="log-tools">
        <input className="log-query"value={query} onChange={(e) => setQuery(e.target.value)} placeholder="발언 검색" aria-label="발언 검색" />
        <button className="button ghost small" onClick={download} disabled={!transcript.length}>
          텍스트 파일로 저장
        </button>
      </div>
      <div className="log-filter" role="group" aria-label="학생별 보기">
        <button className={!who ? "active" : ""} onClick={() => setWho(null)}>
          전체 <span>{transcript.length}</span>
        </button>
        {participants.map((p) => {
          const n = transcript.filter((l) => l.uid === p.uid).length;
          return (
            <button key={p.uid} className={who === p.uid ? "active" : ""} onClick={() => setWho(who === p.uid ? null : p.uid)}>
              {p.nickname} <span>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="full-log-feed">
        <TranscriptFeed lines={lines} participants={participants} topic={topic} emptyText={transcript.length ? "조건에 맞는 발언이 없어요." : "기록된 발언이 없어요."} />
      </div>
    </div>
  );
}

/** Every note of the game by phase, narrowed to one student or to the general ones. */
function NotesTab({ notes, participants }: { notes: PhaseNotes; participants: Participant[] }) {
  const [who, setWho] = useState<string | null | "all">("all");
  const total = countNotes(notes);
  if (!total) return <p className="muted empty">이 게임에 남긴 메모가 없어요. 진행 화면 오른쪽 메모 칸에서 단계마다 학생을 골라 적을 수 있어요.</p>;
  const count = (uid: string | null) => PHASE_ORDER.reduce((n, p) => n + (notes[p] ?? []).filter((e) => e.uid === uid).length, 0);
  const pick = (list: MemoEntry[]) => (who === "all" ? list : list.filter((e) => e.uid === who));
  const phases = PHASE_ORDER.filter((p) => pick(notes[p] ?? []).length);
  return (
    <div className="notes-tab">
      <div className="log-filter" role="group" aria-label="메모 대상">
        <button className={who === "all" ? "active" : ""} onClick={() => setWho("all")}>
          전체 <span>{total}</span>
        </button>
        {count(null) > 0 && (
          <button className={who === null ? "active" : ""} onClick={() => setWho(null)}>
            반 전체 <span>{count(null)}</span>
          </button>
        )}
        {participants
          .filter((p) => count(p.uid) > 0)
          .map((p) => (
            <button key={p.uid} className={who === p.uid ? "active" : ""} onClick={() => setWho(p.uid)}>
              {p.nickname} <span>{count(p.uid)}</span>
            </button>
          ))}
      </div>
      {phases.map((p) => (
        <section key={p} className="notes-phase">
          <h5>{PHASE_SHORT[p]}</h5>
          <MemoList entries={pick(notes[p] ?? [])} participants={participants} />
        </section>
      ))}
    </div>
  );
}
