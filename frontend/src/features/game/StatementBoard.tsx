import type { Participant, StatementRow, Topic } from "../../types/game";
import { roleName } from "../chat/ChatFeed";

/** Published statements in speaking (seat) order. */
export default function StatementBoard({ rows, participants, topic }: { rows: StatementRow[]; participants: Participant[]; topic: Topic }) {
  return (
    <ol className="statement-board" aria-label="입장 발표">
      {rows.map((row, i) => {
        const p = participants.find((x) => x.uid === row.uid);
        return (
          <li key={row.uid} className={row.timedOut ? "missing" : ""} data-testid="statement-row">
            <span className="turn">{i + 1}</span>
            <div>
              <div className="meta">
                <strong>{p?.nickname ?? "나간 참가자"}</strong>
                {p?.roleId && <span className="role-tag">{roleName(topic, p.roleId)}</span>}
              </div>
              <p>{row.timedOut ? "시간 안에 발표하지 않았어요." : row.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
