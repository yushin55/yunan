import { lazy, Suspense, useEffect, useState } from "react";
import type { TablePlayer } from "../../components/scene/TableScene";
import type { Participant, Room, Rounds } from "../../types/game";
import { roleName } from "../chat/ChatFeed";

const TableScene = lazy(() => import("../../components/scene/TableScene"));
const COLORS = ["#c98d66", "#aaad83", "#a2b3cf", "#86ad98", "#b09bbf", "#d9b263", "#739dba", "#c790a0"];
const BUBBLE_MS = 25_000;

function useNow(every: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/** Status shown on each name plate. Only public facts: nothing about preferences or switchers before the reveal. */
function status(room: Room, p: Participant, rounds: Rounds): TablePlayer["status"] {
  const done = (key: string, yes: string, no: string) => (p.submitted.includes(key) ? { label: yes, tone: "done" as const } : { label: no, tone: "waiting" as const });
  switch (room.phase) {
    case "lobby":
      return p.prefsDone ? { label: "준비 완료", tone: "done" } : { label: "역할 고르는 중", tone: "waiting" };
    case "role":
      return done("role", "확인 완료", "역할 확인 중");
    case "statement":
      return done("statement", "발표 완료", "작성 중");
    case "vote":
      return done("vote", "투표 완료", "고민 중");
    case "reveal":
    case "ended": {
      const reveal = rounds.reveal;
      if (!reveal) return undefined;
      const votes = reveal.tally.find((t) => t.uid === p.uid)?.votes ?? 0;
      return reveal.switchers.some((s) => s.uid === p.uid)
        ? { label: `역할 전환자 · ${votes}표`, tone: "alert" }
        : { label: `${votes}표`, tone: "waiting" };
    }
    default:
      return undefined;
  }
}

export default function TableView({
  room,
  participants,
  rounds,
  selfUid,
  focusUid,
  onSelect,
  offset = 0,
}: {
  room: Room;
  participants: Participant[];
  rounds: Rounds;
  selfUid?: string;
  focusUid?: string;
  onSelect?: (uid: string) => void;
  offset?: number;
}) {
  const now = useNow(3000) + offset;
  const narrow = typeof window !== "undefined" && window.innerWidth < 700;
  const players: TablePlayer[] = participants.map((p) => {
    const latest = [...rounds.chat].reverse().find((m) => m.uid === p.uid && m.phase === room.phase);
    const speaking = latest && now - latest.at < BUBBLE_MS;
    return {
      uid: p.uid,
      nickname: p.nickname,
      color: COLORS[p.seat % COLORS.length],
      tag: p.roleId ? roleName(room.topic, p.roleId) : undefined,
      status: status(room, p, rounds),
      bubble: speaking ? latest.text : undefined,
      bubbleKind: speaking ? latest.kind : undefined,
    };
  });
  return (
    <div className="table-view" data-testid="table-view">
      <Suspense
        fallback={
          <div className="page-loading">
            <span className="spinner" /> 원탁에 불을 켜는 중이에요.
          </div>
        }
      >
        <TableScene players={players} selfUid={selfUid} focusPlayerUid={focusUid} onPlayerSelect={onSelect} phase={room.phase} quality={narrow ? "low" : "high"} />
      </Suspense>
    </div>
  );
}
