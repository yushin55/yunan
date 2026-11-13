import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { ModerationEntry, Participant, Topic, TranscriptLine } from "../../types/game";
import { PHASE_SHORT } from "../game/phases";
import { roleName } from "../roles/roleName";
import Evidence from "./Evidence";
import { buildReport, type CriterionId } from "./report";
import { loadAiReports, saveAiReports, type EvidencedText, type StoredAiReports, type StudentAiReport } from "./teacherStorage";

const POINTS: { label: string; rule: CriterionId }[] = [
  { label: "자료 조사", rule: "research" },
  { label: "발언의 설득력", rule: "persuasion" },
  { label: "반론 수용", rule: "acceptance" },
  { label: "발표 태도", rule: "attitude" },
];

/** Without a server (practice) or when the AI is down: the same shape, built from the rule-based rubric. */
function localReports(topic: Topic, participants: Participant[], transcript: TranscriptLine[], moderation: ModerationEntry[]): StudentAiReport[] {
  const rubric = buildReport(topic, participants, transcript, moderation);
  return rubric.students
    .filter((s) => s.lines.length)
    .map((s) => {
      const f = s.findings;
      const ids = (id: CriterionId) => f[id].evidence.map((l) => l.id);
      const met = POINTS.filter((p) => f[p.rule].level === "met").map((p) => p.label);
      const weak = POINTS.filter((p) => f[p.rule].level === "weak").map((p) => p.label);
      return {
        uid: s.uid,
        overall: `${roleName(topic, s.roleId) || "맡은 역할"}의 입장에서 ${s.lines.length}번 발언했어요. ${met.length ? `${met.join(", ")}에서 근거가 보였어요.` : "평가 포인트를 충족한 근거는 아직 적어요."}${weak.length ? ` ${weak.join(", ")}은 보완이 필요해요.` : ""}`,
        points: POINTS.map((p) => ({ criterion: p.label, comment: f[p.rule].reason, evidence: ids(p.rule) })),
        strengths: POINTS.filter((p) => f[p.rule].level === "met").map((p) => ({ text: `${p.label}: ${f[p.rule].reason}`, evidence: ids(p.rule) })),
        improvements: POINTS.filter((p) => f[p.rule].level === "weak" || f[p.rule].level === "partial").map((p) => ({ text: `${p.label}: ${f[p.rule].reason}`, evidence: ids(p.rule) })),
        record: s.recordDraft,
      };
    });
}

const same = (a: StudentAiReport | undefined, b: StudentAiReport | undefined) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Per-student evaluation reports drafted by AI (or the offline stand-in), each claim with the lines
 * behind it one click away. The teacher can rewrite any of it; the working copy stays on this device.
 */
export default function AiStudentReport({
  storageKey,
  roomId,
  topic,
  participants,
  transcript,
  moderation = [],
}: {
  storageKey?: string;
  /** A real room's id: reports come from the server's AI. Without it (practice) they are built locally. */
  roomId?: string;
  topic: Topic;
  participants: Participant[];
  transcript: TranscriptLine[];
  moderation?: ModerationEntry[];
}) {
  const [stored, setStored] = useState<StoredAiReports | null>(() => (storageKey ? loadAiReports(storageKey) : null));
  useEffect(() => setStored(storageKey ? loadAiReports(storageKey) : null), [storageKey]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const speakers = participants.filter((p) => transcript.some((l) => l.uid === p.uid));
  const [selected, setSelected] = useState<string | null>(null);
  const uid = selected ?? stored?.current[0]?.uid ?? null;
  const lines = useMemo(() => new Map(transcript.map((l) => [l.id, l])), [transcript]);

  const keep = (next: StoredAiReports) => {
    setStored(next);
    if (storageKey) saveAiReports(storageKey, next);
  };
  const generate = async (offline = !roomId) => {
    if (stored && stored.current.some((r) => !same(r, stored.original.find((o) => o.uid === r.uid))) && !confirm("다시 만들면 고친 내용이 사라져요. 계속할까요?")) return;
    setError("");
    if (offline) {
      const reports = localReports(topic, participants, transcript, moderation);
      keep({ source: "local", at: Date.now(), original: reports, current: reports });
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ reports: StudentAiReport[]; source: "ai"; at: number }>(`/api/rooms/${roomId}/student-report`, {}, 90000);
      keep({ source: "ai", at: result.at, original: result.reports, current: result.reports });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "AI 리포트를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  const update = (next: StudentAiReport) => stored && keep({ ...stored, current: stored.current.map((r) => (r.uid === next.uid ? next : r)) });

  if (!transcript.length) return <p className="muted empty">기록된 발언이 없어 학생별 리포트를 만들 수 없어요.</p>;

  if (!stored)
    return (
      <div className="ai-empty" data-testid="ai-report-empty">
        <p>
          <strong>학생별 평가 리포트를 {roomId ? "AI가 정리해 드려요" : "만들어 드려요"}</strong>
        </p>
        <p className="muted small">
          {roomId
            ? "발언 기록과 역할 이름, 자리 번호만 AI에 보내요. 학생 이름과 역할 전환 여부는 보내지 않아요. 모든 평가 문장에는 그 학생의 발언이 근거로 붙어요. 30초쯤 걸려요."
            : "연습 모드에는 AI 서버가 없어서, 평가 기준표의 자동 판정으로 간이 리포트를 만들어요. 실제 방에서는 AI가 정리해요."}
        </p>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="ai-empty-actions">
          <button className="button primary" data-testid="ai-report-generate" disabled={busy} onClick={() => void generate()}>
            {busy && <span className="spinner" />} {busy ? "AI가 정리하는 중…" : roomId ? "AI로 학생별 리포트 만들기" : "간이 리포트 만들기"}
          </button>
          {error && roomId && (
            <button className="button ghost" onClick={() => void generate(true)}>
              AI 없이 간이 리포트로
            </button>
          )}
        </div>
      </div>
    );

  const current = stored.current.find((r) => r.uid === uid);
  const original = stored.original.find((r) => r.uid === uid);
  const edited = new Set(stored.current.filter((r) => !same(r, stored.original.find((o) => o.uid === r.uid))).map((r) => r.uid));
  const person = participants.find((p) => p.uid === uid);
  const ownLines = transcript.filter((l) => l.uid === uid);

  return (
    <div className="ai-report" data-testid="ai-report">
      <div className="rubric-toolbar">
        <p className="small">
          <span className={`ai-source ${stored.source}`}>{stored.source === "ai" ? "AI 초안" : "간이 리포트 (AI 아님)"}</span>{" "}
          {editing ? "문장을 고치고 근거를 더하거나 뺄 수 있어요. 이 기기에 바로 저장돼요." : `${new Date(stored.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}에 만들었어요. 근거 버튼을 눌러 확인하고 고쳐 써 주세요.`}
        </p>
        <div className="ai-bar-actions">
          {!editing && (
            <button className="button ghost small" disabled={busy} onClick={() => void generate()} title="다시 만들기">
              {busy && <span className="spinner" />} 다시 만들기
            </button>
          )}
          <button className={`button small ${editing ? "primary" : "ghost"}`} data-testid="ai-report-edit" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? "수정 마치기" : "리포트 고치기"}
          </button>
        </div>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}

      <div className="ai-layout">
        <ul className="ai-students" role="tablist" aria-label="학생">
          {speakers.map((p) => {
            const has = stored.current.some((r) => r.uid === p.uid);
            return (
              <li key={p.uid}>
                <button role="tab" aria-selected={uid === p.uid} className={uid === p.uid ? "active" : ""} disabled={!has} onClick={() => setSelected(p.uid)} data-testid="ai-student">
                  <strong>{p.nickname}</strong>
                  <span>{roleName(topic, p.roleId) || " "}</span>
                  {edited.has(p.uid) && <span className="edited-tag">수정함</span>}
                  {!has && <span className="muted small">리포트 없음</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {current && person ? (
          <article className="ai-card" data-testid="ai-card">
            <header>
              <div>
                <h4>{person.nickname}</h4>
                <p className="muted small">
                  {roleName(topic, person.roleId)} · 발언 {ownLines.length}개
                </p>
              </div>
              {editing && !same(current, original) && original && (
                <button className="text-button" onClick={() => update(original)}>
                  {stored.source === "ai" ? "AI 원본으로" : "처음 내용으로"}
                </button>
              )}
            </header>

            <section className="ai-section">
              <h5>종합 의견</h5>
              <Editable editing={editing} value={current.overall} rows={3} label="종합 의견" onChange={(overall) => update({ ...current, overall })} />
            </section>

            <section className="ai-section">
              <h5>평가 포인트</h5>
              <ul className="ai-points">
                {current.points.map((pt, i) => (
                  <li key={pt.criterion}>
                    <span className="ai-criterion">{pt.criterion}</span>
                    <Claim
                      editing={editing}
                      item={{ text: pt.comment, evidence: pt.evidence }}
                      lines={lines}
                      own={ownLines}
                      label={`${pt.criterion} 의견`}
                      onChange={(v) => update({ ...current, points: current.points.map((x, j) => (j === i ? { ...x, comment: v.text, evidence: v.evidence } : x)) })}
                    />
                  </li>
                ))}
              </ul>
            </section>

            <div className="ai-two">
              {(["strengths", "improvements"] as const).map((field) => (
                <section key={field} className={`ai-section ${field}`}>
                  <h5>{field === "strengths" ? "잘한 점" : "보완할 점"}</h5>
                  {current[field].length === 0 && !editing && <p className="muted small">{field === "strengths" ? "근거가 분명한 강점을 찾지 못했어요." : "따로 짚을 보완점이 없어요."}</p>}
                  <ul className="ai-items">
                    {current[field].map((item, i) => (
                      <li key={i}>
                        <Claim
                          editing={editing}
                          item={item}
                          lines={lines}
                          own={ownLines}
                          label={field === "strengths" ? "잘한 점" : "보완할 점"}
                          onChange={(v) => update({ ...current, [field]: current[field].map((x, j) => (j === i ? v : x)) })}
                          onRemove={() => update({ ...current, [field]: current[field].filter((_, j) => j !== i) })}
                        />
                      </li>
                    ))}
                  </ul>
                  {editing && (
                    <button className="text-button" onClick={() => update({ ...current, [field]: [...current[field], { text: "", evidence: [] }] })}>
                      항목 추가
                    </button>
                  )}
                </section>
              ))}
            </div>

            <section className="ai-section record-draft">
              <RecordHead text={current.record} />
              <Editable editing={editing} value={current.record} rows={4} label="학생부 기록 초안" onChange={(record) => update({ ...current, record })} />
            </section>
          </article>
        ) : (
          <p className="muted empty">왼쪽에서 학생을 골라 주세요.</p>
        )}
      </div>
      <p className="report-note">
        {stored.source === "ai"
          ? "AI가 발언 기록만 보고 쓴 초안이에요. 근거 발언과 수업 중 관찰을 함께 보고, 고쳐서 써 주세요. 점수로 바로 쓰지 마세요."
          : "평가 기준표의 자동 판정을 문장으로 옮긴 간이 리포트예요. 실제 방에서는 AI가 정리해요."}
      </p>
    </div>
  );
}

function Editable({ editing, value, rows, label, onChange }: { editing: boolean; value: string; rows: number; label: string; onChange: (v: string) => void }) {
  if (editing) return <textarea className="ai-edit" rows={rows} maxLength={600} value={value} aria-label={`${label} 고치기`} onChange={(e) => onChange(e.target.value)} />;
  return <p className={value ? "ai-text" : "ai-text muted"}>{value || "내용이 없어요."}</p>;
}

/** One sentence and the student's own lines behind it: shown on request, editable in edit mode. */
function Claim({
  editing,
  item,
  lines,
  own,
  label,
  onChange,
  onRemove,
}: {
  editing: boolean;
  item: EvidencedText;
  lines: Map<string, TranscriptLine>;
  own: TranscriptLine[];
  label: string;
  onChange: (v: EvidencedText) => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const evidence = item.evidence.map((id) => lines.get(id)).filter((l): l is TranscriptLine => Boolean(l));
  const addable = own.filter((l) => !item.evidence.includes(l.id));
  return (
    <div className="claim">
      <div className="claim-row">
        {editing ? (
          <textarea className="ai-edit" rows={2} maxLength={300} value={item.text} placeholder="내용을 적어 주세요" aria-label={`${label} 고치기`} onChange={(e) => onChange({ ...item, text: e.target.value })} />
        ) : (
          <p className="ai-text">{item.text}</p>
        )}
        {!editing && (
          <button className={`evidence-toggle${open ? " open" : ""}`} disabled={!evidence.length} aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="evidence-toggle">
            {evidence.length ? (open ? "근거 접기" : `근거 발언 ${evidence.length}`) : "근거 없음"}
          </button>
        )}
        {editing && onRemove && (
          <button className="text-button danger" aria-label={`${label} 지우기`} onClick={onRemove}>
            지우기
          </button>
        )}
      </div>
      {(open || editing) && evidence.length > 0 && <Evidence lines={evidence} onRemove={editing ? (id) => onChange({ ...item, evidence: item.evidence.filter((x) => x !== id) }) : undefined} />}
      {editing && addable.length > 0 && (
        <select
          className="evidence-add"
          value=""
          aria-label={`${label}에 근거 발언 더하기`}
          onChange={(e) => e.target.value && onChange({ ...item, evidence: [...item.evidence, e.target.value] })}
        >
          <option value="">+ 근거 발언 더하기</option>
          {addable.map((l) => (
            <option key={l.id} value={l.id}>
              [{PHASE_SHORT[l.phase]}] {l.text.length > 50 ? `${l.text.slice(0, 50)}…` : l.text}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function RecordHead({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="panel-head">
      <h5>학생부 기록 초안</h5>
      <button
        className="button ghost small"
        disabled={!text}
        onClick={() => {
          void navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "복사했어요" : "복사"}
      </button>
    </div>
  );
}
