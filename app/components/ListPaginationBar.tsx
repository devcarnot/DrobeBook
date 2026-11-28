export type ListPaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function buildListPagination(
  total: number,
  page: number,
  pageSize: number,
): ListPaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

export function ListPaginationBar({
  meta,
  onPageChange,
  label,
}: {
  meta: ListPaginationMeta;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (meta.totalPages <= 1) {
    return null;
  }

  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <nav className="gk-list-pagination" aria-label={`${label} pagination`}>
      <span className="gk-list-pagination__meta">
        Showing {from}–{to} of {meta.total}
      </span>
      <div className="gk-list-pagination__controls">
        <button
          type="button"
          className="gk-list-pagination__btn"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Previous
        </button>
        <span className="gk-list-pagination__page">
          Page {meta.page} of {meta.totalPages}
        </span>
        <button
          type="button"
          className="gk-list-pagination__btn"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}