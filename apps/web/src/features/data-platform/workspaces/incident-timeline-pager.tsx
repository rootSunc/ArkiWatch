"use client";

import { useI18n, type LanguageMode } from "../i18n";

export const INCIDENT_TIMELINE_PAGE_SIZE = 8;

export function paginateTimelineItems<T>(
  items: T[],
  page: number,
  pageSize = INCIDENT_TIMELINE_PAGE_SIZE
) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(0, page), pageCount - 1);
  const startIndex = currentPage * pageSize;

  return {
    currentPage,
    pageCount,
    pageSize,
    startIndex,
    items: items.slice(startIndex, startIndex + pageSize),
  };
}

function formatPagerRange(
  start: number,
  end: number,
  total: number,
  language: LanguageMode
): string {
  if (language === "zh") {
    return `第 ${start} - ${end} 条，共 ${total} 条`;
  }

  return `${start} - ${end} of ${total}`;
}

type IncidentTimelinePagerProps = {
  currentPage: number;
  onPageChange: (page: number) => void;
  pageCount: number;
  startIndex: number;
  totalCount: number;
  visibleCount: number;
};

export function IncidentTimelinePager({
  currentPage,
  onPageChange,
  pageCount,
  startIndex,
  totalCount,
  visibleCount,
}: IncidentTimelinePagerProps) {
  const { language, tKey } = useI18n();

  if (totalCount <= INCIDENT_TIMELINE_PAGE_SIZE && pageCount <= 1) {
    return null;
  }

  const rangeStart = totalCount > 0 ? startIndex + 1 : 0;
  const rangeEnd = startIndex + visibleCount;
  const rangeLabel = formatPagerRange(rangeStart, rangeEnd, totalCount, language);
  const pageLabel = pageCount > 1 ? `${tKey("shell.page")} ${currentPage + 1}/${pageCount}` : null;

  return (
    <nav className="incident-timeline-pager" aria-label={tKey("shell.incidentTimelinePagination")}>
      <button
        aria-label={tKey("shell.previous")}
        className="incident-timeline-pager-button"
        disabled={currentPage === 0}
        onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        type="button"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          chevron_left
        </span>
        <span>{tKey("shell.previous")}</span>
      </button>
      <p className="incident-timeline-pager-status" aria-live="polite">
        <strong>{rangeLabel}</strong>
        {pageLabel ? <span>{pageLabel}</span> : null}
      </p>
      <button
        aria-label={tKey("shell.next")}
        className="incident-timeline-pager-button"
        disabled={currentPage >= pageCount - 1 || totalCount === 0}
        onClick={() => onPageChange(Math.min(pageCount - 1, currentPage + 1))}
        type="button"
      >
        <span>{tKey("shell.next")}</span>
        <span className="material-symbols-outlined" aria-hidden="true">
          chevron_right
        </span>
      </button>
    </nav>
  );
}
