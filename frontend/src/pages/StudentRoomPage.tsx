import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, Maximize2, Minimize2, Pause, Users, X } from "lucide-react";
import EventCard from "../components/EventCard";
import GameBar from "../components/GameBar";
import RoleCard from "../components/RoleCard";
import Sheet from "../components/Sheet";
import Tabs from "../components/Tabs";
import IssueBriefing from "../features/briefing/IssueBriefing";
import RulesVideo from "../features/briefing/RulesVideo";
import ChatFeed, { roleName } from "../features/chat/ChatFeed";
import Composer from "../features/chat/Composer";
import ModerationNotice from "../features/chat/ModerationNotice";
import { RULES, STUDENT_TODO } from "../features/game/phases";
import StatementBoard from "../features/game/StatementBoard";
import TableView from "../features/game/TableView";
import PreferencePicker from "../features/roles/PreferencePicker";
import SecretRole, { IdentityBanner } from "../features/roles/SecretRole";
import type { RoomApi } from "../features/room/useRoom";
import RevealView from "../features/voting/RevealView";
import VotePanel, { togglePick } from "../features/voting/VotePanel";
import type { ChatMessage, MessageKind, Me, ModerationResult, Notice, Participant, Room, Rounds } from "../types/game";

const TEXT_LIMIT = 200;
const idNum = (id: string) => Number(id.slice(1)) || 0;

/** The notice to show next to the composer, hidden once a later message went through. */
function currentNotice(me: Me, room: Room, chat: ChatMessage[], statement: boolean): Notice | null {
  const notices = me.notices.filter((n) => n.phase === room.phase && (n.kind === "statement") === statement && n.status !== "withdrawn");
  const latest = notices.at(-1);
  if (!latest) return null;
  const published = chat.filter((m) => m.uid === me.uid && !m.viaTeacher).map((m) => idNum(m.id));
  if (published.some((id) => id > idNum(latest.id))) return null;
  return latest;
}

function stored(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "on";
  } catch {
    return fallback;
  }
}

/** `lobbyAction` is shown under the to-do note in the lobby (practice mode puts its start button there). */
export default function StudentRoomPage({ api, lobbyAction }: { api: RoomApi; lobbyAction?: React.ReactNode }) {
  const { state, action, busy, error, offset, online } = api;
  const { room, participants, rounds } = state!;
  const me = state!.me!;
  const [roleOpen, setRoleOpen] = useState(false);
  // The person picked at the table: chat recipient and, while voting, a candidate.
  const [focus, setFocus] = useState("");
  const [votePicked, setVotePicked] = useState<string[]>([]);
  const [show3d, setShow3d] = useState(() => stored("bridge.table3d", true));
  const self = participants.find((p) => p.uid === me.uid);
  const myRole = room.topic.roles.find((r) => r.id === me.roleId);
  const others = participants.filter((p) => p.uid !== me.uid);
  const phase = room.phase;
  const secretStillHidden = phase !== "reveal" && phase !== "ended";

  const sendMessage = async (kind: MessageKind, text: string, targetUid: string | null) => {
    const next = await action("messages", { kind, text, ...(targetUid ? { targetUid } : {}) });
    return next?.moderation ?? null;
  };
  const selectAtTable = (uid: string) => {
    if (phase === "vote" && !me.vote) setVotePicked((current) => togglePick(current, uid, room.settings.switcherCount));
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
      />
      {!online && <p className="banner warn">연결이 끊겼어요. 다시 연결되면 지금 단계와 내 역할로 자동으로 돌아와요.</p>}

      <div className={`room-layout${show3d ? " with-table" : ""}`}>
        {show3d && (
          <div className="stage">
            <TableView room={room} participants={participants} rounds={rounds} selfUid={me.uid} focusUid={focus || undefined} onSelect={selectAtTable} offset={offset} />
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

          {phase === "lobby" && lobbyAction}
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

          {phase === "statement" && (
            <StatementStage
              room={room}
              me={me}
              participant={self}
              participants={participants}
              busy={busy}
              notice={currentNotice(me, room, rounds.chat, true)}
              onSubmit={async (text) => {
                const next = await action("statement", { text });
                return next?.moderation ?? null;
              }}
            />
          )}

          {(phase === "event" || phase === "rebuttal") && (
            <ChatStage
              key={phase}
              room={room}
              rounds={rounds}
              participants={participants}
              me={me}
              others={others}
              busy={busy}
              focus={focus}
              onFocus={setFocus}
              notice={currentNotice(me, room, rounds.chat, false)}
              onSend={sendMessage}
            />
          )}

          {phase === "vote" && (
            <>
              <section className="panel">
                <VotePanel
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
              <details className="panel">
                <summary>지난 발언 다시 보기 ({rounds.chat.length})</summary>
                <ChatFeed messages={rounds.chat} participants={participants} topic={room.topic} myUid={me.uid} />
              </details>
            </>
          )}

          {(phase === "reveal" || phase === "ended") && rounds.reveal && (
            <section className="panel">
              {phase === "ended" && <p className="banner ok">게임이 끝났어요. 참여해 줘서 고마워요!</p>}
              <RevealView reveal={rounds.reveal} participants={participants} topic={room.topic} myUid={me.uid} />
            </section>
          )}

          {!show3d && phase !== "lobby" && <Roster participants={participants} room={room} />}
        </div>
      </div>

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
            <h2>{room.topic.shortTitle} · 어떤 역할을 맡아 볼까요?</h2>
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

type ChatTab = "chat" | "event" | "statements";

/** Discussion phases: the event card, the statements and the chat live in tabs, not one long page. */
function ChatStage({
  room,
  rounds,
  participants,
  me,
  others,
  busy,
  focus,
  onFocus,
  notice,
  onSend,
}: {
  room: Room;
  rounds: Rounds;
  participants: Participant[];
  me: Me;
  others: Participant[];
  busy: boolean;
  focus: string;
  onFocus: (uid: string) => void;
  notice: Notice | null;
  onSend: (kind: MessageKind, text: string, targetUid: string | null) => Promise<ModerationResult | null>;
}) {
  const [tab, setTab] = useState<ChatTab>(room.phase === "event" ? "event" : "chat");
  const [seen, setSeen] = useState(rounds.chat.length);
  useEffect(() => {
    if (tab === "chat") setSeen(rounds.chat.length);
  }, [tab, rounds.chat.length]);
  // Picking someone at the table means "talk to them".
  useEffect(() => {
    if (focus) setTab("chat");
  }, [focus]);
  const phaseMessages = rounds.chat.filter((m) => m.phase === room.phase).length;
  return (
    <>
      <Tabs<ChatTab>
        label="토론 화면"
        active={tab}
        onChange={setTab}
        items={[
          { id: "chat", label: "토론 채팅", badge: tab === "chat" ? 0 : rounds.chat.length - seen },
          { id: "event", label: "사건 카드" },
          { id: "statements", label: "입장 발표" },
        ]}
      />
      {tab === "event" && room.event && (
        <>
          <EventCard event={room.event} />
          <button className="button primary full large" onClick={() => setTab("chat")}>
            토론하러 가기 <ArrowRight size={18} />
          </button>
        </>
      )}
      {tab === "statements" && (
        <section className="panel">
          <StatementBoard rows={rounds.statements} participants={participants} topic={room.topic} />
        </section>
      )}
      {tab === "chat" && (
        <section className="panel chat-panel">
          {room.event && (
            <button className="event-mini" onClick={() => setTab("event")}>
              <span>사건</span> {room.event.title}
            </button>
          )}
          <ChatFeed
            messages={rounds.chat}
            participants={participants}
            topic={room.topic}
            myUid={me.uid}
            emptyText={room.phase === "event" ? "사건 카드를 읽고 먼저 말을 꺼내 보세요." : "다른 역할의 발언에 반론해 보세요."}
          />
          <p className="muted small">이번 단계 발언 {phaseMessages}개</p>
          <Composer
            phase={room.phase}
            others={others}
            prompts={room.topic.questionPrompts}
            limit={TEXT_LIMIT}
            busy={busy}
            disabled={room.paused}
            notice={notice}
            target={focus}
            onTargetChange={onFocus}
            onSend={onSend}
          />
        </section>
      )}
    </>
  );
}

function StatementStage({
  room,
  me,
  participant,
  participants,
  busy,
  notice,
  onSubmit,
}: {
  room: Room;
  me: Me;
  participant?: Participant;
  participants: Participant[];
  busy: boolean;
  notice: Notice | null;
  onSubmit: (text: string) => Promise<ModerationResult | null>;
}) {
  const [text, setText] = useState("");
  const done = participant?.submitted.includes("statement");
  const count = participants.filter((p) => p.submitted.includes("statement")).length;
  const role = room.topic.roles.find((r) => r.id === me.roleId);
  return (
    <section className="panel">
      <span className="eyebrow">주제</span>
      <h3 className="topic-title">{room.topic.title}</h3>
      {role && (
        <p className="role-reminder">
          <strong>{role.name}</strong>의 목표: {role.goal}
        </p>
      )}
      {done ? (
        <p className="success-line" data-testid="statement-done">
          <Check size={18} aria-hidden /> 발표를 냈어요. 모두 내거나 시간이 끝나면 함께 공개돼요. ({count}/{participants.length})
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSubmit(text.trim());
          }}
        >
          <label className="field-label" htmlFor="statement">
            {role ? `${role.name}(으)로서` : "내 역할로서"} 이 주제에 대해 어떻게 생각하나요?
          </label>
          <textarea
            id="statement"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={TEXT_LIMIT}
            rows={4}
            placeholder={`저는 ${role?.name ?? "제 역할"}로서 … 라고 생각합니다. 왜냐하면 …`}
            disabled={room.paused}
          />
          <ModerationNotice notice={notice} onEdit={setText} />
          <div className="composer-foot">
            <span className="muted small">
              발표한 학생 {count}/{participants.length}
            </span>
            <span className="count">
              {text.length}/{TEXT_LIMIT}
            </span>
            <button className="button primary" type="submit" disabled={busy || room.paused || !text.trim()}>
              발표하기
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Roster({ participants, room }: { participants: Participant[]; room: Room }) {
  return (
    <details className="panel roster">
      <summary>
        <Users size={17} aria-hidden /> 함께하는 사람 {participants.length}명
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
