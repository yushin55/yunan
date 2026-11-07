import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, Maximize2, Minimize2, Pause, X } from "lucide-react";
import EventCard from "../components/EventCard";
import GameBar from "../components/GameBar";
import RoleCard from "../components/RoleCard";
import Sheet from "../components/Sheet";
import IssueBriefing from "../features/briefing/IssueBriefing";
import RulesVideo from "../features/briefing/RulesVideo";
import { MemoPad, QuestionList, StatementList } from "../features/discussion/DiscussionNotes";
import { useFloor } from "../features/discussion/floor";
import MicControls from "../features/discussion/MicControls";
import type { SpeechEngine } from "../features/discussion/useSpeechCapture";
import { KIND_LABEL, RULES, SPEAKING, STUDENT_TODO } from "../features/game/phases";
import TableView from "../features/game/TableView";
import { allReady, StartCountdown, useAutoStart } from "../features/game/useAutoStart";
import type { HandCard } from "../components/scene/TableScene";
import PreferencePicker from "../features/roles/PreferencePicker";
import SecretRole, { IdentityBanner } from "../features/roles/SecretRole";
import type { RoomApi } from "../features/room/useRoom";
import RevealView from "../features/voting/RevealView";
import VotePanel, { togglePick } from "../features/voting/VotePanel";
import { roleName } from "../features/roles/roleName";
import type { Me, Participant, Role, Room, Rounds } from "../types/game";

function stored(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "on";
  } catch {
    return fallback;
  }
}

/** Cards in my own hand before the statements: my two picks in the lobby, then my role and who I am. */
function ownHand(room: Room, me: Me, myRole?: Role): HandCard[] | undefined {
  if (room.phase === "lobby" && me.preferences)
    return [me.preferences.first, me.preferences.second].map((id, i) => {
      const role = room.topic.roles.find((r) => r.id === id);
      return { uid: `pick${i}`, order: i + 1, name: role?.name ?? "", role: `${i + 1}순위`, text: role?.goal ?? "", state: "done" };
    });
  if (room.phase === "role" && myRole)
    return [
      { uid: "my-role", name: myRole.name, role: "나의 역할", text: myRole.goal, state: "done" },
      me.isSwitcher
        ? { uid: "identity", name: "역할 전환자", role: "나만 아는 정체", text: "고르지 않은 역할을 맡았어요. 들키지 않게 자연스럽게 말해요.", state: "speaking" }
        : { uid: "identity", name: "일반 참가자", role: "나만 아는 정체", text: "내가 고른 역할을 맡았어요. 누가 역할 전환자인지 찾아보세요.", state: "done" },
    ];
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
  // The person picked at the table: while voting, a candidate.
  const [focus, setFocus] = useState("");
  const [votePicked, setVotePicked] = useState<string[]>([]);
  const [show3d, setShow3d] = useState(() => stored("bridge.table3d", true));
  const self = participants.find((p) => p.uid === me.uid);
  const myRole = room.topic.roles.find((r) => r.id === me.roleId);
  const others = participants.filter((p) => p.uid !== me.uid);
  const phase = room.phase;
  const secretStillHidden = phase !== "reveal" && phase !== "ended";
  const discussing = SPEAKING.includes(phase) || phase === "vote";
  // In a real room the teacher's screen starts the game; this only shows the same countdown.
  const ownCount = useAutoStart(startIn === undefined && allReady(room, participants));
  const countdown = startIn === undefined ? ownCount : startIn;
  const pointAt = phase === "vote" ? (me.vote ?? votePicked).at(-1) : undefined;

  const selectAtTable = (uid: string) => {
    // Voting points at people instead of turning to look, so my arm and the table stay in view.
    if (phase === "vote") {
      if (!me.vote) setVotePicked((current) => togglePick(current, uid, room.settings.switcherCount));
      return;
    }
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

  return (
    <main className="student-room">
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
      <div className={`room-layout${show3d ? " with-table" : ""}`}>
        {show3d && (
          <div className="stage">
            <TableView room={room} participants={participants} rounds={rounds} selfUid={me.uid} focusUid={focus || undefined} onSelect={selectAtTable} offset={offset} hand={ownHand(room, me, myRole)} pointAt={pointAt} />
          </div>
        )}
        <div className="desk">
          {room.paused ? (
            <p className="todo-callout paused">
              <Pause size={18} aria-hidden /> 선생님이 진행을 잠시 멈췄어요. 다시 시작하면 이어서 할 수 있어요.
            </p>
          ) : (
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

          {phase === "lobby" && <LobbyFlow key={`${room.topicId}.${room.createdAt}`} room={room} me={me} participants={participants} busy={busy} onPrefs={(first, second) => void action("preferences", { first, second })} />}

          {phase === "role" && myRole && (
            <section className="panel">
              <SecretRole me={me} role={myRole} />
              {self?.submitted.includes("role") ? (
                <p className="success-line">
                  <Check size={18} aria-hidden /> 확인했어요. 다른 친구들이 역할을 확인하고 있어요.
                </p>
              ) : (
                <button className="button primary full large" disabled={busy || room.paused} onClick={() => void action("confirm-role")}>
                  역할을 확인했어요
                </button>
              )}
            </section>
          )}

          {SPEAKING.includes(phase) && (
            <SpeakingStage room={room} rounds={rounds} participants={participants} me={me} api={api} micEngine={micEngine} allowTyping={allowTyping} withTable={show3d} />
          )}

          {phase === "vote" && (
            <div className="speaking-side">
              <section className="panel mic-popup">
                <VotePanel
                  atTable={show3d}
                  candidates={others}
                  topic={room.topic}
                  count={room.settings.switcherCount}
                  myVote={me.vote}
                  picked={votePicked}
                  onPick={setVotePicked}
                  busy={busy}
                  disabled={room.paused}
                  onVote={(targets) => void action("vote", { targets })}
                />
              </section>
              <Questions rounds={rounds} participants={participants} me={me} floor={null} />
            </div>
          )}

          {(phase === "reveal" || phase === "ended") && rounds.reveal && (
            <section className="panel">
              {phase === "ended" && <p className="banner ok">게임이 끝났어요. 참여해 줘서 고마워요!</p>}
              <RevealView reveal={rounds.reveal} participants={participants} topic={room.topic} myUid={me.uid} />
            </section>
          )}

          {!show3d && phase !== "lobby" && <Roster participants={participants} room={room} />}
          {discussing && <MemoPad key={room.roomId} room={room} />}
        </div>
      </div>

      {phase === "event" && room.event && <EventPopup room={room} inHand={show3d} />}
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
function LobbyFlow({ room, me, participants, busy, onPrefs }: { room: Room; me: Me; participants: Participant[]; busy: boolean; onPrefs: (first: string, second: string) => void }) {
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
  const step = !briefed ? 0 : !rulesRead ? 1 : 2;
  const finishBriefing = () => {
    setBriefed(true);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  };

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

  const action =
    step === 0 && !videoDone ? (
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
          <IssueBriefing
            briefing={room.topic.briefing}
            topicId={room.topicId}
            headline={room.topic.shortTitle}
            onFinish={() => setVideoDone(true)}
            onNext={finishBriefing}
            nextLabel="다음: 게임 규칙"
          />
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
          <RulesVideo onFinish={() => setRulesWatched(true)} onNext={() => setRulesRead(true)} nextLabel="역할 고르러 가기" />
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

/**
 * Discussion on a student's device. The table is the main view; this side panel holds the
 * microphone, the event card, the questions asked so far and my memo.
 */
function SpeakingStage({ room, rounds, participants, me, api, micEngine, allowTyping, withTable }: { room: Room; rounds: Rounds; participants: Participant[]; me: Me; api: RoomApi; micEngine: SpeechEngine; allowTyping?: boolean; withTable: boolean }) {
  const { floor } = useFloor(room, api.offset);
  const turn = room.turn;
  const speaker = participants.find((p) => p.uid === (floor?.uid ?? turn?.uid));
  const mine = speaker?.uid === me.uid;
  const waitingAhead = turn ? turn.order.slice(turn.index + 1).indexOf(me.uid) : -1;
  const eyebrow = turn ? (mine ? "내 차례예요" : "지금 말하는 사람") : !floor ? "마이크가 비어 있어요" : `${mine ? "내가 말하는 중" : "지금 말하는 사람"} · ${KIND_LABEL[floor.kind]}`;
  const headline = mine ? (floor ? "말해 주세요. 끝나면 다시 눌러 주세요." : "마이크를 켜고 말해 주세요.") : (speaker?.nickname ?? "먼저 누르는 사람이 말해요");
  const hint = mine ? "" : turn ? (waitingAhead === -1 ? "이번 단계에서 내 차례는 끝났어요. 잘 듣고 누가 역할 전환자일지 생각해 보세요." : waitingAhead === 0 ? "다음이 내 차례예요. 준비해 주세요." : `내 차례까지 ${waitingAhead}명 남았어요.`) : floor ? "끝나면 마이크를 켤 수 있어요." : "";
  return (
    <section className="speaking-side">
      <div className={`panel floor-card mic-popup${mine ? " mine" : ""}`} data-testid="floor-card" aria-live="polite">
        <span className="eyebrow">{eyebrow}</span>
        <p className="floor-name" data-testid="floor-name">
          {headline}
        </p>
        {!mine && speaker?.roleId && <p className="muted">{roleName(room.topic, speaker.roleId)}</p>}
        {hint && <p className="muted small">{hint}</p>}
        <MicControls room={room} me={me} api={api} engine={micEngine} allowTyping={allowTyping} />
      </div>
      {/* With the table on, the event is a card in my hand instead. */}
      {!withTable && room.event && <EventCard key={room.phase} event={room.event} collapsible defaultOpen={room.phase === "event"} />}
      {room.phase !== "statement" && <Questions rounds={rounds} participants={participants} me={me} floor={floor} />}
      {/* With the table on, everyone's statement is already a card in my hand. */}
      {!withTable && (
        <details className="panel" open={room.phase === "statement"}>
          <summary>입장 발표 정리</summary>
          <StatementList room={room} participants={participants} rounds={rounds} myUid={me.uid} />
        </details>
      )}
    </section>
  );
}

/** The event, shown once when it happens. Closing it keeps it from coming back on this device. */
function EventPopup({ room, inHand }: { room: Room; inHand: boolean }) {
  const key = `bridge.eventSeen.${room.roomId}.${room.createdAt}`;
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(key) !== "1";
    } catch {
      return true;
    }
  });
  if (!open || !room.event) return null;
  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* It may show once more after a reload. */
    }
  };
  return (
    <Sheet title="사건이 일어났어요!" onClose={close}>
      <EventCard event={room.event} />
      {inHand && <p className="muted small">이 사건 카드는 내 손에 들려 있어요. 언제든 눌러서 다시 볼 수 있어요.</p>}
      <button className="button primary full large" data-testid="event-popup-close" onClick={close}>
        확인했어요
      </button>
    </Sheet>
  );
}

function Questions({ rounds, participants, me, floor }: { rounds: Rounds; participants: Participant[]; me: Me; floor: ReturnType<typeof useFloor>["floor"] }) {
  return (
    <section className="panel questions">
      <h3 className="memo-title">질문</h3>
      <QuestionList participants={participants} rounds={rounds} floor={floor} myUid={me.uid} />
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
