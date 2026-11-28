import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export function WaitlistConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  destructive = true,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="gk-dialog-root" role="presentation">
      <button
        type="button"
        className="gk-dialog-backdrop"
        aria-label="Close dialog"
        onClick={onCancel}
      />
      <div
        className="gk-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gk-waitlist-confirm-title"
        aria-describedby="gk-waitlist-confirm-desc"
      >
        <div className="gk-dialog__header">
          <h2 className="gk-dialog__title" id="gk-waitlist-confirm-title">
            {title}
          </h2>
          <button
            type="button"
            className="gk-dialog__close"
            aria-label="Close"
            onClick={onCancel}
          >
            ×
          </button>
        </div>
        <div className="gk-dialog__body">
          <p className="gk-dialog__description" id="gk-waitlist-confirm-desc">
            {description}
          </p>
          <div className="gk-dialog__footer">
            <button
              ref={cancelRef}
              type="button"
              className="gk-waitlist-btn gk-waitlist-btn--secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`gk-waitlist-btn ${destructive ? "gk-waitlist-btn--danger" : "gk-waitlist-btn--primary"}`}
              style={
                destructive
                  ? {
                      border: "1px solid #fecdca",
                      background: "#fef3f2",
                      fontWeight: 600,
                    }
                  : undefined
              }
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}