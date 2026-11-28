import { Link } from "react-router";

import type { WaitlistPagination as WaitlistPaginationMeta } from "../lib/waitlist/waitlist.server";

export function WaitlistPaginationBar({
  meta,
  buildHref,
  label,
}: {
  meta: WaitlistPaginationMeta;
  buildHref: (page: number) => string;
  label: string;
}) {
  if (meta.totalPages <= 1) {
    return null;
  }

  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <nav
      className="gk-waitlist-pagination"
      aria-label={`${label} pagination`}
    >
      <span className="gk-waitlist-pagination__meta">
        Showing {from}–{to} of {meta.total}
      </span>
      <div className="gk-waitlist-pagination__controls">
        {meta.page > 1 ? (
          <Link to={buildHref(meta.page - 1)} className="gk-waitlist-pagination__btn">
            Previous
          </Link>
        ) : (
          <span className="gk-waitlist-pagination__btn gk-waitlist-pagination__btn--disabled">
            Previous
          </span>
        )}
        <span className="gk-waitlist-pagination__page">
          Page {meta.page} of {meta.totalPages}
        </span>
        {meta.page < meta.totalPages ? (
          <Link to={buildHref(meta.page + 1)} className="gk-waitlist-pagination__btn">
            Next
          </Link>
        ) : (
          <span className="gk-waitlist-pagination__btn gk-waitlist-pagination__btn--disabled">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}