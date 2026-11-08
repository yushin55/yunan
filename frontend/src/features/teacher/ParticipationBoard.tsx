import { UserX } from "lucide-react";
import type { Participant, Room, Rounds } from "../../types/game";
import { roleName } from "../roles/roleName";

const CONNECTED_MS = 100_000;

/** The lobby: who is here, connected and done choosing roles. No preferences are shown. */
export default function ParticipationBoard({ participants, serverNow, onKick, busy }: { participants: Participant[]; serverNow: number; onKick?: (uid: string) => void; busy?: boolean }) {
  return (
    <div className="participation">
      <table>
        <thead>
          <tr>
            <th scope="col">학생</th>
            <th scope="col">역할 선택</th>
            <th scope="col">연결</th>
            {onKick && <th scope="col" className="sr-only">내보내기</th>}
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => {
            const online = serverNow - p.connectedAt < CONNECTED_MS;
            return (
              <tr key={p.uid} data-testid="participant-row">
                <th scope="row">{p.nickname}</th>
                <td>{p.prefsDone ? <span className="pill ok">완료</span> : <span className="pill">고르는 중</span>}</td>
                <td>
                  <span className={`dot ${online ? "on" : "off"}`} /> {online ? "접속" : "끊김"}
                </td>
                {onKick && (
                  <td>
                    <button className="icon-button" aria-label={`${p.nickname} 내보내기`} title="대기실에서 내보내기" disabled={busy} onClick={() => onKick(p.uid)}>
                      <UserX size={16} />
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

/**
 * During the game: one card per student, so the teacher sees at a glance who has spoken, asked,
 * answered, checked their role and voted — and who has not said anything yet.
 */
export function ParticipationGrid({ room, participants, rounds, serverNow, speakingUid }: { room: Room; participants: Participant[]; rounds: Rounds; serverNow: number; speakingUid?: string }) {
  const turns = (uid: string, kind: string) => new Set(rounds.transcript.filter((l) => l.uid === uid && l.kind === kind).map((l) => l.turn)).size;
  const people = [...participants].sort((a, b) => a.seat - b.seat).map((p) => ({
    p,
    statement: turns(p.uid, "statement"),
    question: turns(p.uid, "question"),
    answer: turns(p.uid, "answer"),
  }));
  const total = participants.length;
  const someone = (key: "statement" | "question" | "answer") => people.filter((x) => x[key] > 0).length;
  const has = (key: string) => participants.filter((p) => p.submitted.includes(key)).length;
  const order = ["role", "statement", "event", "vote", "reveal", "ended"];
  const reached = (phase: string) => order.indexOf(room.phase) >= order.indexOf(phase);
  // Quiet students stand out once there has been a chance to talk.
  const quiet = reached("event") ? people.filter((x) => x.statement + x.question + x.answer === 0) : [];
  const chips: [string, string][] = [
    ["역할 확인", `${has("role")}/${total}`],
    ...(reached("statement") ? ([["입장 발표", `${someone("statement")}/${total}`]] as [string, string][]) : []),
    ...(reached("statement") ? ([["질문한 학생", `${someone("question")}/${total}`], ["답변한 학생", `${someone("answer")}/${total}`]] as [string, string][]) : []),
    ...(reached("vote") ? ([["투표", `${rounds.reveal ? rounds.reveal.ballots.filter((b) => b.voted).length : has("vote")}/${total}`]] as [string, string][]) : []),
  ];
  return (
    <div className="participation-grid" data-testid="participation-grid">
      <dl className="participation-chips">
        {chips.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {quiet.length > 0 && (
        <p className="participation-quiet" data-testid="quiet-students">
          아직 한 번도 말하지 않은 학생: <strong>{quiet.map((x) => x.p.nickname).join(", ")}</strong>
        </p>
      )}
      <ul className="student-cards">
        {people.map(({ p, statement, question, answer }) => {
          const online = serverNow - p.connectedAt < CONNECTED_MS;
          const silent = quiet.some((x) => x.p.uid === p.uid);
          return (
            <li key={p.uid} className={`student-card${p.uid === speakingUid ? " speaking" : ""}${silent ? " silent" : ""}`} data-testid="participant-row">
              <header>
                <span className={`dot ${online ? "on" : "off"}`} title={online ? "접속" : "끊김"} />
                <strong>{p.nickname}</strong>
                {p.uid === speakingUid && <em>말하는 중</em>}
              </header>
              <span className="student-card-role">{p.roleId ? roleName(room.topic, p.roleId) : "역할 비공개"}</span>
              <div className="student-card-stats">
                <span className={statement ? "on" : ""}>발표 {statement ? "✓" : "–"}</span>
                <span className={question ? "on" : ""}>질문 {question}</span>
                <span className={answer ? "on" : ""}>답변 {answer}</span>
              </div>
              <div className="student-card-steps">
                <span className={p.submitted.includes("role") ? "on" : ""}>역할 확인</span>
                {reached("vote") && <span className={p.submitted.includes("vote") || rounds.reveal?.ballots.find((b) => b.uid === p.uid)?.voted ? "on" : ""}>투표</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
