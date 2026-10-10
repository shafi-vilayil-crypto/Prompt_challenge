/** "‹ 2 / 5 ›" page switcher. Renders nothing when everything fits on one page. */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="btn small" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label="Previous page">‹ Prev</button>
      <span className="pager-text">{page + 1} / {pages}</span>
      <button type="button" className="btn small" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">Next ›</button>
    </nav>
  );
}

/** Slice of `items` for a page, with the page clamped when the list shrinks. */
export function paginate<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { pageItems: items.slice(p * size, p * size + size), pages, page: p };
}
