"use client";

import { useI18n } from "../i18n";
import type { TodayBrief } from "./today-brief";

type TodayDigestStripProps = {
  todayBrief: TodayBrief | null;
  onOpenToday: () => void;
};

/**
 * A single-line, low-emphasis pointer to the Life assistant recommendation.
 * The Data platform is the primary surface; this strip keeps today's
 * headline reachable without competing with the signal observatory below it.
 */
export function TodayDigestStrip({ todayBrief, onOpenToday }: TodayDigestStripProps) {
  const { tKey } = useI18n();

  if (!todayBrief?.headline) {
    return null;
  }

  return (
    <button className="today-digest-strip" onClick={onOpenToday} type="button">
      <span className="material-symbols-outlined" aria-hidden="true">
        calendar_today
      </span>
      <span className="today-digest-strip-copy">
        <span className="today-digest-strip-label">{tKey("shell.todayDigestLabel")}</span>
        <strong>{todayBrief.headline}</strong>
      </span>
      <span className="today-digest-strip-action">
        {tKey("shell.todayDigestAction")}
        <span className="material-symbols-outlined" aria-hidden="true">
          chevron_right
        </span>
      </span>
    </button>
  );
}
