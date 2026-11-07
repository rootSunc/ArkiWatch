"use client";

import { InspectionContext } from "@/features/shared/ui/inspection-context";

import { useState, type ReactNode } from "react";
import {
  Card,
  DataTable,
  EmptyState,
  EvidencePopover,
  MetricTile,
  PageHeader,
  StatusBadge,
  Toast,
  type Tone,
} from "@/features/shared/ui/console";
import { useI18n } from "./i18n";
import {
  displayTitle,
  signalReadout,
  statusLabel,
} from "./data-platform-view-model";
import type { DataPlatformWorkspaceRouterProps } from "./data-platform-workspace-router";
import { categorySignalAttribution } from "./signal-attribution";
import {
  consoleEnergy,
  exportCsv,
  signalHistoryTrend,
  signalTrend,
  weatherReferencePoint,
} from "./console-model";
import { TrendChart } from "./trend-chart";
import { ShareViewLinkButton } from "./share-view-link-button";
import { ExportSnapshotButton } from "./export-snapshot-button";
import { formatTimestamp } from "@/features/shared/format";
import { currentMetricCards } from "./weather-detail-utils";
import { isEmptyStatus, liveStatusTone } from "./platform-status";
import { SnapshotDownloadButton } from "./snapshot-download-button";
import { appEnv } from "@/lib/env";
import { eventAnchorId } from "./recent-events";
import { scopedReferenceTime } from "./data-time-scope";
import { eventStateAt } from "./event-time-state";
import { localizedContent } from "./content-localization";
import { ENERGY_PANEL_TABS } from "./energy-workspace-config";

export function WorkspaceConsole({
  children,
  ...props
}: DataPlatformWorkspaceRouterProps & { children: ReactNode }) {
  const { language, tKey, metricLabel, enumLabel } = useI18n();
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const [showDetails, setShowDetails] = useState(
    Boolean(props.highlightedEventId),
  );
  const [toast, setToast] = useState("");
  const category = props.selectedCategory;
  if (!category)
    return <EmptyState title={tKey("shell.noSignalDataForScope")} />;
  const timezone =
    props.overview.time_scope?.timezone ?? props.overview.timezone;
  const signals = {
    ...props,
    energyPanel: props.selectedEnergyTab,
    timeScope: props.overview.time_scope,
    referenceAt: props.overview.checked_at,
  };
  const activeEnergy = consoleEnergy(signals);
  const readout = signalReadout(
    category,
    props.weather,
    props.airQuality,
    props.energy,
    category.key === "energy" && props.selectedEnergyTab === "fingrid"
      ? null
      : props.householdEnergy,
    props.roadRail,
    props.transit,
    language,
    timezone,
  );
  const attribution = categorySignalAttribution(
    category,
    props.weather,
    props.airQuality,
    props.energy,
    category.key === "energy" && props.selectedEnergyTab === "fingrid"
      ? null
      : props.householdEnergy,
    props.roadRail,
    props.transit,
  );
  const source =
    (category.key === "energy"
      ? category.sources.find(
          (s) => s.source_code === activeEnergy?.source_code,
        )
      : null) ?? category.sources[0];
  const status = statusLabel(
    category.key === "energy"
      ? { ...category, status: activeEnergy?.status ?? "empty" }
      : category,
    language,
  );
  const invalid =
    isEmptyStatus(category.status) ||
    ["failed", "stale", "error"].includes(category.status) ||
    (category.key === "energy" &&
      (!activeEnergy ||
        isEmptyStatus(activeEnergy.status) ||
        ["failed", "stale", "error"].includes(activeEnergy.status)));
  const invalidTone: Tone =
    (category.key === "energy" ? activeEnergy?.status : category.status) ===
    "stale"
      ? "warn"
      : (category.key === "energy" ? activeEnergy?.status : category.status) ===
          "empty"
        ? "neutral"
        : "bad";
  const referenceAt = scopedReferenceTime(
    props.overview.time_scope,
    props.overview.checked_at,
  )!;
  const current =
    category.key === "weather"
      ? weatherReferencePoint(props.weather, referenceAt)
      : null;
  const points = signalTrend(category, signals, language, timezone);
  const historical = signalHistoryTrend(
    category,
    signals,
    range === "30d" ? 30 : 7,
    timezone,
  );
  const chartPoints =
    range === "24h"
      ? ["air", "mobility"].includes(category.key)
        ? []
        : points
      : historical;
  const evidence = {
    provider:
      category.key === "energy"
        ? activeEnergy?.source_code.toUpperCase()
        : attribution.sources,
    station: props.overview.coverage_area,
    observedAt: attribution.updatedAt,
    validAt:
      current?.timestamp ??
      (category.key === "energy"
        ? activeEnergy?.current_window?.starts_at
        : null),
    licence: (category.key === "energy"
      ? source
        ? [source]
        : []
      : category.sources
    )
      .map((item) =>
        item.license_label
          ? `${item.source_code}: ${item.license_label}`
          : null,
      )
      .filter(Boolean)
      .join("; "),
    method: null,
    href: `/?view=sources${source ? `&source=${encodeURIComponent(source.source_code)}` : ""}`,
  };
  const rows =
    category.key === "air" && props.airQuality
      ? props.airQuality.stations.map((s, index) => ({
          id: `${s.station}-${index}`,
          label: s.station,
          value: s.score == null ? "—" : `${s.score}/5`,
          status: enumLabel(
            s.score != null && s.score <= 2
              ? "good"
              : s.score != null
                ? "watch"
                : "empty",
          ),
          updated: props.airQuality?.observed_at,
          source: props.airQuality!.source_code.toUpperCase(),
        }))
      : category.key === "weather" && props.weather
        ? props.weather.points.slice(0, 48).map((p) => ({
            id: p.timestamp,
            label: formatTimestamp(p.timestamp, "dateTime", language, timezone),
            value: p.temperature_c == null ? "—" : `${p.temperature_c} °C`,
            status,
            updated: props.weather?.generated_at,
            source: props.weather!.source_code.toUpperCase(),
          }))
        : category.key === "energy" && activeEnergy
          ? activeEnergy!.points.map((p) => ({
              id: p.starts_at,
              label: formatTimestamp(
                p.starts_at,
                "dateTime",
                language,
                timezone,
              ),
              value: `${p.value} ${p.unit ?? activeEnergy.unit ?? ""}`,
              status,
              updated: activeEnergy?.observed_at,
              source: activeEnergy.source_code.toUpperCase(),
            }))
          : category.key === "mobility"
            ? category.events.map((event) => ({
                id: event.id,
                label: localizedContent(language, event.title, event.title_zh),
                value: enumLabel(event.severity),
                status: tKey(
                  `shell.eventState${eventStateAt(event, referenceAt)}`,
                ),
                updated: event.starts_at,
                source: event.source_codes.join(", ").toUpperCase(),
              }))
            : category.summary_metrics.map((m) => ({
                id: m.key,
                label: metricLabel(m),
                value: `${m.value} ${m.unit ?? ""}`,
                status,
                updated: m.updated_at,
                source: m.source_codes.join(", ").toUpperCase(),
              }));
  const filteredRows = rows.filter((r) =>
    `${r.label} ${r.source} ${r.status}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const metrics = current
    ? currentMetricCards(current, language, tKey, timezone)
        .filter((m) => ["wind", "gust", "humidity", "pressure"].includes(m.key))
        .map((m) => ({
          key: m.key,
          label: m.label,
          value: m.value,
          unit: m.unit,
          tone: "neutral",
          observed: current.timestamp,
          detail: m.detail,
        }))
    : category.key === "energy" && activeEnergy
      ? activeEnergy.metrics.map((m) => ({
          key: m.key,
          label: metricLabel(m),
          value: m.value,
          unit: m.unit,
          tone: "neutral",
          observed: activeEnergy.observed_at,
          detail: null,
        }))
      : category.summary_metrics
          .filter((m) => m.key !== "source_status" && m.value !== readout.value)
          .map((m) => ({
            key: m.key,
            label: metricLabel(m),
            value: m.value,
            unit: m.unit,
            tone: m.tone,
            observed: m.updated_at,
            detail: m.detail,
          }));
  const title = displayTitle(category, language);
  return (
    <div className="console-workspace" data-domain={category.key}>
      <PageHeader
        title={title}
        subtitle={props.overview.coverage_area}
        status={
          <StatusBadge
            tone={liveStatusTone(
              category.key === "energy"
                ? activeEnergy?.status
                : category.status,
            )}
          >
            {status}
          </StatusBadge>
        }
        actions={
          <details className="page-actions">
            <summary aria-label={tKey("shell.pageActions")}>•••</summary>
            <div>
              <ShareViewLinkButton language={language} />
              {appEnv.demoMode ? (
                <SnapshotDownloadButton overview={props.overview} />
              ) : null}
              {!appEnv.demoMode ? (
                <ExportSnapshotButton
                  city={props.city ?? props.overview.coverage_area}
                  date={props.overview.time_scope?.date ?? null}
                  language={language}
                />
              ) : null}
              <button
                type="button"
                className="console-button"
                onClick={() => {
                  exportCsv(
                    `${category.key}.csv`,
                    [
                      tKey("shell.station"),
                      tKey("shell.value"),
                      tKey("shell.status"),
                      tKey("shell.observationTime"),
                      tKey("shell.provider"),
                    ],
                    filteredRows.map((r) => [
                      r.label,
                      invalid ? null : r.value,
                      invalid ? status : r.status,
                      r.updated,
                      r.source,
                    ]),
                  );
                  setToast(tKey("shell.downloaded"));
                  window.setTimeout(() => setToast(""), 3000);
                }}
              >
                {tKey("shell.exportCsv")}
              </button>
            </div>
          </details>
        }
      />
      {category.key === "energy" ? (
        <div
          className="console-segmented"
          role="group"
          aria-label={tKey("energy.energy")}
        >
          {ENERGY_PANEL_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={props.selectedEnergyTab === tab.key}
              onClick={() => props.onEnergyPanelChange(tab.key)}
            >
              {tKey(`energy.${tab.labelKey}`)}
            </button>
          ))}
        </div>
      ) : null}
      <section className="workspace-kpis" aria-label={title}>
        <MetricTile
          label={readout.label}
          onAsk={
            props.onAsk
              ? () =>
                  props.onAsk?.(`${title}: ${invalid ? status : readout.value}`)
              : undefined
          }
          value={invalid ? status : readout.value}
          tone={invalid ? invalidTone : readout.tone}
          trend={points.map((p) => p.value)}
          trendLabel={tKey(
            ["air", "mobility"].includes(category.key)
              ? "shell.availableHistory"
              : category.key === "weather"
                ? "shell.forecast24h"
                : "shell.trend24h",
          )}
          source={evidence.provider ?? undefined}
          evidence={evidence}
        />
        {metrics.slice(0, 4).map((metric) => (
          <MetricTile
            key={metric.key}
            onAsk={
              props.onAsk
                ? () =>
                    props.onAsk?.(
                      `${title} · ${metric.label}: ${invalid ? status : `${metric.value} ${metric.unit ?? ""}`}`,
                    )
                : undefined
            }
            label={metric.label}
            value={invalid ? status : metric.value}
            unit={invalid ? null : metric.unit}
            tone={
              (invalid
                ? invalidTone
                : ["good", "warn", "bad"].includes(metric.tone)
                  ? metric.tone
                  : "neutral") as Tone
            }
            evidence={{
              ...evidence,
              observedAt: metric.observed,
              validAt: current?.timestamp ?? null,
              method: null,
            }}
          />
        ))}
      </section>
      <section className="workspace-main-chart">
        <div
          className="console-chart-controls"
          role="group"
          aria-label={tKey("shell.chartRange")}
        >
          {(["24h", "7d", "30d"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={range === key}
              onClick={() => setRange(key)}
            >
              {tKey(`shell.range${key}`)}
            </button>
          ))}
        </div>
        <TrendChart
          eyebrow={
            range === "24h" && category.key === "weather"
              ? tKey("shell.forecast24h")
              : `${tKey(`shell.range${range}`)}${range !== "24h" ? ` · ${tKey(category.key === "weather" ? "shell.dailyForecastAverage" : category.key === "energy" ? "shell.dailyAverage" : "shell.dailySnapshot")}` : ""}`
          }
          title={readout.label}
          referenceAt={referenceAt}
          unit={
            category.key === "weather"
              ? "°C"
              : category.key === "energy"
                ? (activeEnergy?.unit ?? activeEnergy?.points[0]?.unit)
                : null
          }
          points={chartPoints}
        />
        {range !== "24h" ? (
          <p className="console-chart-coverage">
            {tKey("shell.historyCoverage").replace(
              "{count}",
              String(chartPoints.length),
            )}
          </p>
        ) : null}
      </section>
      <Card
        title={tKey("shell.breakdown")}
        action={
          <label className="console-search">
            <span className="sr-only">{tKey("shell.search")}</span>
            <input
              type="search"
              placeholder={tKey("shell.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        }
      >
        <DataTable
          rows={filteredRows}
          rowKey={(r) => r.id}
          label={tKey("shell.breakdown")}
          empty={tKey("shell.noMatchingRows")}
          columns={[
            {
              key: "label",
              label: tKey("shell.station"),
              sortValue: (r) => r.label,
              render: (r) => r.label,
            },
            {
              key: "value",
              label: tKey("shell.value"),
              numeric: true,
              sortValue: (r) => Number.parseFloat(r.value) || 0,
              render: (r) => (
                <span className="table-value">
                  {invalid ? status : r.value}
                  <EvidencePopover
                    evidence={{
                      ...evidence,
                      station: r.label,
                      observedAt: r.updated,
                      validAt: ["weather", "energy"].includes(category.key)
                        ? r.id
                        : null,
                      provider: r.source,
                    }}
                  />
                </span>
              ),
            },
            {
              key: "status",
              label: tKey("shell.status"),
              render: (r) => (
                <StatusBadge
                  tone={liveStatusTone(
                    category.key === "energy"
                      ? activeEnergy?.status
                      : category.status,
                  )}
                >
                  {invalid ? status : r.status}
                </StatusBadge>
              ),
            },
            {
              key: "time",
              label: tKey("shell.observationTime"),
              sortValue: (r) => r.updated ?? "",
              render: (r) =>
                r.updated
                  ? formatTimestamp(r.updated, "time", language, timezone)
                  : tKey("shell.notRecorded"),
            },
            {
              key: "source",
              label: tKey("shell.provider"),
              render: (r) => r.source,
            },
            {
              key: "ask",
              label: tKey("shell.ask"),
              render: (row) =>
                props.onAsk ? (
                  <button
                    className="console-text-button"
                    type="button"
                    onClick={() =>
                      props.onAsk?.(
                        `${title} · ${row.label}: ${invalid ? status : row.value}`,
                      )
                    }
                  >
                    {tKey("shell.askAboutThis")}
                  </button>
                ) : null,
            },
          ]}
        />
      </Card>
      <details
        className="workspace-inspection"
        open={showDetails}
        onToggle={(event) => setShowDetails(event.currentTarget.open)}
      >
        <summary>{tKey("shell.moreDetails")}</summary>
        {showDetails ? (
          <div className="workspace-inspection-content">
            <InspectionContext.Provider value>
              {children}
            </InspectionContext.Provider>
          </div>
        ) : null}
      </details>
      {category.events.length ? (
        <section
          className="workspace-event-anchors"
          aria-label={tKey("shell.openEvents")}
        >
          {category.events.map((event) => (
            <article id={`console-${eventAnchorId(event.id)}`} key={event.id}>
              <StatusBadge
                tone={liveStatusTone(
                  category.key === "energy"
                    ? activeEnergy?.status
                    : category.status,
                )}
              >
                {event.severity}
              </StatusBadge>
              <span>{event.title}</span>
            </article>
          ))}
        </section>
      ) : null}
      <footer className="workspace-source-footer">
        <span>
          {attribution.sources} ·{" "}
          {source?.license_label ?? tKey("shell.notRecorded")}
        </span>
        <a href="/?view=sources">{tKey("shell.navSources")} →</a>
      </footer>
      <Toast>{toast}</Toast>
    </div>
  );
}
