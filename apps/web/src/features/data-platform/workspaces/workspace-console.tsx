"use client";

import { InspectionContext } from "@/features/shared/ui/inspection-context";

import "../styles/console-inspection.css";

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
import { useI18n } from "../i18n";
import {
  displayTitle,
  signalReadout,
  statusLabel,
} from "../model/data-platform-view-model";
import type { DataPlatformWorkspaceRouterProps } from "../shell/data-platform-workspace-router";
import { categorySignalAttribution } from "../overview/signal-attribution";
import {
  consoleEnergy,
  exportCsv,
  signalHistoryTrend,
  signalTrend,
  weatherReferencePoint,
} from "../overview/console-model";
import { TrendChart } from "./trend-chart";
import { ShareViewLinkButton } from "./share-view-link-button";
import { ExportSnapshotButton } from "./export-snapshot-button";
import { formatReadingDelta, formatScopedClock, formatTimestamp, labeledCompactAge, severityTone } from "@/features/shared/format";
import { apparentTemperature, compassDirection, currentMetricCards, formatNumber, hasNumber } from "./weather/weather-detail-utils";
import { UNAVAILABLE_DATA_VALUE } from "../model/data-value";
import { isEmptyStatus, liveStatusTone } from "../model/platform-status";
import { SnapshotDownloadButton } from "./snapshot-download-button";
import { appEnv } from "@/lib/env";
import { sourcesViewHref } from "../shell/data-platform-nav-utils";
import { eventAnchorId } from "../model/recent-events";
import { scopedReferenceTime } from "../model/data-time-scope";
import { eventStateAt } from "../model/event-time-state";
import { localizedContent } from "../model/content-localization";
import { ENERGY_PANEL_TABS } from "./energy/energy-workspace-config";

export function WorkspaceConsole({
  children,
  ...props
}: DataPlatformWorkspaceRouterProps & { children: ReactNode }) {
  const { language, tKey, metricLabel, enumLabel } = useI18n();
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const [showDetails, setShowDetails] = useState(false);
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
    href: sourcesViewHref({
      city: props.city,
      date: props.overview.time_scope?.date,
      source: source?.source_code,
    }),
  };
  const breakdownTone = (state: string | null | undefined): Tone => {
    switch (state?.toLowerCase()) {
      case "good":
      case "ready":
      case "healthy":
      case "connected":
      case "fetched":
        return "good";
      case "watch":
      case "stale":
      case "degraded":
      case "partial":
        return "warn";
      case "failed":
      case "failing":
      case "error":
        return "bad";
      default: {
        const live = liveStatusTone(state);
        if (live === "ready") return "good";
        if (live === "stale") return "warn";
        if (live === "failed") return "bad";
        return "neutral";
      }
    }
  };
  const rows =
    category.key === "air" && props.airQuality
      ? props.airQuality.stations.map((s, index) => {
          const stationState =
            s.score == null ? "empty" : s.score <= 2 ? "good" : "watch";
          return {
            id: `${s.station}-${index}`,
            label: s.station,
            value: s.score == null ? "—" : `${s.score}/5`,
            status: enumLabel(stationState),
            tone: invalid ? invalidTone : breakdownTone(stationState),
            updated: props.airQuality?.observed_at,
            source: props.airQuality!.source_code.toUpperCase(),
          };
        })
      : category.key === "weather" && props.weather
        ? props.weather.points.slice(0, 48).map((p) => ({
            id: p.timestamp,
            label: formatScopedClock(p.timestamp, referenceAt, language, timezone),
            value: p.temperature_c == null ? "—" : `${p.temperature_c} °C`,
            status,
            tone: invalid ? invalidTone : breakdownTone(category.status),
            updated: props.weather?.generated_at,
            source: props.weather!.source_code.toUpperCase(),
          }))
        : category.key === "energy" && activeEnergy
          ? activeEnergy!.points.map((p) => ({
              id: p.starts_at,
              label: formatScopedClock(p.starts_at, referenceAt, language, timezone),
              value: `${p.value} ${p.unit ?? activeEnergy.unit ?? ""}`,
              status,
              tone: invalid
                ? invalidTone
                : breakdownTone(activeEnergy.status ?? category.status),
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
                tone: (invalid
                  ? invalidTone
                  : severityTone(event.severity)) as Tone,
                updated: event.starts_at,
                source: event.source_codes.join(", ").toUpperCase(),
              }))
            : category.summary_metrics.map((m) => ({
                id: m.key,
                label: metricLabel(m),
                value: `${m.value} ${m.unit ?? ""}`,
                status,
                tone: invalid ? invalidTone : breakdownTone(category.status),
                updated: m.updated_at,
                source: m.source_codes.join(", ").toUpperCase(),
              }));
  const filteredRows = rows.filter((r) =>
    `${r.label} ${r.source} ${r.status}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const weatherSeries = (key: string) => {
    if (key === "feels") {
      return (props.weather?.points ?? [])
        .map((point) => apparentTemperature(point))
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    }
    const field = {
      wind: "wind_speed_ms",
      gust: "wind_gust_ms",
      humidity: "humidity_pct",
      pressure: "pressure_hpa",
    }[key] as "wind_speed_ms" | "wind_gust_ms" | "humidity_pct" | "pressure_hpa" | undefined;
    if (!field) return [];
    return (props.weather?.points ?? [])
      .map((point) => point[field])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  };
  const seriesDelta = (values: number[], unit?: string | null) => {
    const first = values[0];
    const last = values.at(-1);
    return values.length >= 3 && first != null && last != null
      ? formatReadingDelta(first, last, unit)
      : undefined;
  };
  const feelsLike = apparentTemperature(current);
  const feelsTrend = feelsLike == null ? [] : weatherSeries("feels");
  const metrics = current
    ? [
        ...(feelsLike == null
          ? []
          : [{
              key: "feels",
              label: tKey("weather.feelsLike"),
              value: formatNumber(feelsLike, 1),
              unit: "°C",
              tone: "neutral" as const,
              observed: current.timestamp,
              detail: null,
              trend: feelsTrend,
              delta: seriesDelta(feelsTrend, "°"),
            }]),
        ...currentMetricCards(current, language, tKey, timezone)
          .filter((m) => ["wind", "humidity", "pressure"].includes(m.key))
          .map((m) => {
            const direction = compassDirection(current.wind_direction_deg);
            const gust = hasNumber(current.wind_gust_ms) ? formatNumber(current.wind_gust_ms, 1) : null;
            const windNote = [
              direction === UNAVAILABLE_DATA_VALUE ? null : direction,
              gust,
            ].filter(Boolean).join(" · ");
            const trend = m.key === "wind" ? [] : weatherSeries(m.key);
            return {
              key: m.key,
              label: m.label,
              value: m.value,
              unit: m.unit,
              tone: "neutral" as const,
              observed: current.timestamp,
              detail: m.key === "wind" ? windNote || m.detail : m.detail,
              trend,
              delta: m.key === "wind" ? undefined : seriesDelta(trend, m.unit),
            };
          }),
      ]
    : category.key === "energy" && activeEnergy
      ? activeEnergy.metrics.map((m) => ({
          key: m.key,
          label: metricLabel(m),
          value: m.value,
          unit: m.unit,
          tone: "neutral" as const,
          observed: activeEnergy.observed_at,
          detail: null,
          trend: [] as number[],
          delta: undefined,
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
            trend: [] as number[],
            delta: undefined,
          }));
  const primaryDelta = seriesDelta(
    points.map((point) => point.value),
    category.key === "weather"
      ? "°"
      : category.key === "energy"
        ? activeEnergy?.unit ?? activeEnergy?.points[0]?.unit
        : null,
  );
  const title = displayTitle(category, language);
  const providerLabel = attribution.sources || source?.source_code?.toUpperCase();
  const scopeLine = [
    props.overview.coverage_area,
    providerLabel
      ? tKey("shell.providerObservation").replace("{provider}", providerLabel)
      : null,
    attribution.updatedAt
      ? formatTimestamp(attribution.updatedAt, "dateTime", language, timezone)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const exportBreakdown = () => {
    exportCsv(
      `${category.key}.csv`,
      [
        tKey("shell.station"),
        tKey("shell.value"),
        tKey("shell.status"),
        tKey("shell.observationTime"),
        tKey("shell.provider"),
      ],
      filteredRows.map((row) => [
        row.label,
        invalid ? null : row.value,
        invalid ? status : row.status,
        row.updated,
        row.source,
      ]),
    );
    setToast(tKey("shell.downloaded"));
    window.setTimeout(() => setToast(""), 3000);
  };
  const invalidReading = labeledCompactAge(
    status,
    source?.last_successful_run_at ??
      source?.last_run_finished_at ??
      attribution.updatedAt,
  );
  return (
    <div className="console-workspace" data-domain={category.key}>
      <PageHeader
        title={title}
        subtitle={scopeLine}
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
                onClick={exportBreakdown}
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
          value={invalid ? invalidReading : readout.value}
          tone={invalid ? invalidTone : readout.tone}
          delta={invalid ? undefined : primaryDelta}
          trend={invalid ? [] : points.map((p) => p.value)}
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
            trend={invalid ? [] : metric.trend}
            delta={invalid ? undefined : metric.delta}
            note={invalid ? null : metric.detail}
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
          <div className="breakdown-actions">
            <label className="console-search">
              <span className="sr-only">{tKey("shell.search")}</span>
              <input
                type="search"
                placeholder={tKey("shell.search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button type="button" className="console-button" onClick={exportBreakdown}>
              {tKey("shell.exportCsv")}
            </button>
          </div>
        }
      >
        <DataTable
          rows={filteredRows}
          rowKey={(r) => r.id}
          label={tKey("shell.breakdown")}
          empty={tKey("shell.noMatchingRows")}
          rowTone={(row) => row.tone}
          columns={[
            {
              key: "label",
              label: tKey(
                category.key === "weather" || category.key === "energy"
                  ? "shell.breakdownTime"
                  : category.key === "mobility"
                    ? "shell.navLinkedEvents"
                    : category.key === "air"
                      ? "shell.station"
                      : "shell.breakdownItem",
              ),
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
                <StatusBadge tone={r.tone}>
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
        <div className="workspace-inspection-content">
          <InspectionContext.Provider value>{children}</InspectionContext.Provider>
        </div>
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
        <a href={sourcesViewHref({
          city: props.city,
          date: props.overview.time_scope?.date,
        })}>{tKey("shell.navSources")} →</a>
      </footer>
      <Toast>{toast}</Toast>
    </div>
  );
}
