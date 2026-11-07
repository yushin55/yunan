import { useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { Role } from "../../types/game";
import RoleAvatar from "./RoleAvatar";

type Picked = [string | null, string | null];
const DRAG_PX = 8;

/** The slot (0 or 1) under the pointer, if any. The dragged copy ignores the pointer so it never hides a slot. */
function slotAt(x: number, y: number) {
  const slot = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]")?.dataset.slot;
  return slot === undefined ? null : Number(slot);
}

/** Puts a role into a slot. A role moving between slots swaps places with whatever was there. */
export function place(picked: Picked, id: string, slot: number): Picked {
  const next: Picked = [...picked];
  const from = next.indexOf(id);
  const there = next[slot];
  next[slot] = id;
  if (from >= 0 && from !== slot) next[from] = there;
  return next;
}

/**
 * Role cards: the front shows the character, the back what the role wants and worries about.
 * Tap a card to turn it over; drag it into the 1st or 2nd choice slot. The keys 1 and 2 do the
 * same for keyboards. Students pick the roles closest to what they really think; nobody else
 * (including the teacher) can see the choice.
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
  const [picked, setPicked] = useState<Picked>(start ? [start.first, start.second] : [null, null]);
  const [editing, setEditing] = useState(false);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: number | null } | null>(null);
  const press = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const indexOf = (id: string) => roles.findIndex((r) => r.id === id);
  const name = (id: string) => roles[indexOf(id)]?.name ?? "";

  if (saved && !editing) {
    return (
      <div className="prefs-done">
        <p className="success-line">
          <Check size={18} aria-hidden /> 역할을 골랐어요. 모두 고르면 3초 뒤에 게임이 시작돼요.
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
        <p className="muted small">이 선택은 나만 볼 수 있어요.</p>
        <button className="button ghost small" onClick={() => (onEdit ? onEdit() : setEditing(true))}>
          <RotateCcw size={15} /> 다시 고르기
        </button>
      </div>
    );
  }

  const flip = (id: string) => setFlipped((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const put = (id: string, slot: number) => setPicked((p) => place(p, id, slot));
  const clear = (slot: number) => setPicked((p) => (slot ? [p[0], null] : [null, p[1]]));
  const ready = picked[0] && picked[1];

  const onDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    press.current = { id, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
    p.moved = true;
    setDrag({ id: p.id, x: e.clientX, y: e.clientY, over: slotAt(e.clientX, e.clientY) });
  };
  const onUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    setDrag(null);
    if (!p) return;
    if (!p.moved) return flip(p.id);
    const slot = slotAt(e.clientX, e.clientY);
    if (slot !== null) put(p.id, slot);
  };
  const onCancel = () => {
    press.current = null;
    setDrag(null);
  };

  return (
    <div className="role-deck" data-testid="wardrobe">
      <p className="muted role-deck-hint">
        <strong>내 생각과 가장 가까운 역할</strong> 카드를 끌어서 1순위·2순위 칸에 놓아 주세요. 카드를 누르면 뒷면의 설명을 볼 수 있어요.
      </p>
      <div className="wardrobe-slots">
        {[0, 1].map((slot) => {
          const id = picked[slot];
          return (
            <div key={slot} data-slot={slot} data-testid={`slot-${slot + 1}`} className={`wardrobe-slot${id ? " filled" : ""}${drag?.over === slot ? " over" : ""}`}>
              <span className="slot-rank">{slot + 1}순위</span>
              {id ? (
                <>
                  <RoleAvatar name={name(id)} index={indexOf(id)} />
                  <strong>{name(id)}</strong>
                  <button className="slot-remove icon-button" onClick={() => clear(slot)} aria-label={`${slot + 1}순위 비우기`}>
                    <X size={14} />
                  </button>
                </>
              ) : (
                <span className="muted small">여기에 카드를 끌어 놓으세요</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="role-cards" role="list" aria-label="역할 카드">
        {roles.map((role, i) => {
          const rank = picked.indexOf(role.id) + 1;
          const back = flipped.includes(role.id);
          return (
            <button
              key={role.id}
              role="listitem"
              data-testid="role-card"
              className={`role-flip${back ? " flipped" : ""}${rank ? " picked" : ""}${drag?.id === role.id ? " dragging" : ""}`}
              aria-label={`${role.name}${rank ? ` (${rank}순위)` : ""}. 누르면 카드를 뒤집어요. 1 또는 2를 누르면 그 순위에 놓아요.`}
              onPointerDown={(e) => onDown(e, role.id)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  flip(role.id);
                }
                if (e.key === "1" || e.key === "2") put(role.id, Number(e.key) - 1);
              }}
            >
              <span className="role-flip-inner">
                <span className="role-face front">
                  <RoleAvatar name={role.name} index={i} />
                  <strong>{role.name}</strong>
                </span>
                <span className="role-face back">
                  <strong>{role.name}</strong>
                  <span className="role-intro">{role.intro}</span>
                  <span>
                    <b className="label">목표</b> {role.goal}
                  </span>
                  <span className="muted small">
                    <b className="label">걱정하는 점</b> {role.concerns.join(" ")}
                  </span>
                </span>
              </span>
              {rank > 0 && <em className="role-flip-rank">{rank}순위</em>}
            </button>
          );
        })}
      </div>

      {drag && (
        <div className="role-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden>
          <RoleAvatar name={name(drag.id)} index={indexOf(drag.id)} />
          <strong>{name(drag.id)}</strong>
        </div>
      )}

      <button
        className="button primary full large"
        data-testid="wardrobe-submit"
        disabled={!ready || busy}
        onClick={() => {
          setEditing(false);
          onSubmit(picked[0]!, picked[1]!);
        }}
      >
        {ready ? `1순위 ${name(picked[0]!)} · 2순위 ${name(picked[1]!)}로 정하기` : `카드 ${picked.filter((x) => !x).length}장을 더 놓아 주세요`}
      </button>
    </div>
  );
}
