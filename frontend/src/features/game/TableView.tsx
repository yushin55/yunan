import { lazy, Suspense, useEffect, useState } from "react";
import type { TablePlayer } from "../../components/scene/TableScene";
import { SEAT_COLORS } from "../../components/scene/palette";
import type { Floor, Participant, Room, Rounds } from "../../types/game";
import { activeFloor, statementCards } from "../discussion/floor";
import { roleName } from "../roles/roleName";
import CardStrip, { type TableCard } from "./CardStrip";
import { KIND_LABEL } from "./phases";

const TableScene = lazy(() => import("../../components/scene/TableScene"));
// During voting the cards start folded so the pointing hand stays visible.
const CARD_PHASES = ["statement", "event", "vote"];

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
      return room.turn?.uid === p.uid && room.turn.stage !== "qa" ? { label: "차례", tone: "waiting" } : undefined;
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
  overview = false,
  voteCardsOpen = false,
}: {
  room: Room;
  participants: Participant[];
  rounds: Rounds;
  selfUid?: string;
  focusUid?: string;
  onSelect?: (uid: string) => void;
  offset?: number;
  /** Cards of my own to show instead of the statements (my picks in the lobby, my role and identity). */
  hand?: TableCard[];
  pointAt?: string;
  /** The classroom screen: the whole table from above, no seat and no cards. */
  overview?: boolean;
  /** During voting the cards stay folded until the vote panel's "발언 카드 보기" opens them. */
  voteCardsOpen?: boolean;
}) {
  const now = useNow(1000) + offset;
  const floor = activeFloor(room, now);
  const narrow = typeof window !== "undefined" && window.innerWidth < 700;
  const players: TablePlayer[] = participants.map((p) => ({
    uid: p.uid,
    nickname: p.nickname,
    order: room.phase !== "lobby" && room.phase !== "role" ? p.seat + 1 : undefined,
    color: SEAT_COLORS[p.seat % SEAT_COLORS.length],
    tag: p.roleId ? roleName(room.topic, p.roleId) : undefined,
    status: status(room, p, rounds, floor),
  }));
  // Once the event happens its card comes first.
  const eventCard: TableCard[] = room.event ? [{ uid: "event", name: room.event.title, role: "사건 발생", text: room.event.description, state: "done", tone: "event" }] : [];
  const nameOf = (uid: string) => (uid === selfUid ? "나" : (participants.find((p) => p.uid === uid)?.nickname ?? "나간 참가자"));
  const record = (uid: string) => {
    const rows: NonNullable<TableCard["record"]> = [];
    // The question last asked before each answer: that is what the answer is about.
    let question = null as { key: number; uid: string; text: string } | null;
    for (const line of rounds.transcript) {
      if (line.kind === "question") {
        if (question?.key === line.turn) question.text += ` ${line.text}`;
        else question = { key: line.turn, uid: line.uid, text: line.text };
      }
      if (line.uid !== uid) continue;
      const last = rows.at(-1);
      if (last?.key === line.turn) last.text += ` ${line.text}`;
      else rows.push({ key: line.turn, kind: KIND_LABEL[line.kind], text: line.text, about: line.kind === "answer" && question ? `${nameOf(question.uid)}: ${question.text}` : undefined });
    }
    return rows;
  };
  const seatColor = (uid: string) => SEAT_COLORS[(participants.find((p) => p.uid === uid)?.seat ?? 0) % SEAT_COLORS.length];
  // The card holds only the AI's one-line summary; every word is one press away.
  const summaryOf = (uid: string) => rounds.summary?.statements?.find((s) => s.uid === uid)?.text ?? "";
  const statements = () =>
    statementCards(room, participants, rounds, selfUid, floor?.uid).map((c) => {
      const lines = record(c.uid);
      return { ...c, text: summaryOf(c.uid), record: lines, summarizing: lines.some((l) => l.kind === KIND_LABEL.statement), color: seatColor(c.uid) };
    });
  const cards = overview ? undefined : hand ?? (CARD_PHASES.includes(room.phase) ? [...eventCard, ...statements()] : undefined);
  const voting = room.phase === "vote";
  const showCards = Boolean(cards?.length) && (!voting || voteCardsOpen);
  return (
    <div className={`table-view${showCards ? " with-cards" : ""}`} data-testid="table-view">
      <div className="table-view-scene">
      <Suspense
        fallback={
          <div className="page-loading">
            <span className="spinner" /> 원탁에 불을 켜는 중이에요.
          </div>
        }
      >
        <TableScene players={players} selfUid={selfUid} focusPlayerUid={focusUid} onPlayerSelect={onSelect} pointAt={pointAt} overview={overview} phase={room.phase} quality={narrow ? "low" : "high"} />
      </Suspense>
      </div>
      {showCards && cards ? <CardStrip key={room.phase} cards={cards} /> : null}
    </div>
  );
}
