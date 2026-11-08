import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Bot, FastForward, Flag, Monitor, Play, RotateCcw, Shuffle, SkipForward, UserRound } from "lucide-react";
import { useAutoSummary } from "../features/discussion/useAutoSummary";
import { PHASE_ORDER, PHASE_SHORT } from "../features/game/phases";
import { TOPICS } from "../features/practice/engine";
import { usePractice } from "../features/practice/usePractice";
import type { Phase } from "../types/game";
import { rememberNickname, savedNickname } from "../features/room/roomStorage";
import Sheet from "../components/Sheet";
import TopicPicker from "../features/topics/TopicPicker";
import StudentRoomPage from "./StudentRoomPage";
import TeacherRoomPage from "./TeacherRoomPage";

/** Try both sides of the same offline game with five computer partners. */
export default function PracticePage() {
  const { api, teacherApi, started, begin, beginAt, reset } = usePractice();
  // /practice?view=teacher (or /teacher/preview) opens the teacher screen directly,
  // starting a practice game on ?topic= (or a random topic) if none is running yet.
  const [search, setSearch] = useSearchParams();
  const directTeacher = useRef(search.get("view") === "teacher");
  // There is no teacher to keep the summary fresh while the player is on the student screen.
  useAutoSummary(api.state?.rounds.transcript ?? [], () => api.quiet("summary"));
  const [teacherView, selectTeacherView] = useState(() => {
    try {
      return sessionStorage.getItem("bridge.practice.view") === "teacher";
    } catch {
      return false;
    }
  });
  const setTeacherView = (teacher: boolean) => {
    selectTeacherView(teacher);
    try {
      sessionStorage.setItem("bridge.practice.view", teacher ? "teacher" : "student");
    } catch {
      /* Switching still works when browser storage is unavailable. */
    }
    api.setError("");
  };
  useEffect(() => {
    if (!directTeacher.current) return;
    directTeacher.current = false;
    setTeacherView(true);
    const topicId = TOPICS.find((t) => t.topicId === search.get("topic"))?.topicId ?? null;
    const phase = PHASE_ORDER.find((p) => p === search.get("phase"));
    // A phase in the address always starts a fresh game at that phase; otherwise keep any game in progress.
    if (phase) beginAt(savedNickname() || "연습생", topicId ?? (started ? api.state?.room.topic.topicId ?? null : null), phase);
    else if (!started) begin(savedNickname() || "연습생", topicId);
    setSearch({}, { replace: true });
    // Runs once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!started || !api.state) return <PracticeSetup onBegin={(nickname, topicId, teacher = false) => {
    setTeacherView(teacher);
    begin(nickname, topicId);
  }} />;
  const room = api.state.room;
  const next = PHASE_ORDER[PHASE_ORDER.indexOf(room.phase) + 1];
  const prefsDone = Boolean(api.state.me?.preferences);
  const restart = () => {
    if (room.phase === "ended" || confirm("지금 연습을 그만두고 처음부터 다시 할까요?")) {
      reset();
      setTeacherView(false);
    }
  };
  // The stand-in teacher's buttons sit in the game bar instead of a separate strip.
  const controls = (
    <>
      <span className="practice-tag" title="함께하는 5명은 컴퓨터 연습 상대예요. 선생님 대신 내가 진행해요.">
        <Bot size={14} aria-hidden /> 연습
      </span>
      <button className="button secondary small" data-testid="practice-view-toggle" onClick={() => setTeacherView(!teacherView)}>
        {teacherView ? <UserRound size={15} /> : <Monitor size={15} />} {teacherView ? "학생 화면으로" : "선생님 화면 보기"}
      </button>
      {teacherView && (
        <select
          className="practice-phase-jump"
          data-testid="practice-phase-jump"
          aria-label="단계 바로 보기"
          title="이 단계로 새 연습 게임을 바로 열어요"
          value={room.phase}
          onChange={(e) => beginAt(savedNickname() || "연습생", room.topic.topicId, e.target.value as Phase)}
        >
          {PHASE_ORDER.map((p) => (
            <option key={p} value={p}>
              {PHASE_SHORT[p]}
            </option>
          ))}
        </select>
      )}
      {!teacherView && room.phase !== "lobby" && room.phase !== "reveal" && room.phase !== "ended" && (
        <button className="button secondary small" data-testid="practice-next" onClick={() => void api.action("next")}>
          <SkipForward size={15} /> {room.turn ? "다음 차례" : `다음: ${PHASE_SHORT[next]}`}
        </button>
      )}
      {!teacherView && room.turn && (
        <button className="button ghost small" data-testid="practice-skip" onClick={() => void api.action("skip-phase")}>
          <FastForward size={15} /> {PHASE_SHORT[next]}로
        </button>
      )}
      {!teacherView && room.phase === "reveal" && (
        <button className="button secondary small" onClick={() => void api.action("next")}>
          <Flag size={15} /> 게임 종료
        </button>
      )}
      {room.phase === "ended" ? (
        <button className="button ghost small" onClick={restart}>
          <RotateCcw size={15} /> 새 연습
        </button>
      ) : (
        <button className="icon-button" onClick={restart} aria-label="처음부터 다시" title="처음부터 다시">
          <RotateCcw size={16} />
        </button>
      )}
    </>
  );
  if (teacherView) return <TeacherRoomPage api={teacherApi} practice barControls={controls} />;
  return (
    <StudentRoomPage
      api={api}
      barControls={controls}
      micEngine="browser"
      allowTyping
      lobbyAction={
        prefsDone && (
          <section className="panel practice-start-panel">
            <p>
              <strong>준비 완료!</strong> 함께하는 5명은 컴퓨터 연습 상대예요. 선생님 대신 내가 게임을 시작하고, 위의 <strong>다음</strong> 버튼으로 단계를 넘겨요.
            </p>
            <button className="button primary full large" data-testid="practice-start" onClick={() => void api.action("start")}>
              <Play size={18} /> 게임 시작
            </button>
          </section>
        )
      }
    />
  );
}

/** Pick a topic card, press start, then give a name to sit down at the table. */
function PracticeSetup({ onBegin }: { onBegin: (nickname: string, topicId: string | null, teacher?: boolean) => void }) {
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
        서버나 방 코드 없이 학생 화면과 선생님 화면을 바꿔 가며 한 판을 해 볼 수 있어요. 함께하는 5명은 역할 카드를 바탕으로 말하는 컴퓨터 연습 상대이고, 나는 Z와 X 또는 버튼을 눌러 마이크로 말해요. 진행은 이 브라우저에만 저장돼요.
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
        <button className="button secondary large" data-testid="practice-teacher-setup" disabled={!chosen} onClick={() => onBegin(savedNickname() || "연습생", random ? null : topicId, true)}>
          <Monitor size={18} /> 선생님 화면 미리보기
        </button>
        <Link to="/" className="button ghost large">
          처음으로
        </Link>
      </div>
      {asking && (
        <Sheet title="이름을 알려 주세요" onClose={() => setAsking(false)}>
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
              이름
            </label>
            <input id="practice-nickname" autoFocus value={nickname} maxLength={12} onChange={(e) => setNickname(e.target.value)} placeholder="내 이름 (12자 이내)" />
            <button className="button primary full large" type="submit" data-testid="practice-begin" disabled={!nickname.trim()}>
              방에 들어가기 <ArrowRight size={18} />
            </button>
          </form>
        </Sheet>
      )}
    </main>
  );
}
