"use client";

import { localizedContent } from "../model/content-localization";
import { useI18n } from "../i18n";
import type { TodayBrief } from "./today-brief";

type TodayDigestStripProps = {
  todayBrief: TodayBrief | null;
  onOpenToday: () => void;
};

/** A scoped recommendation with a direct path to its supporting evidence. */
export function TodayDigestStrip({ todayBrief, onOpenToday }: TodayDigestStripProps) {
  const { language, tKey } = useI18n();

  if (!todayBrief?.headline || !todayBrief.hasScopedData) {
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
        <span className="today-digest-strip-label">
          <span className="material-symbols-outlined" aria-hidden="true">
            hub
          </span>
          {tKey(
            todayBrief.recommendationMode === "live"
              ? "shell.todayDigestLabel"
              : "shell.snapshotBrief",
          )}
        </span>
        <strong>{todayBrief.headline}</strong>
        {detail ? <span className="today-digest-strip-detail">{detail}</span> : null}
      </span>
      <span className="brief-orbit" aria-hidden="true">
        <span className="brief-orbit-ring brief-orbit-ring-outer" />
        <span className="brief-orbit-ring brief-orbit-ring-inner" />
        <span className="brief-orbit-center">
          <span className="material-symbols-outlined">hub</span>
        </span>
        <span className="brief-orbit-node brief-orbit-node-weather">
          <span className="material-symbols-outlined">cloud</span>
        </span>
        <span className="brief-orbit-node brief-orbit-node-energy">
          <span className="material-symbols-outlined">bolt</span>
        </span>
        <span className="brief-orbit-node brief-orbit-node-air">
          <span className="material-symbols-outlined">air</span>
        </span>
      </span>
      <span className="today-digest-strip-action">
        {tKey("shell.todayDigestAction")}
        <span aria-hidden="true"> →</span>
      </span>
    </button>
  );
}
