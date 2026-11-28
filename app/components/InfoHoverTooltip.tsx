import type { ReactNode } from "react";

export function InfoHoverTooltip({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="gk-info-tooltip-wrap">
      <button type="button" className="gk-info-tooltip-btn" aria-label={ariaLabel}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M12 10v6M12 7h.01"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="gk-info-tooltip" role="tooltip">
        {children}
      </div>
    </div>
  );
}