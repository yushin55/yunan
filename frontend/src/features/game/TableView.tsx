import { lazy, Suspense, useEffect, useState } from "react";
import type { HandCard, TablePlayer } from "../../components/scene/TableScene";
import type { Floor, Participant, Room, Rounds } from "../../types/game";
import { activeFloor, statementCards } from "../discussion/floor";
import { roleName } from "../roles/roleName";
import { KIND_LABEL } from "./phases";

const TableScene = lazy(() => import("../../components/scene/TableScene"));
const COLORS = ["#c98d66", "#aaad83", "#a2b3cf", "#86ad98", "#b09bbf", "#d9b263", "#739dba", "#c790a0"];
// The hand fills up once statements begin; before that it is just cards, face down.
const CARD_PHASES = ["statement", "event", "rebuttal", "vote", "reveal", "ended"];

function useNow(every: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/** Status shown on each name plate. Only public facts: nothing about preferences or switchers before the reveal. */
function status(room: Room, p: Participant, rounds: Rounds, floor: Floor | null): TablePlayer["status"] {
  const done = (key: string, yes: string, no: string) => (p.submitted.includes(key) ? { label: yes, tone: "done" as const } : { label: no, tone: "waiting" as const });
  switch (room.phase) {
    case "lobby":
      return p.prefsDone ? { label: "준비 완료", tone: "done" } : { label: "역할 고르는 중", tone: "waiting" };
    case "role":
      return done("role", "확인 완료", "역할 확인 중");
    case "statement":
    case "event":
    case "rebuttal":
      if (floor?.uid === p.uid) return { label: floor.kind === "statement" ? "말하는 중" : `${KIND_LABEL[floor.kind]} 중`, tone: "done" };
      return room.turn?.uid === p.uid ? { label: "차례", tone: "waiting" } : undefined;
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
  hand,
  pointAt,
}: {
  room: Room;
  participants: Participant[];
  rounds: Rounds;
  selfUid?: string;
  focusUid?: string;
  onSelect?: (uid: string) => void;
  offset?: number;
  /** Cards of my own to hold instead of the statements (my picks in the lobby, my role and identity). */
  hand?: HandCard[];
  pointAt?: string;
}) {
  const now = useNow(1000) + offset;
  const floor = activeFloor(room, now);
  const narrow = typeof window !== "undefined" && window.innerWidth < 700;
  const players: TablePlayer[] = participants.map((p) => ({
    uid: p.uid,
    nickname: p.nickname,
    order: CARD_PHASES.includes(room.phase) ? p.seat + 1 : undefined,
    color: COLORS[p.seat % COLORS.length],
    tag: p.roleId ? roleName(room.topic, p.roleId) : undefined,
    status: status(room, p, rounds, floor),
  }));
  // Once the event happens its card joins the hand, first in the fan.
  const eventCard: HandCard[] = room.event ? [{ uid: "event", name: "사건 카드", role: room.event.title, text: room.event.description, state: "speaking" }] : [];
  const cards = hand ?? (CARD_PHASES.includes(room.phase) ? [...eventCard, ...statementCards(room, participants, rounds, selfUid)] : undefined);
  return (
    <div className="table-view" data-testid="table-view">
      <Suspense
        fallback={
          <div className="page-loading">
            <span className="spinner" /> 원탁에 불을 켜는 중이에요.
          </div>
        }
      >
        <TableScene players={players} cards={cards} selfUid={selfUid} focusPlayerUid={focusUid} onPlayerSelect={onSelect} pointAt={pointAt} phase={room.phase} quality={narrow ? "low" : "high"} />
      </Suspense>
    </div>
  );
}
