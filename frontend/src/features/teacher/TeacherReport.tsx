import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, ClipboardCopy, Download, FileText, MessageSquareQuote, PenLine, RotateCcw, Search } from "lucide-react";
import Tabs from "../../components/Tabs";
import type { ModerationEntry, Participant, Topic, TranscriptLine } from "../../types/game";
import TranscriptFeed from "../discussion/TranscriptFeed";
import { KIND_LABEL, PHASE_ORDER, PHASE_SHORT } from "../game/phases";
import { roleName } from "../roles/roleName";
import { applyEdits, buildReport, CRITERIA, GROUPS, LEVEL_LABEL, MAX_SCORE, type CriterionId, type Level, type ReportEdits, type StudentReport } from "./report";
import { loadEdits, saveEdits, type PhaseNotes } from "./teacherStorage";

const LEVELS: Level[] = ["met", "partial", "weak", "none"];

/** A correction to one student's rubric: a level, a comment or the record draft. `null` puts the automatic value back. */
type Change = { uid: string } & ({ criterion: CriterionId; level?: Level | null; comment?: string } | { record: string | null });

type Tab = "rubric" | "log" | "notes";

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
}: {
  topic: Topic;
  participants: Participant[];
  transcript: TranscriptLine[];
  moderation?: ModerationEntry[];
  notes?: PhaseNotes;
  at?: number;
  /** The game's key: when given, the rubric can be corrected and the corrections are kept for that game. */
  editKey?: string;
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
  const noteCount = PHASE_ORDER.filter((p) => notes[p]).length;
  const student = report.students.find((s) => s.uid === selected?.uid);

  return (
    <section className="panel teacher-report" data-testid="teacher-report">
      <header className="report-head">
        <div>
          <span className="eyebrow">
            <FileText size={13} aria-hidden /> 선생님 레포트
          </span>
          <h3>토론·발표 수행평가</h3>
          <div className="report-chips">
            <span className="report-chip">시기 단원 마무리 주간</span>
            <span className="report-chip">반영 예시 10~20%</span>
          </div>
        </div>
        <dl className="report-meta">
          <div>
            <dt>참여</dt>
            <dd>{participants.length}명</dd>
          </div>
          <div>
            <dt>발언</dt>
            <dd>{report.totalLines}개</dd>
          </div>
          {at && (
            <div>
              <dt>일시</dt>
              <dd>{fmtDate(at)}</dd>
            </div>
          )}
        </dl>
      </header>

      <Tabs<Tab>
        label="레포트 보기"
        active={tab}
        onChange={setTab}
        items={[
          { id: "rubric", label: "평가 기준표" },
          { id: "log", label: "전체 발언 기록" },
          { id: "notes", label: `단계별 메모${noteCount ? ` ${noteCount}` : ""}` },
        ]}
      />

      {tab === "rubric" && (
        <>
          {editKey && (
            <div className={`rubric-editbar${editing ? " on" : ""}`}>
              <p className="small">
                {editing
                  ? "표의 칸이나 학생 이름을 눌러 판정을 고치고 의견을 남겨 주세요. 고친 내용은 이 기기에 바로 저장돼요."
                  : editedCount
                    ? `선생님이 고친 항목 ${editedCount}개가 반영돼 있어요.`
                    : "자동 판정이 수업 중 관찰과 다르면 직접 고칠 수 있어요."}
              </p>
              <button className={`button small ${editing ? "primary" : "secondary"}`} data-testid="rubric-edit-toggle" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
                {editing ? <Check size={15} /> : <PenLine size={15} />} {editing ? "수정 마치기" : "판정 수정하기"}
              </button>
            </div>
          )}
          <ClassOverview report={report} />
          <RubricMatrix
            students={report.students}
            topic={topic}
            selected={selected}
            onSelect={(uid, criterion) => setSelected((cur) => (cur?.uid === uid && cur.criterion === criterion ? null : { uid, criterion }))}
          />
          {student && <StudentDetail key={`${student.uid}-${selected?.criterion}`} student={student} topic={topic} focus={selected?.criterion} onChange={editing ? change : undefined} />}
          {!student && report.students.length > 0 && <p className="muted small report-hint">학생 이름이나 칸을 누르면 판단 이유와 근거 발언을 볼 수 있어요.</p>}
          <p className="report-note">발언 기록에서 표현을 찾아 자동으로 고른 참고 자료예요. 점수로 바로 쓰지 말고, 근거 발언과 수업 중 관찰을 함께 보고 판단해 주세요.</p>
        </>
      )}

      {tab === "log" && <FullLog topic={topic} participants={participants} transcript={transcript} />}

      {tab === "notes" &&
        (noteCount ? (
          <ol className="report-notes">
            {PHASE_ORDER.filter((p) => notes[p]).map((p) => (
              <li key={p}>
                <span className="phase-memo-phase">{PHASE_SHORT[p]}</span>
                <p>{notes[p]}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted empty">이 게임에 남긴 메모가 없어요. 진행 화면 오른쪽 메모 칸에 단계마다 적을 수 있어요.</p>
        ))}
    </section>
  );
}

function ClassOverview({ report }: { report: ReturnType<typeof buildReport> }) {
  return (
    <div className="report-overview">
      {GROUPS.map((g) => (
        <div key={g.id} className="overview-group">
          <h4>{g.label}</h4>
          <ul>
            {CRITERIA.filter((c) => c.group === g.id).map((c) => {
              const { met, partial, total } = report.coverage[c.id];
              const pct = (n: number) => (total ? (n / total) * 100 : 0);
              return (
                <li key={c.id} title={c.looksFor}>
                  <span className="overview-label">{c.label}</span>
                  <span className="overview-bar" aria-hidden>
                    <i className="met" style={{ width: `${pct(met)}%` }} />
                    <i className="partial" style={{ width: `${pct(partial)}%` }} />
                  </span>
                  <span className="overview-count">
                    <strong>{met}</strong>/{total}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="overview-legend">
        <span className="lv met" /> 충족 <span className="lv partial" /> 부분 충족 <span className="lv weak" /> 보완 필요 <span className="lv none" /> 근거 없음 <span className="edited-dot" /> 선생님 수정
      </p>
    </div>
  );
}

function RubricMatrix({
  students,
  topic,
  selected,
  onSelect,
}: {
  students: StudentReport[];
  topic: Topic;
  selected: { uid: string; criterion?: CriterionId } | null;
  onSelect: (uid: string, criterion?: CriterionId) => void;
}) {
  return (
    <div className="rubric-scroll">
      <table className="rubric-matrix">
        <thead>
          <tr>
            <th scope="col">학생</th>
            {GROUPS.map((g) => (
              <th key={g.id} scope="colgroup" colSpan={CRITERIA.filter((c) => c.group === g.id).length} className="group-head">
                {g.label}
              </th>
            ))}
            <th scope="col">종합</th>
          </tr>
          <tr className="criteria-row">
            <th />
            {CRITERIA.map((c) => (
              <th key={c.id} scope="col" title={`${c.label}: ${c.looksFor}`}>
                {c.short}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.uid} className={selected?.uid === s.uid ? "selected" : ""} data-testid="rubric-row">
              <th scope="row">
                <button className="rubric-name" onClick={() => onSelect(s.uid)} aria-expanded={selected?.uid === s.uid}>
                  <strong>{s.nickname}</strong>
                  {s.roleId && <span>{roleName(topic, s.roleId)}</span>}
                </button>
              </th>
              {CRITERIA.map((c) => {
                const f = s.findings[c.id];
                const active = selected?.uid === s.uid && selected.criterion === c.id;
                return (
                  <td key={c.id}>
                    <button className={`lv-cell${active ? " active" : ""}${f.autoLevel ? " edited" : ""}`} onClick={() => onSelect(s.uid, c.id)} aria-label={`${s.nickname} ${c.label}: ${LEVEL_LABEL[f.level]}`} title={`${c.label} · ${LEVEL_LABEL[f.level]}${f.autoLevel ? ` (선생님 수정 · 자동 판정 ${LEVEL_LABEL[f.autoLevel]})` : ""}`}>
                      <span className={`lv ${f.level}`} />
                    </button>
                  </td>
                );
              })}
              <td>
                <span className="score">
                  <span className="score-bar" aria-hidden>
                    <i style={{ width: `${(s.score / MAX_SCORE) * 100}%` }} />
                  </span>
                  {s.score}/{MAX_SCORE}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentDetail({ student, topic, focus, onChange }: { student: StudentReport; topic: Topic; focus?: CriterionId; onChange?: (c: Change) => void }) {
  const [copied, setCopied] = useState(false);
  const role = roleName(topic, student.roleId);
  return (
    <article className="student-detail" data-testid="student-detail">
      <header>
        <div>
          <h4>{student.nickname}</h4>
          <p className="muted small">
            {role ? `${role} · ` : ""}발언 {student.lines.length}개 · 충족 {CRITERIA.filter((c) => student.findings[c.id].level === "met").length}/{CRITERIA.length}
          </p>
        </div>
      </header>
      {GROUPS.map((g) => (
        <div key={g.id} className="detail-group">
          <h5>{g.label}</h5>
          {CRITERIA.filter((c) => c.group === g.id).map((c) => {
            const f = student.findings[c.id];
            return (
              <details key={c.id} className={`criterion ${f.level}`} open={focus === c.id}>
                <summary>
                  <span className={`lv-badge ${f.level}`}>{LEVEL_LABEL[f.level]}</span>
                  <strong>
                    {c.label}
                    {f.autoLevel && <span className="edited-tag">선생님 수정</span>}
                  </strong>
                  <span className="criterion-reason">{f.reason}</span>
                  <ChevronRight size={16} className="chev" aria-hidden />
                </summary>
                <div className="criterion-body">
                  {onChange ? (
                    <div className="level-edit">
                      <div className="level-picker" role="radiogroup" aria-label={`${c.label} 판정`}>
                        {LEVELS.map((lv) => (
                          <button key={lv} role="radio" aria-checked={f.level === lv} className={`level-option${f.level === lv ? " active" : ""}`} onClick={() => onChange({ uid: student.uid, criterion: c.id, level: lv })}>
                            <span className={`lv ${lv}`} /> {LEVEL_LABEL[lv]}
                          </button>
                        ))}
                        {f.autoLevel && (
                          <button className="button ghost small" onClick={() => onChange({ uid: student.uid, criterion: c.id, level: null })} title={`자동 판정(${LEVEL_LABEL[f.autoLevel]})으로 되돌리기`}>
                            <RotateCcw size={14} /> 자동 판정으로
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
                    f.comment && (
                      <p className="teacher-comment-view">
                        <PenLine size={14} aria-hidden /> {f.comment}
                      </p>
                    )
                  )}
                  <p className="muted small">살펴본 점 · {c.looksFor}</p>
                  {f.evidence.length ? (
                    <ul className="evidence">
                      {f.evidence.map((l) => (
                        <li key={l.id}>
                          <MessageSquareQuote size={15} aria-hidden />
                          <div>
                            <span className="evidence-tag">
                              {PHASE_SHORT[l.phase]}
                              {l.kind !== "statement" && ` · ${KIND_LABEL[l.kind]}`}
                            </span>
                            <q>{l.text}</q>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">근거로 보여 줄 발언이 없어요.</p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      ))}
      <div className="record-draft">
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
            {copied ? <Check size={15} /> : <ClipboardCopy size={15} />} {copied ? "복사했어요" : "복사"}
          </button>
        </div>
        {onChange ? (
          <>
            <textarea className="record-edit" rows={4} maxLength={1500} value={student.recordDraft} aria-label="학생부 기록 초안 고치기" onChange={(e) => onChange({ uid: student.uid, record: e.target.value })} />
            {student.autoRecordDraft !== undefined && (
              <button className="button ghost small" onClick={() => onChange({ uid: student.uid, record: null })}>
                <RotateCcw size={14} /> 자동 초안으로 되돌리기
              </button>
            )}
          </>
        ) : (
          <p>
            {student.recordDraft}
            {student.autoRecordDraft !== undefined && <span className="edited-tag">선생님 수정</span>}
          </p>
        )}
        <p className="muted small">토론 전후로 관점이 어떻게 바뀌었는지와 자료 검증 과정을 남기면 학생부 소재가 됩니다. 충족한 항목만으로 만든 초안이니 다듬어 써 주세요.</p>
      </div>
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
        <div className="log-search">
          <Search size={15} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="발언 검색" aria-label="발언 검색" />
        </div>
        <button className="button ghost small" onClick={download} disabled={!transcript.length}>
          <Download size={15} /> 텍스트로 저장
        </button>
      </div>
      <div className="full-log-feed">
        <TranscriptFeed lines={lines} participants={participants} topic={topic} emptyText={transcript.length ? "조건에 맞는 발언이 없어요." : "기록된 발언이 없어요."} />
      </div>
    </div>
  );
}
