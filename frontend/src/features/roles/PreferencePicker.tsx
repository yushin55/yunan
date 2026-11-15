import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { Role } from "../../types/game";
import RoleAvatar from "./RoleAvatar";

type Picked = [string | null, string | null];

/**
 * One tap picks: the first card tapped is 1순위, the next 2순위. Tapping a picked card takes it out;
 * with both taken, a new card replaces 2순위.
 */
export function tapPick([first, second]: Picked, id: string): Picked {
  if (first === id) return [second, null];
  if (second === id) return [first, null];
  return first ? [first, id] : [id, second];
}

/**
 * Role cards with what each role wants written on the front. Students pick the roles closest to
 * what they really think; nobody else (including the teacher) can see the choice.
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
  const indexOf = (id: string) => roles.findIndex((r) => r.id === id);
  const name = (id: string) => roles[indexOf(id)]?.name ?? "";

  if (saved && !editing) {
    return (
      <div className="prefs-done">
        <p className="success-line">
          <Check size={18} aria-hidden /> 골랐어요. 모두 고르면 게임이 시작돼요.
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
        <button className="button ghost small" onClick={() => (onEdit ? onEdit() : setEditing(true))}>
          <RotateCcw size={15} /> 다시 고르기
        </button>
      </div>
    );
  }

  const ready = picked[0] && picked[1];
  const clear = (slot: number) => setPicked((p) => (slot ? [p[0], null] : [p[1], null]));

  return (
    <div className="role-deck" data-testid="wardrobe">
      <div className="wardrobe-slots compact">
        {[0, 1].map((slot) => {
          const id = picked[slot];
          return (
            <div key={slot} data-testid={`slot-${slot + 1}`} className={`wardrobe-slot${id ? " filled" : ""}`}>
              <span className="slot-rank">{slot + 1}순위</span>
              {id ? (
                <>
                  <strong>{name(id)}</strong>
                  <button className="slot-remove icon-button" onClick={() => clear(slot)} aria-label={`${slot + 1}순위 비우기`}>
                    <X size={14} />
                  </button>
                </>
              ) : (
                <span className="muted small">{slot === 0 || picked[0] ? "카드를 눌러 고르기" : ""}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="role-cards" role="list" aria-label="역할 카드">
        {roles.map((role, i) => {
          const rank = picked.indexOf(role.id) + 1;
          return (
            <button
              key={role.id}
              role="listitem"
              type="button"
              data-testid="role-card"
              className={`role-tap${rank ? " picked" : ""}`}
              aria-pressed={rank > 0}
              aria-label={`${role.name}${rank ? ` (${rank}순위, 누르면 빼요)` : ""}. ${role.goal}`}
              onClick={() => setPicked((p) => tapPick(p, role.id))}
            >
              {rank > 0 && <em className="role-flip-rank">{rank}순위</em>}
              <RoleAvatar name={role.name} index={i} />
              <strong>{role.name}</strong>
              <span className="role-tap-goal">{role.goal}</span>
            </button>
          );
        })}
      </div>

      <button
        className="button primary full large"
        data-testid="wardrobe-submit"
        disabled={!ready || busy}
        onClick={() => {
          setEditing(false);
          onSubmit(picked[0]!, picked[1]!);
        }}
      >
        {ready ? "이 순서로 정하기" : `${picked[0] ? "2" : "1"}순위 역할을 눌러 주세요`}
      </button>
    </div>
  );
}
