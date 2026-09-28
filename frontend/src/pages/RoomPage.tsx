import { lazy, Suspense, useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useRoom } from "../hooks/useRoom";
import { usePhaseTimer } from "../hooks/usePhaseTimer";
import {
  ArrowRight,
  Check,
  Clock3,
  Copy,
  Crown,
  Flag,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Users,
} from "../components/common/Icon";
import ActionPanel, {
  RoleCards,
  getRoleName,
} from "../components/game/ActionPanel";
import Modal from "../components/common/Modal";
import { PHASE_LABELS, PHASES, PLAYER_COLORS, POSITIONS } from "../types/game";
import type { Breakdown, Snapshot } from "../types/game";
import { api } from "../lib/api";
import { createPractice } from "../lib/practice";
const LoungeScene = lazy(() => import("../components/scene/LoungeScene"));
export default function RoomPage({ practice = false }: { practice?: boolean }) {
  const { roomId = "practice" } = useParams();
  const {
    snapshot: s,
    error,
    busy,
    connected,
    action,
    refresh,
  } = useRoom(roomId, practice);
  const [active, setActive] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState(false);
  const [reportTarget, setReportTarget] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);
  const [localError, setLocalError] = useState("");
  const timer = usePhaseTimer(s?.room.phaseEndsAt ?? null, s?.serverNow);
  const navigate = useNavigate();
  const closeReport = useCallback(() => setReport(false), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/join?code=${s?.room.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setLocalError(
        "주소 복사가 제한되어 있어요. 화면의 초대 코드를 직접 공유해 주세요.",
      );
    }
  }
  async function replay() {
    if (!s) return;
    if (practice) {
      createPractice(s.participants[0].nickname);
      window.location.reload();
      return;
    }
    try {
      const next = await api("/api/rooms", {
        nickname:
          s.participants.find((p) => p.uid === s.me.uid)?.nickname || "참가자",
        previousTopicId: s.room.topicId,
      });
      navigate(`/room/${next.room.roomId}`);
      window.location.reload();
    } catch (e) {
      setLocalError((e as Error).message);
    }
  }
  if (!s)
    return (
      <main className="page-loading">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="button secondary" onClick={() => void refresh()}>
              다시 연결
            </button>
            <Link to="/">홈으로</Link>
          </>
        ) : (
          <>
            <span className="spinner" />
            테이블에 연결하고 있어요.
          </>
        )}
      </main>
    );
  const phase = s.room.phase;
  const me = s.participants.find((p) => p.uid === s.me.uid)!;
  const isHost = s.room.hostUid === s.me.uid;
  const ready = s.participants.filter((p) => p.ready).length;
  const invite = `${location.origin}/join?code=${s.room.code}`;
  return (
    <main className="room-page">
      <div className="room-topbar">
        <div>
          <Link to="/" className="back-link">
            ← 라운지 나가기
          </Link>
          <span className="room-code-label">
            {practice ? "예시 캐릭터와 혼자 연습 중" : `TABLE · ${s.room.code}`}
          </span>
        </div>
        <div className="room-status">
          <span className={connected ? "live-dot" : "live-dot offline"} />
          {practice
            ? "연습 모드"
            : connected
              ? "실시간 연결됨"
              : "연결 복구 중"}
          <button
            className="icon-button"
            aria-label="참가자 신고"
            onClick={() => {
              setReported(false);
              setReport(true);
            }}
          >
            <Flag size={16} />
          </button>
        </div>
      </div>
      {(error || localError) && (
        <div className="error-box" role="alert">
          {error || localError}
          <button
            onClick={() => {
              setLocalError("");
              void refresh();
            }}
            className="text-button"
          >
            다시 연결
          </button>
        </div>
      )}
      <div className="game-heading">
        <div>
          <span className="eyebrow">
            {phase === "lobby"
              ? "YOUR TABLE IS WAITING"
              : `CHAPTER ${String(PHASES.indexOf(phase)).padStart(2, "0")}`}
          </span>
          <h1>
            {phase === "lobby"
              ? "자리가 모이면, 이야기가 시작됩니다."
              : PHASE_LABELS[phase]}
          </h1>
          {s.room.topic && <p>{s.room.topic.title}</p>}
        </div>
        <div
          className={`phase-timer ${timer.remaining !== null && timer.remaining < 15 ? "urgent" : ""}`}
        >
          <Clock3 size={20} />
          <div>
            <span>
              {phase === "lobby"
                ? "함께할 인원"
                : phase === "results"
                  ? "수고했어요"
                  : "남은 시간"}
            </span>
            <strong>
              {phase === "lobby"
                ? `${s.participants.length} / 6`
                : phase === "results"
                  ? "FIN"
                  : timer.label}
            </strong>
          </div>
        </div>
      </div>
      <div className="phase-track" aria-label="게임 진행 단계">
        {[
          "lobby",
          "initial",
          "claim",
          "scenario",
          "question",
          "guess",
          "reveal",
          "reflection",
          "results",
        ].map((p) => (
          <div
            key={p}
            className={
              p === phase
                ? "current"
                : PHASES.indexOf(p as typeof phase) < PHASES.indexOf(phase)
                  ? "complete"
                  : ""
            }
          >
            <span />
            {PHASE_LABELS[p as typeof phase]}
          </div>
        ))}
      </div>
      {phase === "results" ? (
        <Results snapshot={s} practice={practice} onReplay={replay} />
      ) : (
        <div className="game-grid">
          <div className="table-column">
            <div className="room-scene">
              <div className="scene-topline">
                <span>
                  <span className="live-dot" />
                  THE OTHER SIDE
                </span>
                <span>{practice ? "PRACTICE TABLE" : s.room.code}</span>
              </div>
              <Suspense
                fallback={
                  <div className="scene-loading">
                    <span className="spinner" />
                  </div>
                }
              >
                <LoungeScene
                  mode="room"
                  players={s.participants.map((p, i) => ({
                    ...p,
                    color: PLAYER_COLORS[i],
                  }))}
                  activePlayer={active}
                  onPlayerSelect={setActive}
                />
              </Suspense>
              <span className="room-scene-hint">
                캐릭터를 눌러 선택 · 드래그하여 둘러보기
              </span>
            </div>
            <div className="participant-strip">
              {s.participants.map((p, i) => (
                <button
                  key={p.uid}
                  onClick={() => setActive(p.uid)}
                  className={
                    p.uid === active ? "participant selected" : "participant"
                  }
                >
                  <span
                    className="avatar"
                    style={
                      {
                        "--avatar-color": PLAYER_COLORS[i],
                      } as React.CSSProperties
                    }
                  >
                    {p.nickname.slice(0, 1)}
                  </span>
                  <span>
                    <strong>
                      {p.nickname}
                      {p.uid === s.me.uid && <small>나</small>}
                      {p.uid === s.room.hostUid && <Crown size={11} />}
                    </strong>
                    <small>
                      {phase === "lobby"
                        ? p.ready
                          ? "준비 완료"
                          : "준비 중"
                        : getRoleName(s.room.topic, p.roleId)}
                    </small>
                  </span>
                  {(phase === "lobby"
                    ? p.ready
                    : p.submitted?.includes(phase)) && <Check size={13} />}
                </button>
              ))}
            </div>
            {s.me.cards && <RoleCards snapshot={s} />}
            <RoundHistory snapshot={s} active={active} />
            {phase === "lobby" && (
              <div className="lobby-guidelines">
                <span className="eyebrow">BEFORE WE BEGIN</span>
                <h3>서로의 생각을 지키는 약속.</h3>
                <p>
                  <ShieldCheck size={16} />
                  역할의 주장을 평가하고, 사람을 판단하지 않아요.
                </p>
                <p>
                  <LockKeyhole size={16} />
                  처음의 진짜 생각은 마지막까지 나만 볼 수 있어요.
                </p>
                <p>
                  <Users size={16} />
                  주제는 게임 시작 순간 무작위로 정해져요.
                </p>
              </div>
            )}
          </div>
          <aside className="interaction-column">
            {phase === "lobby" ? (
              <section className="action-panel lobby-panel">
                <span className="eyebrow">INVITE YOUR PEOPLE</span>
                <h2>
                  {practice
                    ? "연습 테이블이 준비됐어요."
                    : "친구를 테이블에 초대하세요."}
                </h2>
                <p className="body-copy">
                  {practice
                    ? "모카, 올리브, 루카는 미리 작성된 예시로 참여하는 연습 캐릭터입니다. 내 선택과 글로 게임 전체를 체험해 보세요."
                    : "4명 이상이 준비되면 방장이 게임을 시작할 수 있어요. 최대 6명까지 함께할 수 있습니다."}
                </p>
                {!practice && (
                  <>
                    <div className="invite-card">
                      <QRCodeSVG
                        value={invite}
                        size={116}
                        bgColor="#f5f0e7"
                        fgColor="#162222"
                        marginSize={1}
                      />
                      <div>
                        <span>초대 코드</span>
                        <strong>{s.room.code}</strong>
                        <button className="text-button" onClick={copy}>
                          {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                          {copied ? "복사했어요" : "초대 링크 복사"}
                        </button>
                      </div>
                    </div>
                    <p className="lobby-count">
                      <span>
                        <Users size={16} />
                        {s.participants.length}명 입장
                      </span>
                      <span>
                        <Check size={16} />
                        {ready}명 준비 완료
                      </span>
                    </p>
                  </>
                )}
                {!isHost && (
                  <button
                    className={
                      me.ready ? "button secondary full" : "button primary full"
                    }
                    disabled={busy}
                    onClick={() => void action("ready", { ready: !me.ready })}
                  >
                    {me.ready ? (
                      <>
                        <Check size={16} />
                        준비 완료 · 취소하기
                      </>
                    ) : (
                      "준비 완료하기"
                    )}
                  </button>
                )}
                {isHost && (
                  <button
                    className="button primary full"
                    disabled={
                      busy ||
                      s.participants.length < 4 ||
                      ready !== s.participants.length
                    }
                    onClick={() => void action("start")}
                  >
                    {busy ? (
                      <span className="spinner" />
                    ) : (
                      <ArrowRight size={18} />
                    )}{" "}
                    {practice ? "연습 게임 시작" : "모두 모였어요, 시작하기"}
                  </button>
                )}
                <p className="auto-notice">
                  {practice
                    ? "연습 데이터는 이 브라우저에만 저장됩니다."
                    : s.participants.length < 4
                      ? `시작까지 ${4 - s.participants.length}명이 더 필요해요.`
                      : ready !== s.participants.length
                        ? "모든 참가자의 준비를 기다리고 있어요."
                        : isHost
                          ? "준비됐어요. 오늘의 이야기를 열어보세요."
                          : "방장이 시작할 때까지 기다려 주세요."}
                </p>
              </section>
            ) : (
              <ActionPanel
                key={`${phase}-${s.room.phaseVersion}`}
                snapshot={s}
                action={action}
                busy={busy}
                practice={practice}
              />
            )}
            <div className="table-caption">
              <span>생각을 바꾸지 않아도 괜찮아요.</span>
              <p>좋은 질문과 진심 어린 대변이 이 게임의 승리입니다.</p>
            </div>
          </aside>
        </div>
      )}
      {report && (
        <Modal title="테이블의 안전을 지켜주세요." onClose={closeReport}>
          {reported ? (
            <div className="waiting-panel">
              <ShieldCheck size={35} />
              <h3>신고를 접수했어요.</h3>
              <p>신고 내용은 다른 참가자에게 공개되지 않습니다.</p>
              <button className="button secondary full" onClick={closeReport}>
                닫기
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await action("report", {
                    targetUid: reportTarget,
                    reason: reportReason,
                  })
                )
                  setReported(true);
              }}
            >
              <label className="field-label" htmlFor="report-target">
                신고 대상
              </label>
              <select
                id="report-target"
                required
                value={reportTarget}
                onChange={(e) => setReportTarget(e.target.value)}
              >
                <option value="">참가자 선택</option>
                {s.participants
                  .filter((p) => p.uid !== s.me.uid)
                  .map((p) => (
                    <option key={p.uid} value={p.uid}>
                      {p.nickname}
                    </option>
                  ))}
              </select>
              <label className="field-label" htmlFor="report-reason">
                신고 사유
              </label>
              <textarea
                id="report-reason"
                required
                maxLength={240}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              />
              {practice && (
                <p className="auto-notice">
                  연습 모드에서는 신고 전송을 연습하며 실제 접수되지 않습니다.
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                비공개로 신고하기
              </button>
            </form>
          )}
        </Modal>
      )}
    </main>
  );
}
function RoundHistory({
  snapshot: s,
  active,
}: {
  snapshot: Snapshot;
  active?: string;
}) {
  const [tab, setTab] = useState<"claim" | "scenario" | "question">("claim");
  const rows = s.rounds[tab] || [];
  if (
    s.room.phase === "lobby" ||
    s.room.phase === "topic" ||
    s.room.phase === "initial" ||
    s.room.phase === "role"
  )
    return null;
  return (
    <section className="round-history">
      <div className="history-tabs">
        {(["claim", "scenario", "question"] as const).map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {PHASE_LABELS[t]}
            <span>{s.rounds[t]?.length || 0}</span>
          </button>
        ))}
      </div>
      {rows.length ? (
        rows
          .filter((r) => !active || r.uid === active || r.targetUid === active)
          .map((r, i) => (
            <article className="history-message" key={`${r.uid}-${i}`}>
              <div>
                <strong>
                  {s.participants.find((p) => p.uid === r.uid)?.nickname}
                </strong>
                <span>
                  {getRoleName(
                    s.room.topic,
                    s.participants.find((p) => p.uid === r.uid)?.roleId,
                  )}
                </span>
                {r.targetUid && (
                  <small>
                    →{" "}
                    {
                      s.participants.find((p) => p.uid === r.targetUid)
                        ?.nickname
                    }
                  </small>
                )}
              </div>
              {r.optionId && (
                <span className="history-option">
                  {
                    s.room.topic?.scenario.options.find(
                      (o) => o.id === r.optionId,
                    )?.text
                  }
                </span>
              )}
              <p>
                {r.timedOut ? "시간 내 제출하지 않았어요." : r.text || r.reason}
              </p>
              {r.cardConnection && (
                <small className="card-citation">
                  관점 연결 · {r.cardConnection}
                </small>
              )}
              {r.targetUid && (
                <div className="history-answer">
                  {r.answer || "답변을 기다리고 있어요."}
                </div>
              )}
            </article>
          ))
      ) : (
        <div className="empty-history">
          <LockKeyhole size={22} />
          <p>
            {tab === "question"
              ? "질문이 도착하면 이곳에 표시됩니다."
              : "마감 후 모두의 이야기가 이곳에 공개됩니다."}
          </p>
        </div>
      )}
      {active && (
        <p className="auto-notice">
          선택한 참가자의 이야기만 표시 중입니다. 다른 캐릭터를 선택해
          살펴보세요.
        </p>
      )}
    </section>
  );
}
function Results({
  snapshot: s,
  practice,
  onReplay,
}: {
  snapshot: Snapshot;
  practice: boolean;
  onReplay: () => void;
}) {
  const result = s.results?.me;
  const breakdown = Array.isArray(result?.breakdown)
    ? (result.breakdown as (Breakdown & { rule?: string })[])
    : [];
  return (
    <div className="results-layout">
      <section className="result-main">
        <span className="eyebrow">A DIFFERENT PERSPECTIVE</span>
        <h2>같은 나, 조금 더 넓어진 시선.</h2>
        <p className="body-copy">
          낯선 입장에서 생각해 본 당신의 플레이를 돌아보세요.
        </p>
        <div className="score-orb">
          <strong>
            {result?.total ?? 0}
            <small> / 100</small>
          </strong>
          <span>{practice ? "연습 참여 점수" : "이번 테이블의 나의 점수"}</span>
        </div>
        {practice && (
          <div className="notice">
            <ShieldCheck size={17} />
            <p>
              연습 캐릭터는 사람의 평가를 대신하지 않습니다. 참가자 평가 점수와
              실제 추리 기반 보너스는 연습에서 부여하지 않습니다.
            </p>
          </div>
        )}
        <div className="guess-result">
          <FingerprintIcon />
          <div>
            <strong>
              {s.me.guess
                ? result?.guessCorrect
                  ? "추리 성공! 낯선 역할을 찾아냈어요."
                  : "예상 밖의 반전! 전환자를 놓쳤어요."
                : "이번 판은 추리를 제출하지 않았어요."}
            </strong>
            <p>정답보다 중요한 건, 판단의 이유를 생각해 본 경험이에요.</p>
          </div>
        </div>
        <div className="score-breakdown">
          {breakdown.map((b, i) => (
            <details key={i}>
              <summary>
                <span>{b.label}</span>
                <strong>
                  {b.points}
                  <small> / {b.max}</small>
                </strong>
              </summary>
              <p>{b.reason || b.rule}</p>
            </details>
          ))}
        </div>
        <button className="button primary full" onClick={onReplay}>
          <RotateCcw size={17} />
          새로운 주제로 다시 만나기
        </button>
        <Link to="/" className="button text-button full">
          라운지 홈으로
          <ArrowRight size={16} />
        </Link>
      </section>
      <div>
        <section className="reflection-result">
          <span className="eyebrow">
            <LockKeyhole size={13} /> ONLY FOR YOU
          </span>
          <h3>나에게 돌아온 두 개의 목소리</h3>
          <div>
            <span>게임 전</span>
            <strong>
              {s.me.initialPosition?.reason ? (POSITIONS.find((p) => p.value === s.me.initialPosition?.position)
                ?.label || "미제출") : "미제출"}
            </strong>
            <p>{s.me.initialPosition?.reason || "남긴 의견이 없어요."}</p>
          </div>
          <div>
            <span>게임 후</span>
            <strong>
              {POSITIONS.find((p) => p.value === s.me.reflection?.position)
                ?.label || "미제출"}
            </strong>
            <p>{s.me.reflection?.opinion || "남긴 의견이 없어요."}</p>
          </div>
          <h4>새롭게 이해한 점</h4>
          <p>{s.me.reflection?.understood || "아직 작성하지 않았어요."}</p>
          <h4>여전히 동의하지 않는 점</h4>
          <p>{s.me.reflection?.disagree || "아직 작성하지 않았어요."}</p>
          <span className="privacy-inline">
            <ShieldCheck size={14} />
            의견 변화는 점수에 반영되지 않아요.
          </span>
        </section>
        <section className="table-results">
          <span className="eyebrow">THE PEOPLE BEHIND THE ROLES</span>
          <h3>가면 뒤의 플레이어들</h3>
          <div className="reveal-list">
            {s.rounds.reveal?.map((reveal) => {
              const player = s.participants.find((p) => p.uid === reveal.uid);
              const score = s.results?.players.find(
                (p) => p.uid === reveal.uid,
              );
              return (
                <div key={reveal.uid}>
                  <span>{player?.nickname}</span>
                  <strong>{getRoleName(s.room.topic, reveal.roleId)}</strong>
                  <span
                    className={reveal.isSwitcher ? "switcher-badge" : "tag"}
                  >
                    {reveal.isSwitcher ? "전환자" : "선호 역할"}
                  </span>
                  <span className="public-score">
                    {score ? `${score.total}점` : "연습"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="privacy-inline">
            <LockKeyhole size={13} />
            원래의 실제 의견과 선호 순위는 공개하지 않습니다.
          </p>
        </section>
        <section className="shared-reflections">
          <span className="eyebrow">VOICES AROUND THE TABLE</span>
          <h3>함께 나누기로 한 이야기</h3>
          {s.rounds.sharedReflections?.length ? (
            s.rounds.sharedReflections.map((r) => (
              <article key={r.uid}>
                <strong>
                  {s.participants.find((p) => p.uid === r.uid)?.nickname}
                </strong>
                <p>{r.opinion || r.reflection?.opinion}</p>
              </article>
            ))
          ) : (
            <p className="body-copy">
              아직 공유된 의견이 없어요.
              <br />
              누구나 자신의 생각을 간직할 수 있습니다.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
function FingerprintIcon() {
  return <span className="guess-icon">✳</span>;
}
