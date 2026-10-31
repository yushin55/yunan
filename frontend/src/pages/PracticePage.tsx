import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Bot, Flag, Play, RotateCcw, Shuffle, SkipForward } from "lucide-react";
import { PHASE_LABELS, PHASE_ORDER } from "../features/game/phases";
import { TOPICS } from "../features/practice/engine";
import { usePractice } from "../features/practice/usePractice";
import { rememberNickname, savedNickname } from "../features/room/roomStorage";
import Sheet from "../components/Sheet";
import TopicPicker from "../features/topics/TopicPicker";
import StudentRoomPage from "./StudentRoomPage";

/** Try the student side alone, with five computer partners and no server. */
export default function PracticePage() {
  const { api, started, begin, reset } = usePractice();
  if (!started || !api.state) return <PracticeSetup onBegin={begin} />;
  const room = api.state.room;
  const next = PHASE_ORDER[PHASE_ORDER.indexOf(room.phase) + 1];
  const prefsDone = Boolean(api.state.me?.preferences);
  return (
    <>
      <div className="practice-bar" role="region" aria-label="연습 진행">
        <span className="practice-note">
          <Bot size={16} aria-hidden /> <strong>연습 모드</strong> 함께하는 5명은 컴퓨터 연습 상대예요. 선생님 대신 내가 진행해요.
        </span>
        <div className="row">
          {room.phase !== "lobby" && room.phase !== "reveal" && room.phase !== "ended" && (
            <button className="button secondary small" data-testid="practice-next" onClick={() => void api.action("next")}>
              <SkipForward size={15} /> 다음 단계: {PHASE_LABELS[next]}
            </button>
          )}
          {room.phase === "reveal" && (
            <button className="button secondary small" onClick={() => void api.action("next")}>
              <Flag size={15} /> 게임 종료
            </button>
          )}
          <button
            className="button ghost small"
            onClick={() => {
              if (room.phase === "ended" || confirm("지금 연습을 그만두고 처음부터 다시 할까요?")) reset();
            }}
          >
            <RotateCcw size={15} /> {room.phase === "ended" ? "새 연습" : "처음부터"}
          </button>
        </div>
      </div>
      <StudentRoomPage
        api={api}
        lobbyAction={
          prefsDone && (
            <section className="panel practice-start-panel">
              <p>
                <strong>준비 완료!</strong> 연습 모드에서는 내가 선생님 대신 게임을 시작해요.
              </p>
              <button className="button primary full large" data-testid="practice-start" onClick={() => void api.action("start")}>
                <Play size={18} /> 게임 시작
              </button>
            </section>
          )
        }
      />
    </>
  );
}

/** Pick a topic card, press start, then give a nickname to sit down at the table. */
function PracticeSetup({ onBegin }: { onBegin: (nickname: string, topicId: string | null) => void }) {
  const [nickname, setNickname] = useState(savedNickname());
  // A topic card on the home page links here with ?topic= to preselect it.
  const [search] = useSearchParams();
  const [topicId, setTopicId] = useState<string | null>(() => TOPICS.find((t) => t.topicId === search.get("topic"))?.topicId ?? null);
  const [random, setRandom] = useState(false);
  const [asking, setAsking] = useState(false);
  const chosen = random || Boolean(topicId);
  const topic = TOPICS.find((t) => t.topicId === topicId);
  return (
    <main className="setup">
      <span className="eyebrow">혼자 연습하기</span>
      <h1>오늘 이야기할 주제를 골라 주세요</h1>
      <p className="muted">
        서버나 방 코드 없이 학생 화면으로 한 판을 끝까지 해 볼 수 있어요. 함께하는 5명은 역할 카드를 바탕으로 말하는 컴퓨터 연습 상대예요. 진행은 이 브라우저에만 저장돼요.
      </p>
      <TopicPicker
        topics={TOPICS}
        selected={random ? null : topicId}
        randomSelected={random}
        onSelect={(id) => {
          setTopicId(id);
          setRandom(false);
        }}
        onRandom={() => {
          setRandom(true);
          setTopicId(null);
        }}
      />
      <div className="setup-actions">
        <button className="button primary large" data-testid="practice-start-setup" disabled={!chosen} onClick={() => setAsking(true)}>
          {chosen ? (
            <>
              {random ? "무작위 주제로" : `‘${topic?.shortTitle}’ 주제로`} 시작 <ArrowRight size={18} />
            </>
          ) : (
            "주제 카드를 골라 주세요"
          )}
        </button>
        <Link to="/" className="button ghost large">
          처음으로
        </Link>
      </div>
      {asking && (
        <Sheet title="게임에서 쓸 닉네임" onClose={() => setAsking(false)}>
          <form
            className="nickname-form"
            onSubmit={(e) => {
              e.preventDefault();
              rememberNickname(nickname.trim());
              onBegin(nickname.trim(), random ? null : topicId);
            }}
          >
            <p className="muted">
              {random ? <Shuffle size={15} aria-hidden /> : null} {random ? "무작위 주제" : topic?.title}
            </p>
            <label className="field-label" htmlFor="practice-nickname">
              닉네임
            </label>
            <input id="practice-nickname" autoFocus value={nickname} maxLength={12} onChange={(e) => setNickname(e.target.value)} placeholder="게임에서 쓸 이름 (12자 이내)" />
            <button className="button primary full large" type="submit" data-testid="practice-begin" disabled={!nickname.trim()}>
              방에 들어가기 <ArrowRight size={18} />
            </button>
          </form>
        </Sheet>
      )}
    </main>
  );
}
