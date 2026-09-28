import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import ActionPanel, { RoleCards, getRoleName } from "../components/game/ActionPanel";
import CinematicReveal from "../components/game/CinematicReveal";
import RuleBriefing, { briefingSeen } from "../components/game/RuleBriefing";
import TurnReview, { ReactionFeed } from "../components/game/TurnReview";
import { NotesBoard, OpponentRail, PICK_PHASES, PlayerDossier } from "../components/game/TableIntel";
import Modal from "../components/common/Modal";
import { useRoom } from "../hooks/useRoom";
import { usePhaseTimer } from "../hooks/usePhaseTimer";
import { useGameAudio } from "../hooks/useGameAudio";
import { usePlayerNotes } from "../hooks/usePlayerNotes";
import { Flag, Layers3, Music2, NotebookPen, ScrollText, Swords, Users, Volume2, VolumeX } from "../components/common/Icon";
import { api } from "../lib/api";
import { createPractice } from "../lib/practice";
import { PHASE_LABELS, PHASES, PLAYER_COLORS, POSITIONS, REVIEW_PHASES } from "../types/game";
import type { Breakdown, Phase, Snapshot, Submission } from "../types/game";
import "../styles/immersive.css";
import "../styles/augment.css";
import "../styles/table-view.css";
import "../styles/game-type.css";

const LoungeScene = lazy(() => import("../components/scene/LoungeScene"));
type Drawer = "cards" | "history" | "invite" | "notes" | null;
/** "mission" shows the phase card over the table; "table" stows it so you can face the other players. */
type View = "mission" | "table";

const PROMPTS: Record<Phase, string> = {
  lobby: "자리에 앉아, 맞은편의 얼굴을 살펴보세요.",
  topic: "오늘의 이야기가 테이블에 놓였습니다.",
  initial: "먼저 진짜 생각을 비밀 카드에 남겨주세요.",
  role: "당신만의 배역과 관점 카드를 확인하세요.",
  claim: "맡은 역할이 되어 모두에게 입장을 들려주세요.",
  claim_review: "모두의 입장이 공개됐어요. 한 사람씩 듣고 반응을 보내세요.",
  scenario: "사건이 벌어졌습니다. 당신이라면 어떻게 할까요?",
  scenario_review: "모두의 대응이 공개됐어요. 서로의 선택을 확인하세요.",
  question: "상대의 얼굴을 선택하고 질문을 건네세요.",
  guess: "누가 낯선 역할을 연기하고 있을까요?",
  reveal: "가면이 벗겨졌습니다. 서로의 대변을 평가하세요.",
  reflection: "역할을 내려놓고, 나의 목소리로 돌아오세요.",
  results: "오늘의 테이블이 끝났습니다.",
};

const URGENT_PHASES: Phase[] = ["initial", "claim", "scenario", "question", "guess", "reflection"];

const PHASE_VOICE: Partial<Record<Phase, string>> = {
  initial: "첫 번째 선택입니다. 지금의 진짜 생각을 비밀 카드에 남겨주세요.",
  claim: "입장 선언을 시작합니다. 맡은 역할의 관점으로 말해주세요.",
  claim_review: "모두의 입장이 공개되었습니다. 한 사람씩 확인하고, 반응을 보내주세요.",
  scenario_review: "모두의 대응이 공개되었습니다. 서로의 선택을 확인하고, 반응을 보내주세요.",
  question: "교차 질문을 시작합니다. 묻고 싶은 사람을 골라주세요.",
  guess: "이제 역할 전환자를 추리할 시간입니다.",
  reflection: "역할을 내려놓고, 나의 목소리로 돌아오세요.",
  results: "오늘의 게임이 끝났습니다. 서로의 다른 시선을 돌아보세요.",
};

export default function ImmersiveRoomPage({ practice = false }: { practice?: boolean }) {
  const { roomId = "practice" } = useParams();
  const { snapshot: s, error, busy, connected, action, refresh } = useRoom(roomId, practice);
  const [focusedUid, setFocusedUid] = useState<string>();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState("");
  const [phaseBanner, setPhaseBanner] = useState<Phase | null>(null);
  const [dismissedCinematic, setDismissedCinematic] = useState("");
  const [view, setView] = useState<View>("mission");
  /** "gate" waits for a click so the narration may play; "play" starts right away. */
  const [briefing, setBriefing] = useState<"gate" | "play" | null>(null);
  const briefingOffered = useRef(false);
  const timer = usePhaseTimer(s?.room.phaseEndsAt ?? null, s?.serverNow);
  const audio = useGameAudio();
  const soundedPhase = useRef("");
  const navigate = useNavigate();
  const phase = s?.room.phase;
  const notes = usePlayerNotes(roomId, s?.me.uid);

  const gameAction = useCallback(async (name: string, body?: Record<string, unknown>) => {
    if (name !== "sync") audio.unlock();
    const next = await action(name, body);
    if (next && name !== "sync") audio.playCue("confirm");
    return next;
  }, [action, audio.unlock, audio.playCue]);

  useEffect(() => {
    if (!s || s.room.phase === "lobby") return;
    const key = `${s.room.roomId}:${s.room.phaseVersion}`;
    if (soundedPhase.current === key) return;
    soundedPhase.current = key;
    audio.stop();
    if (s.room.phase === "topic") {
      audio.playCue("topic");
      if (s.room.topic) audio.narrate(`오늘의 주제입니다. ${s.room.topic.title}`);
    } else if (s.room.phase === "role") {
      audio.playCue("role");
      audio.narrate("당신의 비밀 역할이 도착했습니다. 카드를 확인하세요.");
    } else if (s.room.phase === "reveal") {
      audio.playCue("reveal");
      audio.narrate("정체를 공개합니다. 테이블의 선택을 확인하세요.");
    } else if (s.room.phase === "results") {
      audio.playCue("confirm");
      audio.narrate(PHASE_VOICE.results || "");
    } else {
      audio.playCue("transition");
      audio.narrate(s.room.phase === "scenario"
        ? `새로운 사건이 도착했습니다. ${s.room.topic?.scenario.title || "선택지를 확인하세요."}`
        : PHASE_VOICE[s.room.phase] || "");
    }
  }, [s?.room.roomId, s?.room.phaseVersion, s?.room.phase, s?.room.topic?.title, audio.stop, audio.playCue, audio.narrate]);

  useEffect(() => {
    // First visit: explain the rules while everyone is still gathering in the lobby.
    if (phase === "lobby" && !briefingOffered.current) {
      briefingOffered.current = true;
      if (!briefingSeen()) setBriefing("gate");
    }
    if (phase && phase !== "lobby") setBriefing(null);
  }, [phase]);

  useEffect(() => {
    // A new phase always brings its mission card back to the front.
    setDrawer(null);
    setView("mission");
  }, [phase]);

  const switchView = useCallback((next: View) => {
    setView((current) => {
      if (current !== next) audio.playCue(next === "table" ? "select" : "deal");
      return next;
    });
  }, [audio.playCue]);

  useEffect(() => {
    if (view !== "table" || drawer || reportOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !(event.target as HTMLElement | null)?.closest("textarea, input")) setView("mission");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, drawer, reportOpen]);

  const selectPlayer = useCallback((uid: string) => {
    audio.unlock();
    audio.playCue("select");
    setFocusedUid(uid);
    setView("table");
  }, [audio.unlock, audio.playCue]);

  useEffect(() => {
    if (!phase || ["lobby", "topic", "role", "reveal", "results"].includes(phase)) {
      setPhaseBanner(null);
      return;
    }
    setPhaseBanner(phase);
    const timer = window.setTimeout(() => setPhaseBanner(null), 2200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // The last seconds of a phase you still owe an answer in: red edges, then a tick per second.
  const owesAnswer = !!s && !s.participants.find((p) => p.uid === s.me.uid)?.submitted?.includes(s.room.phase) &&
    (URGENT_PHASES.includes(s.room.phase) || !!REVIEW_PHASES[s.room.phase]);
  const urgent = owesAnswer && timer.remaining !== null && timer.remaining > 0 && timer.remaining <= 10;
  useEffect(() => {
    if (urgent && timer.remaining !== null && timer.remaining <= 5) audio.playCue("tick");
  }, [urgent, timer.remaining, audio.playCue]);

  const replay = useCallback(async () => {
    if (!s) return;
    if (practice) {
      createPractice(s.participants.find((p) => p.uid === s.me.uid)?.nickname);
      window.location.reload();
      return;
    }
    try {
      const next = await api("/api/rooms", {
        nickname: s.participants.find((p) => p.uid === s.me.uid)?.nickname || "참가자",
        previousTopicId: s.room.topicId,
      });
      navigate(`/room/${next.room.roomId}`);
      window.location.reload();
    } catch (e) {
      setLocalError((e as Error).message);
    }
  }, [navigate, practice, s]);

  async function copyInvite() {
    if (!s) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/join?code=${s.room.code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setLocalError("링크 복사가 제한되었습니다. 초대 코드를 직접 공유해 주세요.");
    }
  }

  if (!s) {
    return (
      <main className="immersive-loading">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => void refresh()}>다시 연결</button>
            <Link to="/">라운지로 돌아가기</Link>
          </>
        ) : (
          <><span className="spinner" />테이블에 입장하는 중…</>
        )}
      </main>
    );
  }

  const me = s.participants.find((p) => p.uid === s.me.uid);
  const isHost = s.room.hostUid === s.me.uid;
  const readyCount = s.participants.filter((p) => p.ready).length;
  const focused = s.participants.find((p) => p.uid === focusedUid);
  const chapter = Math.max(0, PHASES.indexOf(s.room.phase));
  const live = practice || connected;
  const canStart = s.participants.length >= 4 && readyCount === s.participants.length;
  const stageVisible = s.room.phase !== "lobby" && s.room.phase !== "results";
  const cinematicPhase = (["topic", "role", "reveal"] as Phase[]).includes(s.room.phase)
    ? s.room.phase as "topic" | "role" | "reveal"
    : null;
  const cinematicKey = `${s.room.roomId}:${s.room.phaseVersion}`;
  const showCinematic = cinematicPhase !== null && dismissedCinematic !== cinematicKey;
  const dismissCinematic = () => setDismissedCinematic(cinematicKey);
  // Review phases face the table: no mission card, the camera follows each speaker instead.
  const reviewing = !!REVIEW_PHASES[s.room.phase];
  const missionOpen = stageVisible && !showCinematic && !reviewing;
  const tableView = missionOpen && view === "table";
  const mySubmitted = !!me?.submitted?.includes(s.room.phase);
  const roomClass = ["immersive-room", stageVisible && "immersive-room--card-open", missionOpen && "immersive-room--mission",
    tableView && "immersive-room--table-view", reviewing && "immersive-room--review", urgent && "immersive-room--urgent"].filter(Boolean).join(" ");
  const replayVoice = () => {
    if (!audio.enabled) audio.toggle();
    audio.unlock();
    if (s.room.phase === "topic" && s.room.topic) {
      audio.playCue("topic");
      audio.narrate(`오늘의 주제입니다. ${s.room.topic.title}`);
    } else if (s.room.phase === "role") {
      audio.playCue("role");
      audio.narrate("당신의 비밀 역할이 도착했습니다. 카드를 확인하세요.");
    } else if (s.room.phase === "reveal") {
      audio.playCue("reveal");
      audio.narrate("정체를 공개합니다. 테이블의 선택을 확인하세요.");
    }
  };

  return (
    <main className={roomClass} data-testid="immersive-room" data-phase={s.room.phase} data-view={missionOpen ? view : undefined}>
      {urgent && <div className="immersive-urgency" aria-hidden="true" />}
      <div className="immersive-world" data-testid="immersive-world">
        <Suspense fallback={<div className="immersive-scene-loading"><span className="spinner" />입장하는 중…</div>}>
          <LoungeScene
            mode="immersive"
            players={s.participants.map((p, i) => ({ ...p, color: PLAYER_COLORS[i] }))}
            selfUid={s.me.uid}
            phase={s.room.phase}
            activePlayer={focusedUid}
            focusPlayerUid={focusedUid}
            cameraMode={reviewing ? "review" : missionOpen && !tableView ? "mission" : "table"}
            onPlayerSelect={selectPlayer}
          />
        </Suspense>
      </div>
      <div className="immersive-vignette" aria-hidden="true" />

      {phaseBanner && (
        <div className="immersive-phase-banner" aria-live="polite">
          <span>THE TABLE · {String(PHASES.indexOf(phaseBanner)).padStart(2, "0")}</span>
          <strong>{PHASE_LABELS[phaseBanner]}</strong>
          <small>{PROMPTS[phaseBanner]}</small>
        </div>
      )}

      <header className="immersive-hud">
        <div className="immersive-hud__left">
          <Link to="/" className="immersive-exit" aria-label="라운지로 돌아가기">← <span>유난</span></Link>
          <span className="immersive-status"><i className={live ? "" : "offline"} />{practice ? "연습 테이블" : s.room.code}</span>
        </div>
        <div className="immersive-hud__chapter" aria-live="polite" key={s.room.phase}>
          <small>{s.room.phase === "lobby" ? "THE TABLE" : s.room.phase === "results" ? "THE END" : `ROUND ${String(chapter).padStart(2, "0")}`}</small>
          <strong>{PHASE_LABELS[s.room.phase]}</strong>
          {s.room.topic && <span className="immersive-hud__topic">{s.room.topic.shortTitle || s.room.topic.title}</span>}
          <span>{PROMPTS[s.room.phase]}</span>
        </div>
        <div className="immersive-hud__right">
          <span className={timer.remaining !== null && timer.remaining < 15 ? "immersive-timer urgent" : "immersive-timer"} aria-label="남은 시간">
            {s.room.phase === "lobby" ? `${s.participants.length} / 6` : s.room.phase === "results" ? "FIN" : timer.label}
          </span>
          <button
            className="immersive-icon"
            type="button"
            aria-label={audio.enabled ? "게임 음성 끄기" : "게임 음성 켜기"}
            title={audio.enabled ? "게임 음성 끄기" : "게임 음성 켜기"}
            aria-pressed={audio.enabled}
            disabled={!audio.supported}
            onClick={() => {
              audio.toggle();
              if (!audio.enabled && s.room.phase === "topic" && s.room.topic) {
                audio.narrate(`오늘의 주제입니다. ${s.room.topic.title}`);
              }
            }}
          >
            {audio.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            className="immersive-icon immersive-icon--music"
            type="button"
            aria-label={audio.musicEnabled ? "배경음 끄기" : "배경음 켜기"}
            title={audio.musicEnabled ? "배경음 끄기" : "배경음 켜기"}
            aria-pressed={audio.musicEnabled}
            disabled={!audio.musicSupported || !audio.enabled}
            onClick={audio.toggleMusic}
          ><Music2 size={18} /></button>
          <button className="immersive-icon" type="button" title="기록 보기" aria-label="기록 보기" onClick={() => setDrawer("history")}>☰</button>
        </div>
      </header>

      {(error || localError) && (
        <div className="immersive-error" role="alert">
          {error || localError}
          <button onClick={() => { setLocalError(""); void refresh(); }}>다시 연결</button>
        </div>
      )}

      {s.room.phase !== "results" && (
        <>
          <div className="immersive-tools" aria-label="테이블 도구">
            {s.me.cards && <button aria-label="내 관점 카드" title="내 관점 카드" onClick={() => setDrawer("cards")}><Layers3 size={15} /> <span>내 관점 카드</span></button>}
            <button aria-label="추리 메모" title="추리 메모" onClick={() => setDrawer("notes")}><NotebookPen size={15} /> <span>추리 메모</span></button>
            <button aria-label="지난 대화" title="지난 대화" onClick={() => setDrawer("history")}><ScrollText size={15} /> <span>지난 대화</span></button>
            {!practice && <button aria-label="친구 초대" title="친구 초대" onClick={() => setDrawer("invite")}><Users size={15} /> <span>친구 초대</span></button>}
            <button aria-label="신고" title="신고" onClick={() => { setReported(false); setReportOpen(true); }}><Flag size={15} /> <span>신고</span></button>
          </div>

          <OpponentRail snapshot={s} focusedUid={focusedUid} notes={notes} onSelect={selectPlayer} onOpenNotes={() => setDrawer("notes")} />

          {missionOpen && (
            <div className="immersive-view-switch" role="group" aria-label="화면 전환">
              <button type="button" aria-pressed={!tableView} onClick={() => switchView("mission")}><Swords size={14} /> <span>미션 카드</span></button>
              <button type="button" aria-pressed={tableView} onClick={() => switchView("table")}><Users size={14} /> <span>테이블 보기</span></button>
            </div>
          )}

          {focused && focused.uid !== s.me.uid && (!missionOpen || tableView) && !reviewing && (
            <PlayerDossier
              key={focused.uid}
              snapshot={s}
              uid={focused.uid}
              notes={notes}
              missionOpen={missionOpen}
              onClose={() => setFocusedUid(undefined)}
              onMission={() => switchView("mission")}
            />
          )}

          {tableView && (
            <button type="button" className="immersive-mission-pill" onClick={() => switchView("mission")}>
              <span className="immersive-mission-pill__phase">{PHASE_LABELS[s.room.phase]}</span>
              <strong>미션 카드로 돌아가기</strong>
              <small>{mySubmitted ? "제출 완료" : focused && PICK_PHASES.includes(s.room.phase) ? `${focused.nickname} 선택됨` : "진행 중"}{!practice && timer.label ? ` · ${timer.label}` : ""}</small>
            </button>
          )}

          <div className="immersive-look-hint" aria-hidden="true">
            <span className="immersive-look-hint__reticle">+</span>
            <span>마우스로 둘러보고 · 캐릭터를 선택하세요</span>
          </div>

          {s.room.phase === "lobby" ? (
            <section className="immersive-lobby-card" data-testid="immersive-action-tray">
              <span className="immersive-card-overline">YOUR SEAT · {me?.nickname}</span>
              <h1>{practice ? "맞은편에 앉은 친구들과 시작해요" : "모두가 자리에 앉으면 시작해요"}</h1>
              <div className="immersive-seated-count"><span>{s.participants.length}명 입장</span><span>{readyCount}명 준비 완료</span></div>
              <button type="button" className="immersive-briefing-button" onClick={() => setBriefing("play")}>
                <span>GAME RULE</span><strong>게임 설명 듣기</strong><small>진행자 내레이션 · 약 2분</small>
              </button>
              {!practice && <button className="immersive-text-button" onClick={() => setDrawer("invite")}>초대장 열기 · {s.room.code} ↗</button>}
              {!isHost ? (
                <button className="immersive-primary" disabled={busy} onClick={() => void gameAction("ready", { ready: !me?.ready })}>{me?.ready ? "준비 완료 · 취소하기" : "자리에 앉아 준비하기"}</button>
              ) : (
                <button className="immersive-primary" disabled={busy || !canStart} onClick={() => void gameAction("start")}>{practice ? "연습 게임 시작" : "게임 시작"} <span>→</span></button>
              )}
              {audio.supported && <button type="button" className="immersive-text-button immersive-sound-preview" onClick={() => {
                if (!audio.enabled) audio.toggle();
                if (!audio.musicEnabled) audio.toggleMusic();
                audio.unlock();
                audio.playCue("topic");
                audio.narrate("안녕하세요, 오늘 게임을 안내해 드릴 진행자입니다.");
              }}>남성 내레이션 · 배경음 미리 듣기</button>}
              {!canStart && !practice && <small className="immersive-wait-note">4명 이상 입장하고 모두 준비해야 시작할 수 있어요.</small>}
            </section>
          ) : showCinematic ? null : reviewing ? (
            <>
              <ReactionFeed snapshot={s} practice={practice} />
              <TurnReview
                key={`${s.room.phase}-${s.room.phaseVersion}`}
                snapshot={s}
                practice={practice}
                busy={busy}
                action={gameAction}
                focusUid={focusedUid}
                onFocus={setFocusedUid}
                notes={notes}
              />
            </>
          ) : (
            <>
              <div className="immersive-augment-shade" aria-hidden="true" />
              <section
                className={"immersive-action-dock is-open immersive-augment-stage" + (tableView ? " is-stowed" : "")}
                data-testid="immersive-action-tray"
                aria-label="현재 진행 카드"
                aria-hidden={tableView || undefined}
                inert={tableView}
              >
                {s.room.topic && s.room.phase !== "topic" && (
                  <div className="mission-topic" data-testid="mission-topic">
                    <span>오늘의 안건</span>
                    <strong>{s.room.topic.title}</strong>
                  </div>
                )}
                <div id="immersive-action-content" className="immersive-action-dock__content">
                <ActionPanel
                  key={`${s.room.phase}-${s.room.phaseVersion}`}
                  snapshot={s}
                  action={gameAction}
                  busy={busy}
                  practice={practice}
                  focusPlayerUid={focusedUid}
                  onDeal={() => audio.playCue("deal")}
                  onPick={() => audio.playCue("select")}
                  onLookAround={() => switchView("table")}
                  onOpenNotes={() => setDrawer("notes")}
                />
                </div>
              </section>
            </>
          )}
        </>
      )}

      {s.room.phase === "results" && <ResultsStage snapshot={s} practice={practice} onReplay={() => void replay()} />}

      {showCinematic && cinematicPhase && (
        <CinematicReveal
          phase={cinematicPhase}
          topic={s.room.topic}
          roleName={getRoleName(s.room.topic, s.me.roleId)}
          busy={busy}
          timerLabel={practice ? undefined : timer.label}
          onContinue={cinematicPhase === "reveal"
            ? dismissCinematic
            : practice ? () => void gameAction("next") : undefined}
          onDismiss={dismissCinematic}
          audioEnabled={audio.enabled}
          onToggleAudio={audio.toggle}
          onReplayVoice={replayVoice}
          musicEnabled={audio.musicEnabled}
          onToggleMusic={audio.toggleMusic}
        />
      )}

      {briefing && <RuleBriefing audio={audio} autoStart={briefing === "play"} onClose={() => setBriefing(null)} />}

      {drawer && (
        <div className="immersive-drawer-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(null); }}>
          <aside className="immersive-drawer" role="dialog" aria-modal="true" aria-label={drawer === "cards" ? "내 관점 카드" : drawer === "history" ? "지난 대화" : drawer === "notes" ? "추리 메모" : "초대장"}>
            <div className="immersive-drawer__top"><span className="immersive-card-overline">THE OTHER SIDE</span><button aria-label="닫기" onClick={() => setDrawer(null)}>×</button></div>
            {drawer === "cards" && <><h2>내 관점 카드</h2><p>당신만 볼 수 있는 역할의 근거입니다.</p><RoleCards snapshot={s} /></>}
            {drawer === "history" && <History snapshot={s} onFocus={(uid) => { if (uid !== s.me.uid) selectPlayer(uid); setDrawer(null); }} />}
            {drawer === "notes" && <NotesBoard snapshot={s} notes={notes} onFocus={(uid) => { selectPlayer(uid); setDrawer(null); }} />}
            {drawer === "invite" && <><h2>친구 초대</h2><p>친구가 입장할 때까지 이 자리에서 기다려 주세요.</p><div className="immersive-invite-code"><QRCodeSVG value={`${location.origin}/join?code=${s.room.code}`} size={168} bgColor="#efe2c9" fgColor="#17201b" marginSize={1} /><strong>{s.room.code}</strong></div><button className="immersive-primary" onClick={() => void copyInvite()}>{copied ? "복사했어요 ✓" : "초대 링크 복사"}</button></>}
          </aside>
        </div>
      )}

      {reportOpen && (
        <Modal title="테이블의 안전을 지켜주세요." onClose={() => setReportOpen(false)}>
          {reported ? (
            <div className="waiting-panel"><h3>신고를 접수했어요.</h3><p>내용은 다른 참가자에게 공개되지 않습니다.</p><button className="button secondary full" onClick={() => setReportOpen(false)}>닫기</button></div>
          ) : (
            <form onSubmit={async (e) => { e.preventDefault(); if (await gameAction("report", { targetUid: reportTarget, reason: reportReason })) setReported(true); }}>
              <label className="field-label" htmlFor="immersive-report-target">신고 대상</label>
              <select id="immersive-report-target" required value={reportTarget} onChange={(e) => setReportTarget(e.target.value)}><option value="">참가자 선택</option>{s.participants.filter((p) => p.uid !== s.me.uid).map((p) => <option key={p.uid} value={p.uid}>{p.nickname}</option>)}</select>
              <label className="field-label" htmlFor="immersive-report-reason">신고 사유</label>
              <textarea id="immersive-report-reason" required maxLength={240} value={reportReason} onChange={(e) => setReportReason(e.target.value)} />
              {practice && <p className="auto-notice">연습 모드에서는 실제 신고가 접수되지 않습니다.</p>}
              <button className="button primary full" disabled={busy}>비공개로 신고하기</button>
            </form>
          )}
        </Modal>
      )}
    </main>
  );
}

function submissionLine(s: Snapshot, row: Submission) {
  if (row.timedOut) return "시간 내 답하지 않았어요.";
  const option = s.room.topic?.scenario.options.find((o) => o.id === row.optionId)?.text;
  return [option, row.text, row.reason, row.answer && `답변: ${row.answer}`].filter(Boolean).join(" · ") || "아직 답을 기다리고 있어요.";
}

function History({ snapshot: s, onFocus }: { snapshot: Snapshot; onFocus: (uid: string) => void }) {
  return <><h2>테이블의 대화</h2><p>공개된 발언을 다시 들을 수 있어요.</p>{(["claim", "scenario", "question"] as const).map((kind) => <section className="immersive-history-group" key={kind}><h3>{PHASE_LABELS[kind]}</h3>{s.rounds[kind]?.length ? s.rounds[kind]!.map((row, i) => <button key={`${row.uid}-${i}`} onClick={() => onFocus(row.uid)}><strong>{s.participants.find((p) => p.uid === row.uid)?.nickname || "참가자"}</strong><span>{submissionLine(s, row)}</span></button>) : <small>아직 공개된 대화가 없어요.</small>}</section>)}</>;
}

/** Counts up to the final score once, like a scoreboard settling. */
function useCountUp(target: number) {
  const [value, setValue] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? target : 0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setValue(target); return; }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function ResultsStage({ snapshot: s, practice, onReplay }: { snapshot: Snapshot; practice: boolean; onReplay: () => void }) {
  const result = s.results?.me;
  const score = useCountUp(result?.total ?? 0);
  const breakdown = Array.isArray(result?.breakdown) ? result.breakdown as Breakdown[] : [];
  return (
    <section className="immersive-results" data-testid="immersive-results">
      <span className="immersive-card-overline">THE TABLE · FIN</span>
      <h1>조금 다른 시선으로 돌아왔어요.</h1>
      <p>낯선 역할이 되어 마주했던 얼굴과 말을 돌아보세요.</p>
      {s.room.topic && <p className="immersive-results__topic">오늘의 주제 · {s.room.topic.title}</p>}
      <div className="immersive-score"><strong data-testid="score-total">{score}</strong><span>/ 100<br />{practice ? "연습 참여 점수" : "나의 점수"}</span></div>
      {practice && <p className="immersive-results__practice-note">연습 캐릭터는 사람의 평가를 대신하지 않으므로 평가 점수와 실제 추리 보너스는 부여하지 않습니다.</p>}
      {s.me.guess && <p className="immersive-results__guess">{result?.guessCorrect ? "낯선 역할을 찾아냈어요." : "예상 밖의 반전이 있었어요."} 중요한 것은 그렇게 생각한 이유입니다.</p>}
      <div className="immersive-results__columns">
        <div>
          <h2>내 생각의 변화 <small>나만 보기</small></h2>
          <small>게임 전 · {POSITIONS.find((p) => p.value === s.me.initialPosition?.position)?.label || "미제출"}</small>
          <p>{s.me.initialPosition?.reason || "남긴 의견이 없어요."}</p>
          <small>게임 후 · {POSITIONS.find((p) => p.value === s.me.reflection?.position)?.label || "미제출"}</small>
          <p>{s.me.reflection?.opinion || "남긴 의견이 없어요."}</p>
          <small>새롭게 이해한 점</small><p>{s.me.reflection?.understood || "아직 작성하지 않았어요."}</p>
          <small>여전히 동의하지 않는 점</small><p>{s.me.reflection?.disagree || "아직 작성하지 않았어요."}</p>
        </div>
        <div>
          <h2>가면 뒤의 사람들</h2>
          {s.rounds.reveal?.map((r) => <div className={"immersive-result-person" + (r.isSwitcher ? " is-switcher" : "")} key={r.uid}><strong>{r.uid === s.me.uid ? "나" : s.participants.find((p) => p.uid === r.uid)?.nickname}</strong><span>{getRoleName(s.room.topic, r.roleId)} <em>{r.isSwitcher ? "전환자" : "선호 역할"}</em></span></div>)}
          <small>초기 의견과 선호 역할은 공개되지 않습니다.</small>
        </div>
      </div>
      <div className="immersive-shared-voices">
        <h2>테이블에 남긴 진짜 목소리</h2>
        {s.rounds.sharedReflections?.length ? s.rounds.sharedReflections.map((r) => (
          <article key={r.uid}><strong>{s.participants.find((p) => p.uid === r.uid)?.nickname}</strong><p>{r.opinion || r.reflection?.opinion}</p></article>
        )) : <p>아직 공유된 생각이 없어요. 누구나 자신의 생각을 간직할 수 있습니다.</p>}
      </div>
      {breakdown.length > 0 && <details className="immersive-breakdown"><summary>점수 자세히 보기</summary>{breakdown.map((b, i) => <div key={i}><span>{b.label}</span><strong>{b.points} / {b.max}</strong><small>{b.reason}</small></div>)}</details>}
      <button className="immersive-primary" onClick={onReplay}>새로운 이야기 시작하기 →</button>
      <Link className="immersive-text-button" to="/">라운지로 돌아가기</Link>
    </section>
  );
}
