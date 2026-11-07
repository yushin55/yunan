import { Check, Minus, UserX } from "lucide-react";
import type { Participant, Room, Rounds, SpeakingPhase } from "../../types/game";
import { roleName } from "../roles/roleName";

const CONNECTED_MS = 100_000;
/** Turns in which someone's words were recorded. Recognition cuts speech into lines, so lines mean little. */
const turnsSpoken = (rounds: Rounds, phase: SpeakingPhase, uid?: string) => new Set(rounds.transcript.filter((l) => l.phase === phase && (!uid || l.uid === uid)).map((l) => l.turn)).size;

/** Submission and participation status only. No preferences, no switcher status. */
export default function ParticipationBoard({
  room,
  participants,
  rounds,
  serverNow,
  onKick,
  busy,
}: {
  room: Room;
  participants: Participant[];
  rounds: Rounds;
  serverNow: number;
  onKick?: (uid: string) => void;
  busy?: boolean;
}) {
  const started = room.phase !== "lobby";
  const mark = (value: boolean) => (value ? <Check size={16} aria-label="완료" className="yes" /> : <Minus size={16} aria-label="아직" className="no" />);
  return (
    <div className="participation">
      <table>
        <thead>
          <tr>
            <th scope="col">학생</th>
            {!started && <th scope="col">역할 선택</th>}
            {started && <th scope="col">역할</th>}
            {started && <th scope="col">역할 확인</th>}
            {started && <th scope="col">입장 발표</th>}
            {started && <th scope="col">사건·질문</th>}
            {started && <th scope="col">투표</th>}
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
                {!started && <td>{p.prefsDone ? <span className="pill ok">완료</span> : <span className="pill">고르는 중</span>}</td>}
                {started && <td>{p.roleId ? roleName(room.topic, p.roleId) : <span className="muted">비공개</span>}</td>}
                {started && <td>{mark(p.submitted.includes("role"))}</td>}
                {started && <td>{turnsSpoken(rounds, "statement", p.uid)}</td>}
                {started && <td>{turnsSpoken(rounds, "event", p.uid)}</td>}
                {started && <td>{mark(p.submitted.includes("vote"))}</td>}
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

export function GameSummary({ participants, rounds }: { participants: Participant[]; rounds: Rounds }) {
  const total = participants.length;
  const has = (key: string) => participants.filter((p) => p.submitted.includes(key)).length;
  const talked = (phase: SpeakingPhase) => new Set(rounds.transcript.filter((l) => l.phase === phase).map((l) => l.uid)).size;
  const rows = [
    ["역할 확인", `${has("role")}/${total}명`],
    ["입장 발표", `${talked("statement")}/${total}명`],
    ["사건 대응·질문·답변", `${talked("event")}/${total}명 · ${turnsSpoken(rounds, "event")}차례`],
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
