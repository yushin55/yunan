import { useEffect, useState } from "react";
import type { Floor, Participant, Room, Rounds, SpeechKind, TranscriptLine } from "../../types/game";
import { roleName } from "../roles/roleName";

/** The microphone, unless its time ran out. A speaker whose device died still frees it for everyone. */
export function activeFloor(room: Room, serverNow: number): Floor | null {
  return room.floor && room.floor.endsAt > serverNow ? room.floor : null;
}

/** Re-renders while someone holds the microphone, so its countdown and its expiry show on time. */
export function useFloor(room: Room, offset: number) {
  const [now, setNow] = useState(Date.now());
  const held = Boolean(room.floor);
  useEffect(() => {
    if (!held) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [held]);
  const serverNow = Math.max(now, Date.now()) + offset;
  const floor = activeFloor(room, serverNow);
  return { floor, seconds: floor ? Math.ceil((floor.endsAt - serverNow) / 1000) : 0 };
}

export interface StatementCard {
  uid: string;
  /** Speaking order: the first person's statement is card 1. */
  order: number;
  name: string;
  role: string;
  /** The AI's short version once there is one, otherwise everything they said. */
  text: string;
  /** Everything they said, word for word. */
  full: string;
  state: "waiting" | "speaking" | "done";
}

/**
 * One card per person: their statement, summed up, with every word they said kept beside it.
 * The list on the desk and the cards in hand both read this.
 */
export function statementCards(room: Room, participants: Participant[], rounds: Rounds, myUid?: string): StatementCard[] {
  const turn = room.phase === "statement" ? room.turn : null;
  return participants.map((p) => {
    const said = rounds.transcript.filter((l) => l.uid === p.uid && l.kind === "statement");
    const summary = rounds.summary?.statements?.find((s) => s.uid === p.uid)?.text;
    const place = turn ? turn.order.lastIndexOf(p.uid) : -1;
    const state = turn?.uid === p.uid ? "speaking" : turn && place > turn.index ? "waiting" : "done";
    return {
      uid: p.uid,
      order: p.seat + 1,
      name: p.uid === myUid ? "나" : p.nickname,
      role: roleName(room.topic, p.roleId),
      text: summary ?? said.map((l) => l.text).join(" "),
      full: said.map((l) => l.text).join(" "),
      state,
    };
  });
}

export interface ExchangeRow {
  key: number;
  uid: string;
  kind: SpeechKind;
  text: string;
  /** Said by the person holding the microphone now, and not written down yet. */
  pending?: boolean;
}

/** Questions, answers and rebuttals in the order they were said, one row per time someone spoke. */
export function exchangeRows(lines: TranscriptLine[], floor: Floor | null): ExchangeRow[] {
  const rows: ExchangeRow[] = [];
  for (const line of lines) {
    if (line.kind === "statement") continue;
    const last = rows.at(-1);
    if (last?.key === line.turn) last.text += ` ${line.text}`;
    else rows.push({ key: line.turn, uid: line.uid, kind: line.kind, text: line.text });
  }
  if (floor && floor.kind !== "statement" && !rows.some((row) => row.key === floor.version)) rows.push({ key: floor.version, uid: floor.uid, kind: floor.kind, text: "", pending: true });
  return rows;
}
