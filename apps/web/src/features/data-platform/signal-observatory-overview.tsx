"use client";

import { scopedDataTimestamp } from "./data-time-scope";
import { useI18n } from "./i18n";
import type { SignalSystemTile } from "./signals-console";
import type { PlatformOverviewResponse } from "./types";

type SignalObservatoryOverviewProps = {
  overview: PlatformOverviewResponse;
  platformTimezone: string;
  tiles: SignalSystemTile[];
};

/**
 * A focused summary surface for the Data workspace. The page owns the
 * filtering and navigation state; this component owns the observatory header,
 * freshness marker, and the three high-level system tiles.
 */
export function SignalObservatoryOverview({
  overview,
  platformTimezone,
  tiles,
}: SignalObservatoryOverviewProps) {
  const { language, tKey } = useI18n();

  return (
    <section className="signals-console-overview" aria-label={tKey("shell.signalObservatory")}>
      <header className="signals-console-header">
        <div>
          <h3>
            <span className="material-symbols-outlined" aria-hidden="true">
              monitoring
            </span>
            {tKey("shell.signalObservatory")}
          </h3>
          <p>{tKey("shell.signalObservatoryLead")}</p>
        </div>
        <span className="signals-console-header-meta">
          <span className="material-symbols-outlined" aria-hidden="true">
            schedule
          </span>
          {tKey("shell.updated")} {scopedDataTimestamp(
            overview.checked_at,
            overview.time_scope,
            language,
            tKey,
            "shell.notCollected",
            platformTimezone,
          )}
        </span>
      </header>
      <div
        className="summary-grid summary-grid-system"
        aria-label={tKey("shell.signalSystemSummary")}
      >
        {tiles.map((tile) => (
          <article
            className={`metric-tile metric-tile-${tile.tone} signal-system-tile`}
            key={tile.key}
          >
            <div>
              <span>{tile.label}</span>
              <span className="material-symbols-outlined" aria-hidden="true">
                {tile.icon}
              </span>
            </div>
            <strong
              className={
                tile.valueStyle === "emphasis"
                  ? "metric-tile-value-emphasis"
                  : "metric-tile-value-body"
              }
            >
              {tile.value}
            </strong>
            <small className="metric-tile-detail">{tile.detail}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
