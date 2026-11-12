import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RoleAvatar from "../features/roles/RoleAvatar";
import { ArrowRight, BookOpen, Check, EyeOff, Maximize2, Minimize2, Search, VenetianMask, X } from "lucide-react";
import EventCard from "../components/EventCard";
import GameBar from "../components/GameBar";
import PauseOverlay from "../components/PauseOverlay";
import RoleCard from "../components/RoleCard";
import Sheet from "../components/Sheet";
import IssueBriefing from "../features/briefing/IssueBriefing";
import RulesVideo from "../features/briefing/RulesVideo";
import { introElapsed } from "../features/briefing/intro";
import { MemoPad, QuestionList, StatementList } from "../features/discussion/DiscussionNotes";
import { useFloor } from "../features/discussion/floor";
import MicControls from "../features/discussion/MicControls";
import type { SpeechEngine } from "../features/discussion/useSpeechCapture";
import { RULES, SPEAKING, STUDENT_TODO } from "../features/game/phases";
import TableView from "../features/game/TableView";
import { allReady, StartCountdown, useAutoStart } from "../features/game/useAutoStart";
import type { TableCard } from "../features/game/CardStrip";
import PreferencePicker from "../features/roles/PreferencePicker";
import { IdentityBanner } from "../features/roles/SecretRole";
import type { RoomApi } from "../features/room/useRoom";
import RevealView from "../features/voting/RevealView";
import VotePanel, { togglePick } from "../features/voting/VotePanel";
import { roleName } from "../features/roles/roleName";
import type { Me, Participant, Reveal, Role, Room, Rounds } from "../types/game";

function stored(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "on";
  } catch {
    return fallback;
  }
}

/** Cards in my own hand before the statements: my two picks in the lobby, then my role and who I am. */
function ownHand(room: Room, me: Me): TableCard[] | undefined {
  if (room.phase === "lobby" && me.preferences)
    return [me.preferences.first, me.preferences.second].map((id, i) => {
      const role = room.topic.roles.find((r) => r.id === id);
      return { uid: `pick${i}`, order: i + 1, name: role?.name ?? "", role: `${i + 1}순위`, text: role?.goal ?? "", state: "done" };
    });
  // While roles are checked the role card pop-up already shows both cards; none under the table.
  if (room.phase === "role") return [];
  return undefined;
}

/**
 * `barControls` sit inside the game bar (practice mode puts its next-step buttons there) and
 * `startIn` is practice's start countdown. Practice has no server, so it hears through the
 * browser's own recognition (`micEngine`) and can fall back to typing (`allowTyping`).
 */
export default function StudentRoomPage({ api, startIn, barControls, micEngine = "server", allowTyping }: { api: RoomApi; startIn?: number | null; barControls?: React.ReactNode; micEngine?: SpeechEngine; allowTyping?: boolean }) {
  const { state, action, busy, error, offset, online } = api;
  const { room, participants, rounds } = state!;
  const me = state!.me!;
  const [roleOpen, setRoleOpen] = useState(false);
  // The person picked at the table, to turn and look at them.
  const [focus, setFocus] = useState("");
  const [votePicked, setVotePicked] = useState<string[]>([]);
  const [show3d, setShow3d] = useState(() => stored("bridge.table3d", true));
  const [memoOpen, setMemoOpen] = useState(true);
  const self = participants.find((p) => p.uid === me.uid);
  const myRole = room.topic.roles.find((r) => r.id === me.roleId);
  const others = participants.filter((p) => p.uid !== me.uid);
  const phase = room.phase;
  const secretStillHidden = phase !== "reveal" && phase !== "ended";
  // At the 3D table the table fills the screen and everything else floats over it.
  const fullStage = show3d;
  // In a real room the server starts the game; this only shows the same countdown.
  const ownCount = useAutoStart(startIn === undefined && allReady(room, participants));
  const countdown = startIn === undefined ? ownCount : startIn;
  const count = room.settings.switcherCount;
  // After a reload my pick comes back from the vote the server has.
  const picked = votePicked.length ? votePicked : (me.vote ?? []);
  const pointAt = phase === "vote" ? picked.at(-1) : undefined;
  // The camera follows each speaker during the statements; during questions it stays put.
  const talking = phase === "statement" && room.turn?.stage !== "qa" ? room.turn?.uid : undefined;
  const autoFocus = talking !== me.uid ? talking : undefined;

  // Pointing at someone picks them, and every full pick goes in as my vote right away. The server
  // keeps the latest one until time runs out.
  const pick = (uid: string) => {
    if (room.paused) return;
    const next = togglePick(picked, uid, count);
    setVotePicked(next);
    if (next.length === count) void action("vote", { targets: next });
  };
  const selectAtTable = (uid: string) => {
    if (phase === "vote") return pick(uid);
    setFocus((current) => (current === uid ? "" : uid));
  };
  const toggle3d = () =>
    setShow3d((value) => {
      try {
        localStorage.setItem("bridge.table3d", value ? "off" : "on");
      } catch {
        /* ignore */
      }
      return !value;
    });

  // Big things in the middle of the table: my role, the result.
  const center = (
    <>
      {phase === "role" && myRole && <RoleZoom me={me} role={myRole} roles={room.topic.roles} confirmed={Boolean(self?.submitted.includes("role"))} disabled={busy || room.paused} onConfirm={() => void action("confirm-role")} />}
      {(phase === "reveal" || phase === "ended") && rounds.reveal && <ResultPopup key={phase} reveal={rounds.reveal} participants={participants} room={room} me={me} />}
      {phase === "lobby" && <LobbyFlow key={`${room.topicId}.${room.createdAt}`} room={room} me={me} participants={participants} busy={busy} offset={offset} bare onPrefs={(first, second) => void action("preferences", { first, second })} />}
    </>
  );
  // Small things at the side: the microphone, the questions, my memo, the vote.
  const side = (
    <>
      {fullStage && error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {SPEAKING.includes(phase) && <MicPopup room={room} me={me} api={api} micEngine={micEngine} allowTyping={allowTyping} />}
      {!show3d && room.event && SPEAKING.includes(phase) && <EventCard key={phase} event={room.event} collapsible defaultOpen={phase === "event"} />}
      {(phase === "event" || (phase === "statement" && room.turn?.stage === "qa")) && <QuestionsPopup rounds={rounds} participants={participants} me={me} room={room} offset={offset} />}
      {!show3d && SPEAKING.includes(phase) && (
        <details className="panel float-pop" open={phase === "statement"}>
          <summary>입장 발표 정리</summary>
          <StatementList room={room} participants={participants} rounds={rounds} myUid={me.uid} />
        </details>
      )}
      {phase === "vote" && (
        <section className="panel float-pop vote-pop">
          <VotePanel atTable={show3d} candidates={others} count={count} myVote={me.vote} picked={picked} onPick={pick} disabled={room.paused} />
        </section>
      )}
      {/* From the role card to the result: the same memo the whole game, open unless closed. */}
      {phase !== "lobby" && (
        <details className="panel float-pop memo-pop" open={memoOpen} onToggle={(e) => setMemoOpen(e.currentTarget.open)}>
          <summary>내 메모</summary>
          <MemoPad key={room.roomId} room={room} />
        </details>
      )}
    </>
  );

  return (
    <main className={`student-room${fullStage ? " full-stage" : ""}`}>
      <GameBar
        room={room}
        offset={offset}
        nickname={self?.nickname}
        roleLabel={myRole?.name}
        switcher={Boolean(me.isSwitcher) && secretStillHidden}
        onRole={() => setRoleOpen(true)}
        show3d={show3d}
        onToggle3d={toggle3d}
        online={online}
        extra={barControls}
      />
      {!online && <p className="banner warn">연결이 끊겼어요. 다시 연결되면 지금 단계와 내 역할로 자동으로 돌아와요.</p>}

      <StartCountdown left={countdown} />
      <div className={`room-layout${show3d ? " with-table" : ""}${fullStage ? " full-stage" : ""}`}>
        {show3d && (
          <div className="stage">
            <TableView
              room={room}
              participants={participants}
              rounds={rounds}
              selfUid={me.uid}
              focusUid={autoFocus ?? (focus || undefined)}
              onSelect={selectAtTable}
              offset={offset}
              hand={ownHand(room, me)}
              pointAt={pointAt}
            />
            {fullStage && (
              <>
                <div className="stage-center">{center}</div>
                <aside className="stage-panels" aria-label="게임 도구">
                  {side}
                </aside>
              </>
            )}
          </div>
        )}
        {!fullStage && (
          <div className="desk">
            {!room.paused && (
              <p className="todo-callout" data-testid="todo">
                <span>지금 할 일</span>
                {STUDENT_TODO[phase]}
              </p>
            )}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            {phase === "lobby" && <LobbyFlow key={`${room.topicId}.${room.createdAt}`} room={room} me={me} participants={participants} busy={busy} offset={offset} onPrefs={(first, second) => void action("preferences", { first, second })} />}
            {phase !== "lobby" && (
              <>
                {center}
                {side}
                <Roster participants={participants} room={room} />
              </>
            )}
          </div>
        )}
        {room.paused && <PauseOverlay />}
      </div>

      {phase === "event" && room.event && <EventPopup room={room} />}
      {roleOpen && myRole && (
        <Sheet title="나의 역할" onClose={() => setRoleOpen(false)}>
          <p className="privacy-line">이 화면은 나에게만 보여요.</p>
          {secretStillHidden && <IdentityBanner me={me} />}
          <RoleCard role={myRole} label="나의 역할" />
        </Sheet>
      )}
    </main>
  );
}

/**
 * Before the game: watch the issue briefing, watch the rules, then pick roles. These steps fill
 * the whole screen; once roles are chosen the student is back in the lobby around the table.
 */
/** `bare`: at the 3D table the lobby shows nothing but the characters, so the summaries step aside. */
function LobbyFlow({ room, me, participants, busy, offset, onPrefs, bare }: { room: Room; me: Me; participants: Participant[]; busy: boolean; offset: number; onPrefs: (first: string, second: string) => void; bare?: boolean }) {
  const key = `bridge.briefed.${room.roomId}.${room.createdAt}.${room.topicId}`;
  const [briefed, setBriefed] = useState(() => {
    try {
      return Boolean(me.preferences) || sessionStorage.getItem(key) === "1";
    } catch {
      return Boolean(me.preferences);
    }
  });
  const [videoDone, setVideoDone] = useState(false);
  const [rulesRead, setRulesRead] = useState(Boolean(me.preferences));
  const [rulesWatched, setRulesWatched] = useState(false);
  const [rechoosing, setRechoosing] = useState(false);
  // "나가기" closes the full-screen steps; the lobby then offers to continue where they stopped.
  const [away, setAway] = useState(false);
  // A real room: the teacher decides when the class watches each video, and everyone watches together.
  // Practice rooms have no `intro` and go at the student's own pace.
  const led = room.intro;
  const step = led ? { waiting: 0, briefing: 0, rules: 1, roles: 2 }[led.step] : !briefed ? 0 : !rulesRead ? 1 : 2;
  // The teacher moving on pulls everyone back in, even someone who stepped out.
  useEffect(() => {
    if (led) setAway(false);
  }, [led?.step, led?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishBriefing = () => {
    setBriefed(true);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  };

  if (step === 2 && me.preferences && !rechoosing && bare) return null;
  if (step === 2 && me.preferences && !rechoosing)
    return (
      <>
        <section className="panel">
          <PreferencePicker roles={room.topic.roles} saved={me.preferences} busy={busy} onSubmit={onPrefs} onEdit={() => setRechoosing(true)} />
        </section>
        <Roster participants={participants} room={room} />
      </>
    );

  // Until a video ends the bar only explains how to move on; at the end the video itself
  // offers "다시 보기" or the next step.
  if (away && bare)
    return (
      <button className="button primary large lobby-resume" data-testid="flow-resume" onClick={() => setAway(false)}>
        준비 이어서 하기 <ArrowRight size={18} />
      </button>
    );
  if (away)
    return (
      <>
        <section className="panel resume-panel" data-testid="flow-resume">
          <strong>아직 준비가 끝나지 않았어요</strong>
          <p className="muted">{["이슈 브리핑", "게임 규칙", "역할 고르기"][step]} 단계에서 멈췄어요. 역할을 골라야 게임에 참여할 수 있어요.</p>
          <button className="button primary full large" onClick={() => setAway(false)}>
            이어서 하기 <ArrowRight size={18} />
          </button>
        </section>
        <Roster participants={participants} room={room} />
      </>
    );

  const action = led ? null : step === 0 && !videoDone ? (
      <button className="button primary large" data-testid="briefing-done" disabled>
        브리핑을 끝까지 보면 다음으로 넘어갈 수 있어요
      </button>
    ) : step === 1 && !rulesWatched ? (
      <button className="button primary large" data-testid="rules-done" disabled>
        규칙 영상을 끝까지 보면 역할을 고를 수 있어요
      </button>
    ) : null;

  return (
    <FlowOverlay step={step} action={action} onExit={() => setAway(true)}>
      {step === 0 && (
        <>
          <div className="flow-heading">
            <span className="eyebrow">오늘의 주제</span>
            <h2>{room.topic.title}</h2>
          </div>
          {led?.step === "waiting" ? (
            <div className="intro-waiting" data-testid="intro-waiting">
              <strong>선생님이 영상을 시작하면 다 함께 봐요</strong>
            </div>
          ) : led ? (
            <IssueBriefing key={led.startedAt} briefing={room.topic.briefing} topicId={room.topicId} headline={room.topic.shortTitle} startAt={introElapsed(led, offset)} />
          ) : (
            <IssueBriefing
              briefing={room.topic.briefing}
              topicId={room.topicId}
              headline={room.topic.shortTitle}
              onFinish={() => setVideoDone(true)}
              onNext={finishBriefing}
              nextLabel="다음: 게임 규칙"
            />
          )}
        </>
      )}
      {step === 1 && (
        <>
          <div className="flow-heading">
            <span className="eyebrow">
              <BookOpen size={14} aria-hidden /> 게임 규칙
            </span>
            <h2>테이블에서는 이렇게 진행돼요</h2>
          </div>
          {led ? (
            <RulesVideo key={led.startedAt} startAt={introElapsed(led, offset)} />
          ) : (
            <RulesVideo onFinish={() => setRulesWatched(true)} onNext={() => setRulesRead(true)} nextLabel="역할 고르러 가기" />
          )}
          <details className="rules-text">
            <summary>규칙을 글로 보기</summary>
            <ol className="rules-list">
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <p className="muted small">게임 속 상황: {room.topic.situation}</p>
          </details>
        </>
      )}
      {step === 2 && (
        <>
          <div className="flow-heading">
            <span className="eyebrow">역할 고르기</span>
            <h2>{room.topic.shortTitle} · 내 생각과 가까운 역할은?</h2>
          </div>
          <PreferencePicker
            roles={room.topic.roles}
            saved={null}
            initial={me.preferences}
            busy={busy}
            onSubmit={(first, second) => {
              setRechoosing(false);
              onPrefs(first, second);
            }}
          />
        </>
      )}
    </FlowOverlay>
  );
}

/** The pre-game steps take over the whole screen, with a browser full-screen toggle. */
function FlowOverlay({ step, action, onExit, children }: { step: number; action: React.ReactNode; onExit: () => void; children: React.ReactNode }) {
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const change = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", change);
    // Lock the page behind the overlay while it is open.
    document.body.classList.add("flow-open");
    return () => {
      document.removeEventListener("fullscreenchange", change);
      document.body.classList.remove("flow-open");
    };
  }, []);
  const steps = ["이슈 브리핑", "게임 규칙", "역할 고르기"];
  return (
    <div className="flow-overlay" role="dialog" aria-modal="true" aria-label="게임 시작 전 준비" data-testid="flow-overlay">
      <header className="flow-top">
        <span className="brand-mark">
          브릿지<span>.</span>
        </span>
        <ol className="lobby-steps" aria-label="시작 전 준비">
          {steps.map((label, i) => (
            <li key={label} className={i < step ? "done" : i === step ? "current" : ""} aria-current={i === step ? "step" : undefined}>
              <span className="num">{i < step ? <Check size={14} /> : i + 1}</span>
              <span className="step-label">{label}</span>
            </li>
          ))}
        </ol>
        <button
          className="icon-button"
          onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
          aria-label={full ? "전체 화면 나가기" : "전체 화면"}
          title={full ? "전체 화면 나가기" : "전체 화면"}
        >
          {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button
          className="button ghost small flow-exit"
          data-testid="flow-exit"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            onExit();
          }}
        >
          <X size={16} /> 나가기
        </button>
      </header>
      <div className="flow-body">{children}</div>
      {action && <footer className="flow-action">{action}</footer>}
    </div>
  );
}

/** My role and who I am: the two cards in my hand, held up close. Only on my own screen. */
function RoleZoom({ me, role, roles, confirmed, disabled, onConfirm }: { me: Me; role: Role; roles: Role[]; confirmed: boolean; disabled: boolean; onConfirm: () => void }) {
  const switcher = Boolean(me.isSwitcher);
  return (
    <section className="panel role-zoom" role="dialog" aria-label="나의 역할 카드" data-testid="role-zoom">
      <p className="privacy-line">
        <EyeOff size={15} aria-hidden /> 나에게만 보이는 카드예요
      </p>
      <div className="zoom-cards">
        <article className="game-card role" aria-label={`나의 역할: ${role.name}`}>
          <header className="game-card-top">
            <span>나의 역할</span>
          </header>
          <div className="game-card-art">
            <RoleAvatar name={role.name} index={roles.findIndex((r) => r.id === role.id)} />
          </div>
          <h3 className="game-card-name">{role.name}</h3>
          <div className="game-card-text">
            <p className="game-card-intro">{role.intro}</p>
            <p>
              <b>목표</b> {role.goal}
            </p>
            <p>
              <b>걱정</b> {role.concerns.join(" ")}
            </p>
          </div>
        </article>
        <article className={`game-card id-card${switcher ? " switcher" : ""}`} data-testid="identity" aria-label={switcher ? "역할 전환자" : "일반 참가자"}>
          <header className="game-card-top">
            <span>나만 아는 정체</span>
          </header>
          <div className="game-card-art">{switcher ? <VenetianMask size={96} strokeWidth={1.4} aria-hidden /> : <Search size={96} strokeWidth={1.4} aria-hidden />}</div>
          <h3 className="game-card-name">{switcher ? "역할 전환자" : "일반 참가자"}</h3>
          <div className="game-card-text">
            <p>{switcher ? "내가 고르지 않은 역할이에요. 들키지 않게 자연스럽게 말해요." : "누가 역할 전환자인지 찾아보세요."}</p>
          </div>
        </article>
      </div>
      {confirmed ? (
        <p className="success-line role-zoom-done">
          <Check size={18} aria-hidden /> 확인했어요
        </p>
      ) : (
        <button className="button primary large" disabled={disabled} onClick={onConfirm}>
          역할을 확인했어요
        </button>
      )}
    </section>
  );
}

/** The microphone, small in the corner: just the buttons, which stay off until the microphone is free. */
function MicPopup({ room, me, api, micEngine, allowTyping }: { room: Room; me: Me; api: RoomApi; micEngine: SpeechEngine; allowTyping?: boolean }) {
  const mine = room.turn?.uid === me.uid && room.turn.stage !== "qa";
  const note = mine ? "내 차례예요" : "";
  return (
    <div className={`panel float-pop mic-popup${mine ? " mine" : ""}`} data-testid="floor-card" aria-live="polite">
      {note && <p className="mic-note">{note}</p>}
      <MicControls room={room} me={me} api={api} engine={micEngine} allowTyping={allowTyping} />
    </div>
  );
}

/** Just the event card, once, when it happens. Only its × (or Esc) closes it, so a stray click does not. */
function EventPopup({ room }: { room: Room }) {
  const key = `bridge.eventSeen.${room.roomId}.${room.createdAt}`;
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(key) !== "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!open || !room.event) return null;
  function close() {
    setOpen(false);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* It may show once more after a reload. */
    }
  }
  return (
    <div className="event-pop" role="dialog" aria-modal="true" aria-label={`사건 카드: ${room.event.title}`} data-testid="event-popup">
      <div className="event-pop-card">
        <EventCard event={room.event} />
        <button className="icon-button event-pop-close" aria-label="닫기" data-testid="event-popup-close" autoFocus onClick={close}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function QuestionsPopup({ rounds, participants, me, room, offset }: { rounds: Rounds; participants: Participant[]; me: Me; room: Room; offset: number }) {
  const { floor } = useFloor(room, offset);
  return (
    <details className="panel float-pop questions" open>
      <summary>질문</summary>
      <QuestionList room={room} participants={participants} rounds={rounds} floor={floor} myUid={me.uid} />
    </details>
  );
}

/** The result as a popup over the table. Its header holds the close button; closed, a small button brings it back. */
/** The result stage shows this alone: no cards, no closing it; only leaving the game. */
function ResultPopup({ reveal, participants, room, me }: { reveal: Reveal; participants: Participant[]; room: Room; me: Me }) {
  return (
    <section className="panel result-popup" role="dialog" aria-label="게임 결과" data-testid="result-popup">
      <header className="result-head">
        <strong>{room.phase === "ended" ? "게임이 끝났어요" : "결과"}</strong>
      </header>
      <RevealView reveal={reveal} participants={participants} topic={room.topic} myUid={me.uid} />
      {/* ponytail: leaves to the home screen; a practice game stays saved until "처음부터 다시". */}
      <Link to="/" className="button primary large result-exit" data-testid="game-exit">
        게임 종료
      </Link>
    </section>
  );
}

function Roster({ participants, room }: { participants: Participant[]; room: Room }) {
  return (
    <details className="panel roster">
      <summary>
        함께하는 사람 {participants.length}명
        {room.phase === "lobby" && <span className="muted small"> · {room.minStudents}~{room.maxStudents}명이 모이면 시작해요</span>}
      </summary>
      <ul>
        {participants.map((p) => (
          <li key={p.uid}>
            <strong>{p.nickname}</strong>
            {p.roleId ? <span className="role-tag">{roleName(room.topic, p.roleId)}</span> : <span className="muted small">{p.prefsDone ? "역할 선택 완료" : "준비 중"}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
