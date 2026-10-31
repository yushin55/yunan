import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw, Shirt, X } from "lucide-react";
import type { Role } from "../../types/game";
import RoleAvatar from "./RoleAvatar";

/**
 * Picks the roles a student would like to play, like trying on outfits: browse the characters
 * on a lit stage and put two of them into the 1st and 2nd choice slots. This is a game choice,
 * not the student's own opinion, and nobody else (including the teacher) can see it.
 */
export default function PreferencePicker({
  roles,
  saved,
  initial = null,
  busy,
  onSubmit,
  onEdit,
}: {
  roles: Role[];
  saved: { first: string; second: string } | null;
  /** Choices to start from when picking again. */
  initial?: { first: string; second: string } | null;
  busy: boolean;
  onSubmit: (first: string, second: string) => void;
  /** "다시 고르기" handled by the parent (e.g. reopening the full-screen picker). */
  onEdit?: () => void;
}) {
  const start = saved ?? initial;
  const [picked, setPicked] = useState<string[]>(start ? [start.first, start.second] : []);
  // Only "다시 고르기" reopens the picker; a saved choice shows the summary.
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const swipe = useRef<number | null>(null);
  const indexOf = (id: string) => roles.findIndex((r) => r.id === id);
  const name = (id: string) => roles[indexOf(id)]?.name ?? "";

  if (saved && !editing) {
    return (
      <div className="prefs-done">
        <p className="success-line">
          <Check size={18} aria-hidden /> 선호 역할을 골랐어요. 선생님이 시작하면 역할이 배정돼요.
        </p>
        <div className="wardrobe-slots done">
          {[saved.first, saved.second].map((id, i) => (
            <div key={id} className="wardrobe-slot filled">
              <span className="slot-rank">{i + 1}순위</span>
              <RoleAvatar name={name(id)} index={indexOf(id)} />
              <strong>{name(id)}</strong>
            </div>
          ))}
        </div>
        <p className="muted small">이 선택은 나만 볼 수 있어요. 게임에서 맡고 싶은 역할일 뿐, 내 실제 생각으로 기록되지 않아요.</p>
        <button className="button ghost small" onClick={() => (onEdit ? onEdit() : setEditing(true))}>
          <RotateCcw size={15} /> 다시 고르기
        </button>
      </div>
    );
  }

  const role = roles[view];
  const rank = picked.indexOf(role.id) + 1;
  const go = (step: number) => {
    setDirection(step > 0 ? "right" : "left");
    setView((v) => (v + step + roles.length) % roles.length);
  };
  const show = (index: number) => {
    setDirection(index > view ? "right" : "left");
    setView(index);
  };
  const toggle = () =>
    setPicked((current) => (current.includes(role.id) ? current.filter((x) => x !== role.id) : current.length >= 2 ? [current[0], role.id] : [...current, role.id]));
  const addLabel = rank ? `${rank}순위에서 빼기` : picked.length === 0 ? "이 역할을 1순위로 담기" : picked.length === 1 ? "이 역할을 2순위로 담기" : "2순위와 바꾸기";

  return (
    <div className="wardrobe" data-testid="wardrobe">
      <p className="muted">
        게임에서 <strong>맡고 싶은 역할</strong>을 옷 고르듯 둘러보고, 두 개를 골라 1순위와 2순위 칸에 담아 주세요.
      </p>
      <div className="wardrobe-slots">
        {[0, 1].map((slot) => {
          const id = picked[slot];
          return id ? (
            <div key={slot} className="wardrobe-slot filled">
              <span className="slot-rank">{slot + 1}순위</span>
              <button className="slot-view" onClick={() => show(indexOf(id))} aria-label={`${name(id)} 다시 보기`}>
                <RoleAvatar name={name(id)} index={indexOf(id)} />
              </button>
              <strong>{name(id)}</strong>
              <button className="slot-remove icon-button" onClick={() => setPicked((p) => p.filter((x) => x !== id))} aria-label={`${slot + 1}순위 비우기`}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div key={slot} className="wardrobe-slot">
              <span className="slot-rank">{slot + 1}순위</span>
              <Shirt size={28} aria-hidden />
              <span className="muted small">비어 있어요</span>
            </div>
          );
        })}
      </div>

      <div
        className="dress-room"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 40) go(e.clientX < swipe.current ? 1 : -1);
          swipe.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(-1);
          if (e.key === "ArrowRight") go(1);
        }}
        tabIndex={0}
        aria-label={`역할 둘러보기: ${role.name} (${view + 1}/${roles.length})`}
      >
        <button className="dress-arrow left" onClick={() => go(-1)} aria-label="이전 역할">
          <ChevronLeft size={28} />
        </button>
        <div className="dress-stage">
          <span className="dress-light" aria-hidden />
          <span className="dress-platform" aria-hidden />
          <div className={`dress-model enter-${direction}`} key={role.id}>
            <RoleAvatar name={role.name} index={view} />
          </div>
          {rank > 0 && <span className="dress-rank">{rank}순위</span>}
          <span className="dress-count">
            {view + 1} / {roles.length}
          </span>
        </div>
        <button className="dress-arrow right" onClick={() => go(1)} aria-label="다음 역할">
          <ChevronRight size={28} />
        </button>
      </div>

      <div className="dress-info" key={`i${role.id}`}>
        <h3 data-testid="wardrobe-name">{role.name}</h3>
        <p className="role-intro">{role.intro}</p>
        <p>
          <strong className="label">목표</strong> {role.goal}
        </p>
        <p className="muted small">
          <strong className="label">걱정하는 점</strong> {role.concerns.join(" ")}
        </p>
        <button className={`button ${rank ? "ghost" : "secondary"} full`} data-testid="wardrobe-add" onClick={toggle}>
          {addLabel}
        </button>
      </div>

      <div className="wardrobe-rack" role="list" aria-label="모든 역할">
        {roles.map((r, i) => {
          const rRank = picked.indexOf(r.id) + 1;
          return (
            <button
              key={r.id}
              role="listitem"
              className={`rack-item${i === view ? " active" : ""}${rRank ? " picked" : ""}`}
              onClick={() => show(i)}
              aria-label={`${r.name}${rRank ? ` (${rRank}순위)` : ""}`}
            >
              <RoleAvatar name={r.name} index={i} />
              <span>{r.name}</span>
              {rRank > 0 && <em>{rRank}</em>}
            </button>
          );
        })}
      </div>

      <button
        className="button primary full large"
        data-testid="wardrobe-submit"
        disabled={picked.length !== 2 || busy}
        onClick={() => {
          setEditing(false);
          onSubmit(picked[0], picked[1]);
        }}
      >
        {picked.length === 2 ? `1순위 ${name(picked[0])} · 2순위 ${name(picked[1])}로 정하기` : `역할 ${2 - picked.length}개를 더 담아 주세요`}
      </button>
    </div>
  );
}
