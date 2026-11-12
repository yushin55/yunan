import { Pause } from "lucide-react";

/** Covers the playing surface while leaving the host's controls in reach. */
export default function PauseOverlay() {
  return (
    <div className="pause-overlay" role="status" aria-live="polite" data-testid="pause-overlay">
      <span className="pause-overlay-icon"><Pause size={80} strokeWidth={2.5} aria-hidden /></span>
      <strong>일시정지</strong>
      <p>선생님이 진행을 잠시 멈췄어요.<br />다시 시작할 때까지 기다려 주세요.</p>
    </div>
  );
}
