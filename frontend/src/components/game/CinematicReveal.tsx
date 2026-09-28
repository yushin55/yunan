import { ArrowRight, LockKeyhole, Music2, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Topic } from "../../types/game";
import "./CinematicReveal.css";

export interface CinematicRevealProps {
  phase: "topic" | "role" | "reveal";
  topic?: Topic;
  roleName?: string;
  onContinue?: () => void;
  busy?: boolean;
  timerLabel?: string;
  onDismiss?: () => void;
  audioEnabled?: boolean;
  onToggleAudio?: () => void;
  onReplayVoice?: () => void;
  musicEnabled?: boolean;
  onToggleMusic?: () => void;
}

const presentation = {
  topic: { serial: "01 / THE QUESTION", eyebrow: "오늘의 안건", action: "나의 관점 정하기" },
  role: { serial: "02 / THE SECRET", eyebrow: "당신의 비밀 역할", action: "이 역할로 시작하기" },
  reveal: { serial: "03 / THE UNMASKING", eyebrow: "정체 공개", action: "정체와 평가 보기" },
} as const;

/** A brief, full-screen beat between active turns of the table. */
export default function CinematicReveal({
  phase,
  topic,
  roleName,
  onContinue,
  busy = false,
  timerLabel,
  onDismiss,
  audioEnabled,
  onToggleAudio,
  onReplayVoice,
  musicEnabled,
  onToggleMusic,
}: CinematicRevealProps) {
  const item = presentation[phase];
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [phase]);
  useEffect(() => {
    if (!onDismiss) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);
  const title = phase === "topic"
    ? topic?.title || "오늘의 안건이 도착했습니다"
    : phase === "role"
      ? roleName || "당신의 역할을 확인하세요"
      : "가면이 벗겨집니다";
  const subtitle = phase === "topic"
    ? topic?.question && topic.question !== topic.title ? topic.question : "같은 질문 앞에서, 우리는 어디에 설까요?"
    : phase === "role"
      ? "이 역할의 관점으로 테이블에 앉아 다른 사람을 설득하세요."
      : "서로의 진짜 역할을 확인하고, 당신을 설득한 말을 떠올려 보세요.";

  return (
    <section className={`cinematic-reveal cinematic-reveal--${phase}`} role="dialog" aria-modal="true" aria-label={`${item.eyebrow}: ${title}`} data-testid="cinematic-reveal">
      <div className="cinematic-reveal__noise" aria-hidden="true" />
      <div className="cinematic-reveal__orb" aria-hidden="true"><span /></div>
      <div className="cinematic-reveal__topline">
        <span className="cinematic-reveal__brand">Y U N A N <i /> THE OTHER SIDE</span>
        <div className="cinematic-reveal__controls">
          {onReplayVoice && audioEnabled && (
            <button type="button" className="cinematic-reveal__audio" onClick={onReplayVoice} aria-label="음성 다시 듣기" title="음성 다시 듣기">
              <RotateCcw size={15} /> <span>다시 듣기</span>
            </button>
          )}
          {onToggleAudio && (
            <button type="button" className="cinematic-reveal__audio" onClick={onToggleAudio} aria-label={audioEnabled ? "음성 끄기" : "음성 켜기"} aria-pressed={Boolean(audioEnabled)} title={audioEnabled ? "음성 끄기" : "음성 켜기"}>
              {audioEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
              <span>{audioEnabled ? "음성 켜짐" : "음성 꺼짐"}</span>
            </button>
          )}
          {onToggleMusic && (
            <button type="button" className="cinematic-reveal__audio" onClick={onToggleMusic} disabled={!audioEnabled} aria-label={musicEnabled ? "배경음 끄기" : "배경음 켜기"} aria-pressed={Boolean(musicEnabled)} title={musicEnabled ? "배경음 끄기" : "배경음 켜기"}>
              <Music2 size={17} /> <span>{musicEnabled ? "배경음 켜짐" : "배경음 꺼짐"}</span>
            </button>
          )}
          {onDismiss && (
            <button type="button" className="cinematic-reveal__close" onClick={onDismiss} aria-label="연출 닫고 테이블 보기" title="테이블 보기"><X size={19} /></button>
          )}
        </div>
      </div>

      <div className="cinematic-reveal__stage">
        <div className="cinematic-reveal__rule" aria-hidden="true"><span /></div>
        <span className="cinematic-reveal__serial">{item.serial}</span>
        <p className="cinematic-reveal__eyebrow">{phase === "role" && <LockKeyhole size={15} aria-hidden="true" />} {item.eyebrow}</p>
        <h1 ref={titleRef} tabIndex={-1} className="cinematic-reveal__title" data-testid="cinematic-title">{title}</h1>
        <p className="cinematic-reveal__subtitle">{subtitle}</p>
        {phase === "topic" && topic && (
          <div className="cinematic-reveal__case">
            <span>CASE NOTE</span>
            <p>{topic.background}</p>
            <div className="cinematic-reveal__tags" aria-label="주제 분류">
              {topic.tags.map((tag) => <span key={tag}>{tag}</span>)}
              {topic.isHypothetical && <span>가상 토론 제안</span>}
            </div>
          </div>
        )}
        {phase === "role" && topic && <p className="cinematic-reveal__context">오늘의 안건 · {topic.shortTitle || topic.title}</p>}
        {phase === "reveal" && <div className="cinematic-reveal__emblem" aria-hidden="true">?</div>}
        <div className="cinematic-reveal__actions">
          {onContinue && (
            <button type="button" className="cinematic-reveal__continue" onClick={onContinue} disabled={busy}>
              {busy ? "잠시만 기다려 주세요" : item.action}<ArrowRight size={17} aria-hidden="true" />
            </button>
          )}
          {!onContinue && onDismiss && (
            <button type="button" className="cinematic-reveal__continue" onClick={onDismiss}>
              테이블 보기<ArrowRight size={17} aria-hidden="true" />
            </button>
          )}
          {timerLabel && <span className="cinematic-reveal__timer" aria-live="off">자동 진행까지 <strong>{timerLabel}</strong></span>}
        </div>
      </div>

      <div className="cinematic-reveal__bottomline">
        <span>한 사람의 진실은, 다른 사람의 반대편에서 보입니다.</span>
        <span>YUNAN / 합성 음성 내레이션</span>
      </div>
    </section>
  );
}
