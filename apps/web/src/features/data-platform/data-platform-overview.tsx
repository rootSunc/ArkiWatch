"use client";

import { useEffect, useRef, type ChangeEvent, type ReactNode } from "react";

import { formatTimestamp } from "@/features/shared/format";

import { scopedDataTimestamp } from "./data-time-scope";
import { useI18n } from "./i18n";
import type { SignalSystemTile } from "./signals-console";
import type { TodayBrief } from "./today/today-brief";
import { TodayDigestStrip } from "./today/today-digest-strip";
import type { PlatformOverviewResponse } from "./types";

function snapshotClock(value: string | null, timeZone: string): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(parsed);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(parsed);
  }
}

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
  sourceHealth: ReactNode;
  secondaryContent?: ReactNode;
};

function OverviewSearch({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const { tKey } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.currentTarget.value);
  }

  return (
    <div
      aria-label={tKey("shell.searchSignalsPlaceholder")}
      className="overview-search"
      role="search"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        search
      </span>
      <label className="sr-only" htmlFor="overview-signal-search">
        {tKey("shell.searchSignalsPlaceholder")}
      </label>
      <input
        id="overview-signal-search"
        onChange={handleChange}
        placeholder={tKey("shell.searchSignalsPlaceholder")}
        ref={inputRef}
        value={value}
      />
      {value ? (
        <button
          aria-label={tKey("shell.clearSearch")}
          className="overview-search-clear"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      ) : null}
    </div>
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
  const snapshotDate = formatTimestamp(
    overview.checked_at,
    "date",
    language,
    platformTimezone,
  );
  const snapshotTime = snapshotClock(overview.checked_at, platformTimezone);

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
              <strong>
                {tile.value.includes("/") ? (
                  <>
                    {tile.value.slice(0, tile.value.indexOf("/"))}
                    <span className="quiet-value">
                      {tile.value.slice(tile.value.indexOf("/"))}
                    </span>
                  </>
                ) : (
                  tile.value
                )}
              </strong>
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
            {/* The clock is what people scan this cell for, so it takes the
              * readout weight and the date drops to the detail row. One line
              * only: the strip shares a baseline with the three cells beside
              * it. */}
            <strong>{snapshotTime || snapshotDate}</strong>
            <small>
              {snapshotTime ? `${snapshotDate}, ${platformTimezone}` : platformTimezone}
            </small>
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
  sourceHealth,
  secondaryContent,
}: DataPlatformOverviewProps) {
  const { language, tKey } = useI18n();
  const hasSearch = Boolean(searchValue.trim());
  const healthDisclosureRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 641px)");
    const syncLayout = () => {
      if (healthDisclosureRef.current) healthDisclosureRef.current.open = desktop.matches;
    };
    syncLayout();
    desktop.addEventListener("change", syncLayout);
    return () => desktop.removeEventListener("change", syncLayout);
  }, []);

  return (
    <div className="overview-page">
      <header className="overview-hero">
        <div className="overview-hero-copy">
          <div className="overview-hero-kicker">
            <span className="overview-hero-eyebrow">{tKey("shell.observatoryEyebrow")}</span>
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
          <h1>{tKey("shell.signalObservatory")}</h1>
          <p>{tKey("shell.dataPlatformLead")}</p>
        </div>
        <div className="overview-hero-tools">
          <OverviewSearch onChange={onSearchChange} value={searchValue} />
        </div>
      </header>

      {hasSearch ? (
        <p className="overview-search-status" role="status">
          {tKey("shell.searchResultsSummary").replace(
            "{count}",
            String(coreSignalCount + catalogSignalCount),
          )}
        </p>
      ) : null}

      <div
        className={`overview-briefing${
          hasSearch || !todayBrief?.hasScopedData
            ? " overview-briefing-summary-only"
            : ""
        }`}
      >
        {!hasSearch ? (
          <TodayDigestStrip onOpenToday={onOpenToday} todayBrief={todayBrief} />
        ) : null}
        <details className="overview-health-disclosure" ref={healthDisclosureRef}>
          <summary><span>{tKey("shell.dataHealthDetails")}</span><span className="material-symbols-outlined" aria-hidden="true">expand_more</span></summary>
        <OverviewStatusBar
          overview={overview}
          platformTimezone={platformTimezone}
          tiles={signalSystemTiles}
        />
        </details>
      </div>

      <section className="overview-core-section" aria-label={tKey("shell.signalStatusArray")}>
        <div className="overview-section-heading">
          <div>
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
            hasSearch ? (
              <div className="dashboard-empty-state">
                {tKey("shell.noSignalCardsMatchTheCurrentSearch")}
              </div>
            ) : (
              <div className="dashboard-empty-state dashboard-empty-state-rich" role="status">
                <span className="material-symbols-outlined" aria-hidden="true">
                  database
                </span>
                <div className="dashboard-empty-state-copy">
                  <strong>{tKey("shell.noSignalDataForScope")}</strong>
                  <p>{tKey("shell.noSignalDataForScopeDetail")}</p>
                </div>
              </div>
            )
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

      {sourceHealth}

      <div className="overview-secondary-content">{secondaryContent}</div>
    </div>
  );
}
