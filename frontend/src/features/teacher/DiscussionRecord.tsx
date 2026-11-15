import { useState } from "react";
import Tabs from "../../components/Tabs";
import type { Floor, Participant, Room, Rounds } from "../../types/game";
import { QuestionList, StatementList } from "../discussion/DiscussionNotes";
import TranscriptFeed from "../discussion/TranscriptFeed";
import type { RoomApi } from "../room/useRoom";

type View = "live" | "statements" | "questions";

/**
 * Everything said in the game, in one place: the live record (which the teacher can correct),
 * each statement in short, and the questions with their answers.
 */
export default function DiscussionRecord({
  room,
  participants,
  rounds,
  floor,
  speakingUid,
  busy,
  action,
}: {
  room: Room;
  participants: Participant[];
  rounds: Rounds;
  floor: Floor | null;
  speakingUid?: string;
  busy: boolean;
  action: RoomApi["action"];
}) {
  const [view, setView] = useState<View>("live");
  const questions = new Set(rounds.transcript.filter((l) => l.kind === "question").map((l) => l.turn)).size;
  return (
    <section className="panel record-panel" data-testid="transcript-panel">
      <div className="record-head">
        <h3>토론 기록</h3>
        <Tabs<View>
          label="토론 기록 보기"
          variant="line"
          active={view}
          onChange={setView}
          items={[
            { id: "live", label: "기록 고치기" },
            { id: "statements", label: "입장 발표 요약" },
            { id: "questions", label: `질문과 답변 ${questions}` },
          ]}
        />
      </div>
      <div className="record-body">
        {view === "live" && (
          <>
            <TranscriptFeed
              lines={rounds.transcript}
              participants={participants}
              topic={room.topic}
              speakingUid={speakingUid}
              emptyText="학생이 마이크를 켜고 말하면 여기에 글로 기록돼요."
              disabled={busy}
              onEdit={(lineId, text) => void action("line-edit", { lineId, text })}
              onDelete={(lineId) => void action("line-delete", { lineId })}
              questionsNow={room.phase === "event" || room.turn?.stage === "qa"}
            />
          </>
        )}
        {view === "statements" && <StatementList room={room} participants={participants} rounds={rounds} />}
        {view === "questions" && <QuestionList room={room} participants={participants} rounds={rounds} floor={floor} />}
      </div>
    </section>
  );
}
