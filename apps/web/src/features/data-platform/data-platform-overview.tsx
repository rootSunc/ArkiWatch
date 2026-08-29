"use client";

import type { ChangeEvent, ReactNode } from "react";

import { scopedDataTimestamp } from "./data-time-scope";
import { useI18n } from "./i18n";
import type { PlatformOverviewResponse } from "./types";
import type { SignalSystemTile } from "./signals-console";
import type { TodayBrief } from "./today/today-brief";
import { TodayDigestStrip } from "./today/today-digest-strip";

type DataPlatformOverviewProps = {
  checkedAt: string;
  catalogSignalCards: ReactNode;
  catalogSignalCount: number;
  coreSignalCards: ReactNode;
  coreSignalCount: number;
  isCatalogExpanded: boolean;
  isHistorical: boolean;
  onCatalogToggle: (isOpen: boolean) => void;
  onOpenToday: () => void;
  onSearchChange: (value: string) => void;
  overview: PlatformOverviewResponse;
  platformTimezone: string;
  searchValue: string;
  signalSystemTiles: SignalSystemTile[];
  todayBrief: TodayBrief | null;
  secondaryContent: ReactNode;
};

function OverviewSearch({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const { tKey } = useI18n();

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.currentTarget.value);
  }

  return (
    <label className="overview-search">
      <span className="material-symbols-outlined" aria-hidden="true">
        search
      </span>
      <span className="sr-only">{tKey("shell.searchSignalsPlaceholder")}</span>
      <input
        aria-label={tKey("shell.searchSignalsPlaceholder")}
        onChange={handleChange}
        placeholder={tKey("shell.searchSignalsPlaceholder")}
        value={value}
      />
      {value ? (
        <button
          aria-label={tKey("shell.clearSearch")}
          className="overview-search-clear"
          onClick={() => onChange("")}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      ) : null}
    </label>
  );
}

function OverviewStatusBar({
  overview,
  platformTimezone,
  tiles,
}: {
  overview: PlatformOverviewResponse;
  platformTimezone: string;
  tiles: SignalSystemTile[];
}) {
  const { language, tKey } = useI18n();
  const snapshotTimestamp = scopedDataTimestamp(
    overview.checked_at,
    overview.time_scope,
    language,
    tKey,
    "shell.notCollected",
    platformTimezone,
  );

  return (
    <section className="overview-status-bar" aria-label={tKey("shell.signalSystemSummary")}>
      <div className="overview-status-items">
        {tiles.map((tile) => (
          <article className={`overview-status-item overview-status-item-${tile.tone}`} key={tile.key}>
            <span className="material-symbols-outlined" aria-hidden="true">
              {tile.icon}
            </span>
            <div>
              <span>{tile.label}</span>
              <strong>{tile.value}</strong>
              <small>{tile.detail}</small>
            </div>
          </article>
        ))}
        <article className="overview-status-item overview-status-item-neutral overview-status-item-snapshot">
          <span className="material-symbols-outlined" aria-hidden="true">
            schedule
          </span>
          <div>
            <span>{tKey("shell.snapshotChecked")}</span>
            <strong>{snapshotTimestamp}</strong>
            <small>{platformTimezone}</small>
          </div>
        </article>
      </div>
    </section>
  );
}

export function DataPlatformOverview({
  checkedAt,
  catalogSignalCards,
  catalogSignalCount,
  coreSignalCards,
  coreSignalCount,
  isCatalogExpanded,
  isHistorical,
  onCatalogToggle,
  onOpenToday,
  onSearchChange,
  overview,
  platformTimezone,
  searchValue,
  signalSystemTiles,
  todayBrief,
  secondaryContent,
}: DataPlatformOverviewProps) {
  const { language, tKey } = useI18n();
  const hasSearch = Boolean(searchValue.trim());

  return (
    <div className="overview-page">
      <header className="overview-hero">
        <div className="overview-hero-copy">
          <div className="overview-hero-kicker">
            <span className="overview-hero-kicker-dot" aria-hidden="true" />
            <span>{tKey("shell.dataPlatformMode")}</span>
          </div>
          <h1>{tKey("shell.signalObservatory")}</h1>
          <p>{tKey("shell.dataPlatformLead")}</p>
        </div>
        <div className="overview-hero-tools">
          <OverviewSearch onChange={onSearchChange} value={searchValue} />
          <span className="overview-hero-updated">
            {tKey("shell.updated")} {scopedDataTimestamp(
              checkedAt,
              overview.time_scope,
              language,
              tKey,
              "shell.notCollected",
              platformTimezone,
            )}
          </span>
        </div>
      </header>

      {!hasSearch ? (
        <TodayDigestStrip onOpenToday={onOpenToday} todayBrief={todayBrief} />
      ) : null}

      <OverviewStatusBar
        overview={overview}
        platformTimezone={platformTimezone}
        tiles={signalSystemTiles}
      />

      {hasSearch ? (
        <p className="overview-search-status" role="status">
          {tKey("shell.searchResultsSummary").replace(
            "{count}",
            String(coreSignalCount + catalogSignalCount),
          )}
        </p>
      ) : null}

      <section className="overview-core-section" aria-label={tKey("shell.signalStatusArray")}>
        <div className="overview-section-heading">
          <div>
            <span className="overview-section-kicker">{tKey("shell.localSignals")}</span>
            <h2>{tKey("shell.coreSignals")}</h2>
            <p>
              {isHistorical
                ? tKey("shell.historicalCoreSignalsLead")
                : tKey("shell.coreSignalsLead")}
            </p>
          </div>
          <span className="overview-section-count">
            {coreSignalCount} {tKey("shell.tracked")}
          </span>
        </div>
        <div className="overview-signal-grid">
          {coreSignalCards ?? (
            <div className="dashboard-empty-state">
              {tKey("shell.noSignalCardsMatchTheCurrentSearch")}
            </div>
          )}
        </div>
      </section>

      {catalogSignalCount > 0 ? (
        <details
          className="overview-catalog"
          open={isCatalogExpanded || hasSearch}
          onToggle={(event) => onCatalogToggle(event.currentTarget.open)}
        >
          <summary aria-label={tKey("shell.toggleCatalogSignals")}>
            <span className="overview-catalog-copy">
              <span className="material-symbols-outlined" aria-hidden="true">
                database
              </span>
              <span>
                <strong>{tKey("shell.catalogSignals")}</strong>
                <small>{tKey("shell.catalogSignalsLead")}</small>
              </span>
            </span>
            <span className="overview-catalog-meta">
              {catalogSignalCount}
              <span className="material-symbols-outlined" aria-hidden="true">
                expand_more
              </span>
            </span>
          </summary>
          <div className="overview-signal-grid overview-signal-grid-catalog">
            {catalogSignalCards}
          </div>
        </details>
      ) : null}

      <div className="overview-secondary-content">{secondaryContent}</div>
    </div>
  );
}
