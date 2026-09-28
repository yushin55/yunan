import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "./Icon";
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    element?.addEventListener("cancel", onCancel);
    return () => element?.removeEventListener("cancel", onCancel);
  }, [onClose]);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-top">
        <span className="eyebrow">TAKE YOUR SEAT</span>
        <button aria-label="닫기" className="icon-button" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
