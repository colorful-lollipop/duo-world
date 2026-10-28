import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  className = "",
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={"modal " + (wide ? "modal-wide " : "") + className} role="dialog" aria-modal="true" aria-label={title}>
        {title && (
          <header className="modal-head">
            <h2>{title}</h2>
            <button className="icon-button" onClick={onClose} aria-label="关闭">
              <Icon name="close" size={20} />
            </button>
          </header>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ notice }: { notice: { id: number; text: string } | null }) {
  if (!notice) return null;
  return (
    <div className="toast" role="status" key={notice.id}>
      {notice.text}
    </div>
  );
}
