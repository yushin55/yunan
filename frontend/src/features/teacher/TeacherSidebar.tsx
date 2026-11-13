import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { teacherStorageLocation } from "./teacherStorage";

const KEY = "bridge.teacher.memoOpen";

/** Open or closed as the teacher left it; on first use, open where there is room for it. Phones always start closed. */
export function useSidebar() {
  const [open, setOpen] = useState(() => {
    if (window.innerWidth <= 960) return false;
    try {
      const saved = localStorage.getItem(KEY);
      if (saved !== null) return saved === "1";
    } catch {
      /* Falls back to the screen width. */
    }
    return window.innerWidth >= 1200;
  });
  const set = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* Still toggles for this visit. */
    }
    // Opening puts the cursor in the memo, ready to type.
    if (next) requestAnimationFrame(() => document.getElementById("phase-memo-text")?.focus());
  };
  return [open, set] as const;
}

/**
 * The teacher's notes, in a sidebar that slides in from the right edge. A tab on its edge, halfway
 * down the screen, pulls it out and pushes it back; folded away, the game gets the whole width.
 * On a phone it slides over the page.
 */
export default function TeacherSidebar({ open, onOpenChange, count, attention, children }: { open: boolean; onOpenChange: (open: boolean) => void; count: number; attention: number; children: ReactNode }) {
  return (
    <aside className={`teacher-side${open ? " open" : ""}`} aria-label="선생님 메모">
      {open && <button className="side-backdrop" aria-label="메모 닫기" tabIndex={-1} onClick={() => onOpenChange(false)} />}
      <button
        className={`side-handle${attention ? " alert" : ""}`}
        data-testid="memo-toggle"
        aria-expanded={open}
        aria-controls="teacher-side-panel"
        aria-label={open ? "메모 닫기" : "메모 열기"}
        title={open ? "메모 닫기" : "메모 열기"}
        onClick={() => onOpenChange(!open)}
      >
        {open ? <ChevronRight size={20} aria-hidden /> : <ChevronLeft size={20} aria-hidden />}
        <span className="side-handle-label">메모</span>
        {count > 0 && <span className="side-handle-count">{count}</span>}
        {attention > 0 && <span className="side-handle-alert">확인 {attention}</span>}
      </button>
      <div className="side-panel" id="teacher-side-panel" aria-hidden={!open} inert={!open}>
        <div className="side-head">
          <div>
            <strong>선생님 메모</strong>
            <span className="muted small">{teacherStorageLocation()} 저장돼요</span>
          </div>
          <button className="button ghost small" onClick={() => onOpenChange(false)}>
            닫기
          </button>
        </div>
        <div className="side-body">{children}</div>
      </div>
    </aside>
  );
}
