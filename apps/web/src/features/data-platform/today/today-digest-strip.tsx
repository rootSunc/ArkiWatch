"use client";

import { localizedContent } from "../content-localization";
import { useI18n } from "../i18n";
import type { TodayBrief } from "./today-brief";

type TodayDigestStripProps = {
  todayBrief: TodayBrief | null;
  onOpenToday: () => void;
};

/**
 * A single-line, low-emphasis pointer to the Life assistant recommendation
 * (README §1.3). The Data platform is the primary surface; this strip keeps
 * today's headline and its one-line reason reachable without competing with the
 * signal observatory below it.
 */
export function TodayDigestStrip({ todayBrief, onOpenToday }: TodayDigestStripProps) {
  const { language, tKey } = useI18n();

  if (!todayBrief?.headline) {
    return null;
  }

  const detail = localizedContent(
    language,
    todayBrief.topActions[0]?.body,
    todayBrief.topActions[0]?.body_zh,
  );

  return (
    <button className="today-digest-strip" onClick={onOpenToday} type="button">
      <span className="today-digest-strip-copy">
        <span className="today-digest-strip-label">{tKey("shell.navToday")}</span>
        <strong>{todayBrief.headline}</strong>
        {detail ? <span className="today-digest-strip-detail">{detail}</span> : null}
      </span>
      <span className="today-digest-strip-action">
        {tKey("shell.todayDigestAction")}
        <span aria-hidden="true"> →</span>
      </span>
    </button>
  );
}
