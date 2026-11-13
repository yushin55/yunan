import { Check, Mic, Minus } from "lucide-react";
import type { Floor, Participant, Phase, Room, Rounds, SpeakingPhase } from "../../types/game";
import { KIND_LABEL } from "../game/phases";
import { roleName } from "../roles/roleName";

const CONNECTED_MS = 100_000;
const RECENT_MS = 20_000;
/** Turns in which someone's words were recorded. Recognition cuts speech into lines, so lines mean little. */
const turnsSpoken = (rounds: Rounds, phase: SpeakingPhase, uid?: string) => new Set(rounds.transcript.filter((l) => l.phase === phase && (!uid || l.uid === uid)).map((l) => l.turn)).size;

const COLUMNS: { phase: Phase; label: string }[] = [
  { phase: "role", label: "역할 확인" },
  { phase: "statement", label: "입장 발표" },
  { phase: "event", label: "사건·질문" },
  { phase: "vote", label: "투표" },
];

type Status = { key: "speaking" | "turn" | "next" | "done" | "waiting" | "ready" | "idle" | "recent"; label: string };

/**
 * Who is talking right now and how far the class has got, per student. Submission and participation
 * only: no preferences, no switcher status.
 */
export default function ParticipationBoard({
  room,
  participants,
  rounds,
  serverNow,
  floor,
  floorSeconds = 0,
  alwaysOnline = false,
  onKick,
  busy,
}: {
  room: Room;
  participants: Participant[];
  rounds: Rounds;
  serverNow: number;
  floor?: Floor | null;
  floorSeconds?: number;
  /** Practice partners never drop out. */
  alwaysOnline?: boolean;
  onKick?: (uid: string) => void;
  busy?: boolean;
}) {
  const phase = room.phase;
  const started = phase !== "lobby";
  const turn = room.turn?.stage === "qa" ? null : room.turn;
  const order = turn?.order ?? [];
  const speakingUid = floor?.uid ?? null;
  const lastLine = rounds.transcript.at(-1);
  // During the statements the list follows the speaking order, so "how far" reads top to bottom.
  const rows = turn ? [...participants].sort((a, b) => order.indexOf(a.uid) - order.indexOf(b.uid)) : participants;

  const status = (p: Participant): Status => {
    if (speakingUid === p.uid) return { key: "speaking", label: `${floor ? KIND_LABEL[floor.kind] : "발언"} 중${floorSeconds ? ` · ${floorSeconds}초` : ""}` };
    if (turn) {
      const at = order.indexOf(p.uid);
      if (turn.uid === p.uid) return { key: "turn", label: "차례 · 마이크 대기" };
      if (at === turn.index + 1) return { key: "next", label: "다음 차례" };
      return at < turn.index ? { key: "done", label: "발표 끝" } : { key: "waiting", label: `${at - turn.index}번째 뒤` };
    }
    if (phase === "lobby") return p.prefsDone ? { key: "ready", label: "역할 고름" } : { key: "idle", label: "고르는 중" };
    if (phase === "role" || phase === "vote") return p.submitted.includes(phase) ? { key: "ready", label: phase === "role" ? "확인함" : "투표함" } : { key: "idle", label: phase === "role" ? "확인 전" : "투표 전" };
    if (phase === "event" || phase === "rebuttal" || (phase === "statement" && room.turn?.stage === "qa")) {
      const mine = rounds.transcript.filter((l) => l.uid === p.uid && l.phase === phase);
      const last = mine.at(-1);
      if (last && serverNow - last.at < RECENT_MS) return { key: "recent", label: "방금 말함" };
      return mine.length ? { key: "ready", label: `${turnsSpoken(rounds, phase, p.uid)}번 말함` } : { key: "idle", label: "아직 안 말함" };
    }
    return { key: "ready", label: "완료" };
  };

  const cell = (p: Participant, col: Phase) => {
    if (col === "role" || col === "vote") return p.submitted.includes(col) ? <Check size={16} aria-label="완료" className="yes" /> : <Minus size={16} aria-label="아직" className="no" />;
    const n = turnsSpoken(rounds, col as SpeakingPhase, p.uid);
    return n ? <strong>{n}</strong> : <span className="no">0</span>;
  };

  return (
    <div className="participation live" data-testid="participation-live">
      <ProgressStrip room={room} participants={participants} rounds={rounds} />
      <table>
        <thead>
          <tr>
            {turn && <th scope="col" className="num">순서</th>}
            <th scope="col">학생</th>
            <th scope="col">지금</th>
            {started && COLUMNS.map((c) => <th key={c.phase} scope="col" className={c.phase === phase ? "now" : ""}>{c.label}</th>)}
            <th scope="col">연결</th>
            {onKick && <th scope="col" className="sr-only">내보내기</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const online = alwaysOnline || serverNow - p.connectedAt < CONNECTED_MS;
            const s = status(p);
            const live = s.key === "speaking";
            const speakingNow = live && lastLine?.uid === p.uid && lastLine.phase === phase ? lastLine.text : "";
            return (
              <tr key={p.uid} data-testid="participant-row" className={`row-${s.key}`}>
                {turn && <td className="num">{order.indexOf(p.uid) + 1}</td>}
                <th scope="row">
                  <span className="who">{p.nickname}</span>
                  {started && <span className="role">{p.roleId ? roleName(room.topic, p.roleId) : "비공개"}</span>}
                  {speakingNow && <span className="live-text" title={speakingNow}>“{speakingNow}”</span>}
                </th>
                <td>
                  <span className={`live-status ${s.key}`} data-testid="live-status">
                    {live && <Mic size={13} aria-hidden />}
                    {s.label}
                  </span>
                </td>
                {started && COLUMNS.map((c) => <td key={c.phase} className={c.phase === phase ? "now" : ""}>{cell(p, c.phase)}</td>)}
                <td>
                  <span className={`dot ${online ? "on" : "off"}`} /> {online ? "접속" : "끊김"}
                </td>
                {onKick && (
                  <td>
                    <button className="text-button danger" aria-label={`${p.nickname} 내보내기`} title="대기실에서 내보내기" disabled={busy} onClick={() => onKick(p.uid)}>
                      내보내기
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {participants.length === 0 && <p className="muted empty">아직 들어온 학생이 없어요. 방 코드나 QR을 보여 주세요.</p>}
    </div>
  );
}

/** One line on how far the current phase has got, with a bar. */
function ProgressStrip({ room, participants, rounds }: { room: Room; participants: Participant[]; rounds: Rounds }) {
  const phase = room.phase;
  const total = participants.length;
  const turn = room.turn?.stage === "qa" ? null : room.turn;
  let text = "";
  let done = 0;
  let of = Math.max(1, total);
  if (phase === "lobby") {
    done = participants.filter((p) => p.prefsDone).length;
    text = `역할 선택 ${done}/${total}명`;
  } else if (phase === "role" || phase === "vote") {
    done = participants.filter((p) => p.submitted.includes(phase)).length;
    text = `${phase === "role" ? "역할 확인" : "투표"} ${done}/${total}명`;
  } else if (turn) {
    of = turn.order.length;
    done = turn.index;
    text = `${turn.index + 1}/${of}번째 차례 · ${participants.find((p) => p.uid === turn.uid)?.nickname ?? ""}`;
  } else if (phase === "event" || phase === "rebuttal" || (phase === "statement" && room.turn?.stage === "qa")) {
    done = new Set(rounds.transcript.filter((l) => l.phase === phase).map((l) => l.uid)).size;
    text = `${room.turn?.stage === "qa" ? "발표 뒤 질의응답 · " : ""}${done}/${total}명 참여 · ${turnsSpoken(rounds, phase)}차례 발언`;
  } else {
    done = of;
    text = "모든 단계를 마쳤어요";
  }
  return (
    <div className="live-progress" data-testid="live-progress">
      <p className="live-progress-text">{text}</p>
      {turn ? (
        <ol className="turn-steps" aria-label="발표 순서">
          {turn.order.map((uid, i) => (
            <li key={`${uid}-${i}`} className={i < turn.index ? "done" : i === turn.index ? "now" : ""} title={participants.find((p) => p.uid === uid)?.nickname} />
          ))}
        </ol>
      ) : (
        <div className="progress live-bar">
          <i style={{ width: `${Math.min(100, (done / of) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export function GameSummary({ participants, rounds }: { participants: Participant[]; rounds: Rounds }) {
  const total = participants.length;
  const has = (key: string) => participants.filter((p) => p.submitted.includes(key)).length;
  const talked = (phase: SpeakingPhase) => new Set(rounds.transcript.filter((l) => l.phase === phase).map((l) => l.uid)).size;
  const rows = [
    ["역할 확인", `${has("role")}/${total}명`],
    ["입장 발표", `${talked("statement")}/${total}명`],
    ["사건 대응·질문·답변", `${talked("event")}/${total}명 · ${turnsSpoken(rounds, "event")}차례`],
    ...(talked("rebuttal") ? [["반론", `${talked("rebuttal")}/${total}명 · ${turnsSpoken(rounds, "rebuttal")}차례`]] : []),
    ["투표", `${rounds.reveal ? rounds.reveal.ballots.filter((b) => b.voted).length : has("vote")}/${total}명`],
  ];
  return (
    <section className="panel summary" data-testid="game-summary">
      <h3>참여 요약</h3>
      <p>
        참여 인원 <strong>{total}명</strong>
      </p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * During the game: one row per student, so the teacher reads down a column to see who has spoken,
 * asked, answered, checked their role and voted — and who has not said anything yet.
 */
export function ParticipationGrid({ room, participants, rounds, serverNow, speakingUid, floor, floorSeconds = 0, alwaysOnline = false }: { room: Room; participants: Participant[]; rounds: Rounds; serverNow: number; speakingUid?: string; floor?: Floor | null; floorSeconds?: number; alwaysOnline?: boolean }) {
  const turns = (uid: string, kind: string) => new Set(rounds.transcript.filter((l) => l.uid === uid && l.kind === kind).map((l) => l.turn)).size;
  const people = [...participants].sort((a, b) => a.seat - b.seat).map((p) => ({
    p,
    statement: turns(p.uid, "statement"),
    question: turns(p.uid, "question"),
    answer: turns(p.uid, "answer"),
    voted: p.submitted.includes("vote") || Boolean(rounds.reveal?.ballots.find((b) => b.uid === p.uid)?.voted),
  }));
  const total = participants.length;
  const order = ["role", "statement", "event", "vote", "reveal", "ended"];
  const reached = (phase: string) => order.indexOf(room.phase) >= order.indexOf(phase);
  // Quiet students stand out once there has been a chance to talk.
  const quiet = reached("event") ? people.filter((x) => x.statement + x.question + x.answer === 0) : [];
  const showVote = reached("vote");
  const sum = (key: "statement" | "question" | "answer") => people.filter((x) => x[key] > 0).length;
  return (
    <div className="participation-grid" data-testid="participation-grid">
      <ProgressStrip room={room} participants={participants} rounds={rounds} />
      {quiet.length > 0 && (
        <p className="participation-quiet" data-testid="quiet-students">
          아직 한 번도 말하지 않은 학생 <strong>{quiet.map((x) => x.p.nickname).join(", ")}</strong>
        </p>
      )}
      <div className="roster-scroll">
        <table className="roster">
          <thead>
            <tr>
              <th scope="col">학생</th>
              <th scope="col">지금</th>
              <th scope="col" className="num">발표</th>
              <th scope="col" className="num">질문</th>
              <th scope="col" className="num">답변</th>
              {showVote && <th scope="col" className="num">투표</th>}
              <th scope="col" className="num">연결</th>
            </tr>
          </thead>
          <tbody>
            {people.map(({ p, statement, question, answer, voted }) => {
              const online = alwaysOnline || serverNow - p.connectedAt < CONNECTED_MS;
              const silent = quiet.some((x) => x.p.uid === p.uid);
              const live = p.uid === floor?.uid;
              const inTurn = room.turn?.stage !== "qa" && p.uid === room.turn?.uid;
              const last = rounds.transcript.filter((line) => line.uid === p.uid && line.phase === room.phase).at(-1);
              const [tone, status] = live && floor
                ? ["now", `${KIND_LABEL[floor.kind]} 중${floorSeconds ? ` · ${floorSeconds}초` : ""}`]
                : inTurn ? ["now", "차례 · 마이크 대기"]
                : room.phase === "role" ? (p.submitted.includes("role") ? ["", "확인함"] : ["warn", "확인 전"])
                : room.phase === "vote" ? (voted ? ["", "투표함"] : ["warn", "투표 전"])
                : last && serverNow - last.at < RECENT_MS ? ["now", "방금 말함"]
                : room.turn?.stage === "qa" ? ["", "질문·답변 대기"]
                : room.phase === "event" ? (last ? ["", "이번 단계 발언함"] : ["", "질문·답변 전"])
                : room.phase === "statement" ? ["", "듣는 중"]
                : ["", "완료"];
              return (
                <tr key={p.uid} className={`${p.uid === speakingUid ? "speaking" : ""}${silent ? " silent" : ""}`} data-testid="participant-row">
                  <th scope="row">
                    <strong>{p.nickname}</strong>
                    <span>{p.roleId ? roleName(room.topic, p.roleId) : "역할 비공개"}</span>
                  </th>
                  <td>
                    <span className={`live-status ${tone}`} data-testid="live-status">
                      {status}
                    </span>
                  </td>
                  <td className="num">{statement ? "했음" : <span className="no">–</span>}</td>
                  <td className="num">{question || <span className="no">0</span>}</td>
                  <td className="num">{answer || <span className="no">0</span>}</td>
                  {showVote && <td className="num">{voted ? "했음" : <span className="no">–</span>}</td>}
                  <td className="num">
                    <span className={online ? "online" : "offline"}>{online ? "접속" : "끊김"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">합계 {total}명</th>
              <td />
              <td className="num">{sum("statement")}</td>
              <td className="num">{sum("question")}명</td>
              <td className="num">{sum("answer")}명</td>
              {showVote && <td className="num">{people.filter((x) => x.voted).length}</td>}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
