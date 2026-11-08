"use client";

import { formatNumber } from "../../model/workspace-format";
import dynamic from "next/dynamic";
import { formatHistoryDate } from "../../model/workspace-datetime";
import type { CSSProperties } from "react";
import { useState } from "react";

import { DataLabelWithHelp, dataHelpText } from "../data-help";
import { LanguageMode, useI18n } from "../../i18n";
import {
  AirQualityCurrentResponse,
  AirQualityDataStage,
  AirQualitySourceRequest,
  AirQualityStation,
  PlatformCategory,
  PlatformHistoricalSnapshot
} from "../../types";
import { TrendChart, TrendChartPoint } from "../lazy-trend-chart";
import { eventAnchorId } from "../../model/recent-events";
import { localizedPlatformCopy } from "../../model/platform-copy";
import { isEmptyStatus, liveStatusTone } from "../../model/platform-status";
import { UNAVAILABLE_DATA_VALUE } from "../../model/data-value";
import { DEFAULT_DATA_TIME_ZONE, resolveDataTimezone } from "../../model/data-timezone";
import { scopedDataAge, scopedDataTimestamp, scopedReferenceTime } from "../../model/data-time-scope";
import { WorkspaceEmptyState, WorkspaceEvidenceHeader } from "../workspace-ui";

const AirQualityStationMap = dynamic(
  () => import("./air-quality-station-map").then((module) => module.AirQualityStationMap),
  {
    ssr: false,
    loading: () => (
      <div className="air-map-frame air-map-frame--loading" aria-busy="true">
        <span className="air-map-loading-label">…</span>
      </div>
    )
  }
);

type AirQualityWorkspaceProps = {
  airQuality: AirQualityCurrentResponse | null;
  category: PlatformCategory | null;
  highlightedEventId?: string | null;
  history: PlatformHistoricalSnapshot<AirQualityCurrentResponse>[];
};

type AirTone = "good" | "warn" | "bad" | "neutral";

type FieldSignal = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
};

type PollutantKey = "european_aqi" | "pm2_5" | "pm10" | "no2";

type PollutantProfile = {
  key: PollutantKey;
  labelKey: string;
  unit: string;
};

const SCORE_LABEL_KEYS = ["na", "good", "fair", "moderate", "poor", "veryPoor"] as const;
const SCORE_BUCKETS = [1, 2, 3, 4, 5];
const POLLUTANT_PROFILES: PollutantProfile[] = [
  { key: "european_aqi", labelKey: "europeanAqi", unit: "" },
  { key: "pm2_5", labelKey: "pm25", unit: "ug/m3" },
  { key: "pm10", labelKey: "pm10", unit: "ug/m3" },
  { key: "no2", labelKey: "no2", unit: "ug/m3" }
];

function formatPercent(value: number | null | undefined, tKey: (key: string) => string): string {
  const formatted = formatNumber(value);
  return formatted === UNAVAILABLE_DATA_VALUE ? tKey("shell.nA") : `${formatted}%`;
}

function cautionDetail(summary: AirQualityCurrentResponse["detail"], key: string, tKey: (key: string) => string): string {
  const value = summary?.pollutants[key];
  return !value || value.average == null ? tKey("airQuality.noValue") : `${tKey(value.tone === "good" ? "airQuality.belowCaution" : "airQuality.aboveCaution")} (${value.caution})`;
}

function scoreLabel(
  score: number | null | undefined,
  fallback: string | null | undefined,
  language: LanguageMode,
  tKey: (key: string) => string,
  dataLabel: (value: string | null | undefined) => string
): string {
  if (score === null || score === undefined) {
    return fallback ? dataLabel(fallback) : tKey("airQuality.na");
  }

  return tKey(`airQuality.${SCORE_LABEL_KEYS[Math.min(Math.max(Math.round(score), 0), 5)] ?? "na"}`);
}

function stageTone(stage: Pick<AirQualityDataStage | AirQualitySourceRequest, "status">): AirTone {
  if (stage.status === "ready" || stage.status === "fetched") {
    return "good";
  }
  if (stage.status === "empty" || stage.status === "missing" || stage.status === "not_collected") {
    return "warn";
  }
  if (stage.status === "failed" || stage.status === "error") {
    return "bad";
  }
  return "neutral";
}

function hasNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !Number.isNaN(value);
}

function endpointLabel(request: AirQualitySourceRequest, tKey: (key: string) => string): string {
  if (!request.endpoint) {
    return tKey("airQuality.endpointNotRecorded");
  }

  try {
    const url = new URL(request.endpoint);
    return `${url.host}${url.searchParams.get("typeNames") ? `, ${url.searchParams.get("typeNames")}` : ""}`;
  } catch {
    return request.endpoint;
  }
}

function fieldSignals(coverage: Record<string, number>, tKey: (key: string) => string): FieldSignal[] {
  return [["score", "stationScore"], ["label", "aqIndexLabel"], ...POLLUTANT_PROFILES.map((profile) => [profile.key, profile.labelKey])].map(([key, label]) => ({
    key, label: tKey(`airQuality.${label}`), ready: (coverage[key] ?? 0) > 0,
    detail: `${coverage[key] ?? 0}% ${tKey("airQuality.populated")}`,
  }));
}

function scoreDistribution(
  counts: Record<string, number>,
  language: LanguageMode,
  tKey: (key: string) => string,
  dataLabel: (value: string | null | undefined) => string,
) {
  const max = Math.max(1, ...Object.values(counts));
  return SCORE_BUCKETS.map((score) => {
    const count = counts[score] ?? 0;
    return {
      count,
      label: scoreLabel(score, null, language, tKey, dataLabel),
      score,
      width: Math.max(8, (count / max) * 100)
    };
  });
}

function observedExactLabel(
  value: string | null,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
  timeScope?: AirQualityCurrentResponse["time_scope"],
): string {
  return scopedDataTimestamp(
    value,
    timeScope,
    language,
    tKey,
    "airQuality.notObserved",
    timeZone,
  );
}

function scorePercent(score: number | null | undefined): number {
  return Math.max(6, Math.min(100, ((score ?? 0) / 5) * 100));
}

function pollutantProfile(key: PollutantKey): PollutantProfile {
  return POLLUTANT_PROFILES.find((profile) => profile.key === key) ?? POLLUTANT_PROFILES[0];
}

function pollutantValue(station: AirQualityStation, key: PollutantKey): number | null {
  return station[key] ?? null;
}

function formatPollutantValue(value: number | null, profile: PollutantProfile): string {
  if (!hasNumber(value)) {
    return UNAVAILABLE_DATA_VALUE;
  }

  const formattedValue = formatNumber(value, profile.unit ? 1 : 0);
  return profile.unit ? `${formattedValue} ${profile.unit}` : formattedValue;
}

function stationDisplayName(station: AirQualityStation): string {
  return station.label || station.station || UNAVAILABLE_DATA_VALUE;
}

function formatStationClock(value: string | null, timeZone: string): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(parsed);
}

function sourceRequestCount(airQuality: AirQualityCurrentResponse): string {
  const fetched = airQuality.source_requests.filter((request) => request.status === "fetched").length;
  return `${fetched}/${airQuality.source_requests.length}`;
}

function readyFieldCount(fields: FieldSignal[]): string {
  return `${fields.filter((field) => field.ready).length}/${fields.length}`;
}

function airHistoryPoints(
  history: PlatformHistoricalSnapshot<AirQualityCurrentResponse>[],
  tKey: (key: string) => string,
  language: LanguageMode = "en",
  timeZone = DEFAULT_DATA_TIME_ZONE,
): TrendChartPoint[] {
  return history.flatMap((snapshot) => {
    const data = snapshot.data;
    if (!data) {
      return [];
    }

    const worstScore = data.worst_score;
    if (worstScore === null) {
      return [];
    }

    return [
      {
        label: formatHistoryDate(snapshot.date, language, timeZone),
        value: worstScore,
        detail: `${data.quality.reporting_station_count}/${data.quality.station_count} ${tKey("airQuality.stations")}, ${formatPercent(data.quality.field_coverage_pct, tKey)} ${tKey("airQuality.coverage")}`
      }
    ];
  });
}

function renderPollutantChart(
  detail: AirQualityCurrentResponse["detail"],
  profile: PollutantProfile,
  stations: AirQualityStation[],
  language: LanguageMode,
  tKey: (key: string) => string,
  dataLabel: (value: string | null | undefined) => string,
) {
  const summary = detail?.pollutants[profile.key];
  const ordered = orderedStations(stations, summary?.station_order);
  const rows = ordered.slice(0, 8);
  const values = rows.map((station) => pollutantValue(station, profile.key)).filter(hasNumber);
  const maxValue = Math.max(summary?.severe ?? 1, ...values, 1);
  const averageValue = summary?.average ?? null;
  const peakValue = summary?.peak ?? null;

  return (
    <>
      <div className="air-pollutant-readout">
        <article>
          <span>{tKey("airQuality.average")}</span>
          <strong>{hasNumber(averageValue) ? formatPollutantValue(averageValue, profile) : tKey("airQuality.missing")}</strong>
        </article>
        <article>
          <span>{tKey("airQuality.peak")}</span>
          <strong>{hasNumber(peakValue) ? formatPollutantValue(peakValue, profile) : tKey("airQuality.missing")}</strong>
        </article>
        <article>
          <span>{tKey("airQuality.reporting")}</span>
          <strong>{summary?.reporting ?? 0}/{stations.length}</strong>
        </article>
      </div>

      {rows.length > 0 ? (
        <div className="air-pollutant-list">
          {rows.map((station) => {
            const value = pollutantValue(station, profile.key);
            const percent = Math.max(2, Math.min(100, ((value ?? 0) / maxValue) * 100));
            const tone = station.pollutant_tones?.[profile.key] ?? "neutral";
            return (
              <article className={`air-pollutant-row air-pollutant-row-${tone}`} key={station.station}>
                <div>
                  <strong>{stationDisplayName(station)}</strong>
                  <span>{scoreLabel(station.score, station.label, language, tKey, dataLabel)}</span>
                </div>
                <i className="air-pollutant-track" aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                  <b style={{ left: `${percent}%` }} />
                </i>
                <em>{formatPollutantValue(value, profile)}</em>
              </article>
            );
          })}
        </div>
      ) : (
        <p>{tKey("airQuality.noPollutantConcentrationValuesWereReturnedForThisField")}</p>
      )}
    </>
  );
}

function renderStationMap(
  stations: AirQualityStation[],
  language: LanguageMode,
  tKey: (key: string) => string,
  dataLabel: (value: string | null | undefined) => string,
) {
  return (
    <AirQualityStationMap
      dataLabel={dataLabel}
      formatNumber={formatNumber}
      language={language}
      scoreLabel={scoreLabel}
      stationDisplayName={stationDisplayName}
      stations={stations}
      tKey={tKey}
    />
  );
}

export function AirQualityWorkspace({
  airQuality,
  category,
  highlightedEventId,
  history,
}: AirQualityWorkspaceProps) {
  const { language, tKey, enumLabel, dataLabel } = useI18n();
  const [activePollutantKey, setActivePollutantKey] = useState<PollutantKey>("pm2_5");

  if (!airQuality || isEmptyStatus(airQuality.status)) {
    return (
      <WorkspaceEmptyState
        className="air-detail-empty"
        description={tKey("airQuality.hsyAirQualityStationSnapshotsHaveNotArrivedForTheCurrentPlatformWindow")}
        eyebrow={tKey("airQuality.airQuality")}
        headingLevel={1}
        title={tKey("airQuality.stationDataIsNotAvailableYet")}
      />
    );
  }

  const stations = airQuality.stations ?? [];
  const ranked = orderedStations(stations, airQuality.detail?.station_order);
  const topStations = ranked.slice(0, 8);
  const fields = fieldSignals(airQuality.detail?.coverage ?? {}, tKey);
  const currentScore = airQuality.worst_score;
  const dataTimezone = resolveDataTimezone(airQuality.time_scope?.timezone);
  const currentTone = (airQuality.detail?.tone ?? "neutral") as AirTone;
  const historyPoints = airHistoryPoints(history, tKey, language, dataTimezone);
  const activePollutantProfile = pollutantProfile(activePollutantKey);
  const highlightedCategoryEvent =
    (highlightedEventId
      ? category?.events.find((event) => event.id === highlightedEventId)
      : null) ??
    category?.events[0] ??
    null;
  const heroEventAnchorId = highlightedEventId ?? highlightedCategoryEvent?.id ?? null;
  const liveTone = liveStatusTone(airQuality.status);

  return (
    <section className="air-detail-page" aria-label={tKey("airQuality.airQualityDetail")}>
      <WorkspaceEvidenceHeader
        className="air-detail-header"
        eyebrow={tKey("airQuality.airQualityWorkspace")}
        fallbackKey="airQuality.notObserved"
        language={language}
        observedAt={airQuality.observed_at}
        sourceLabel={airQuality.source_code.toUpperCase()}
        status={tKey("airQuality.stationCoverageStatus")}
        statusTone={liveTone}
        tKey={tKey}
        timeScope={airQuality.time_scope}
        title={
          airQuality.location?.toLowerCase() === "helsinki"
            ? tKey("airQuality.helsinkiMetropolitanAir")
            : airQuality.location
              ? `${airQuality.location} ${tKey("airQuality.metropolitanAir")}`
              : tKey("airQuality.metropolitanAir")
        }
        timezone={dataTimezone}
      >
        <span className="workspace-evidence-observation">
          {observedExactLabel(airQuality.observed_at, language, tKey, dataTimezone, airQuality.time_scope)}
        </span>
      </WorkspaceEvidenceHeader>

      <section className="air-bento-grid" aria-label={tKey("airQuality.airQualityCurrentCondition")}>
        <article
          className={`air-glass-panel air-hero air-hero-${currentTone}`}
          id={heroEventAnchorId ? eventAnchorId(heroEventAnchorId) : undefined}
        >
          <div className="air-card-kicker">
            <span>{tKey("airQuality.currentNetworkCondition")}</span>
            <time>{observedExactLabel(airQuality.observed_at, language, tKey, dataTimezone, airQuality.time_scope)}</time>
          </div>
          <div className="air-current-score">
            <div
              className="air-score-ring"
              style={{ "--score": `${scorePercent(currentScore)}%` } as CSSProperties}
              aria-hidden="true"
            >
              <strong>{hasNumber(currentScore) ? formatNumber(currentScore, 0) : tKey("airQuality.na")}</strong>
              <span>/5</span>
            </div>
            <strong className="air-score-word">
              {scoreLabel(currentScore, airQuality.worst_label, language, tKey, dataLabel)}
            </strong>
          </div>
          <div className="air-score-scale" aria-hidden="true">
            {SCORE_BUCKETS.map((bucket) => (
              <span
                className={hasNumber(currentScore) && bucket <= Math.round(currentScore) ? "is-on" : ""}
                key={bucket}
              />
            ))}
          </div>
          <div className="air-score-scale-labels">
            <span>{tKey("airQuality.good")}</span>
            <span>{tKey("airQuality.veryPoor")}</span>
          </div>
          <p className="air-score-note">
            {tKey("airQuality.cityScoreNote")}
          </p>
        </article>

        <article className="air-glass-panel air-distribution-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "score_distribution",
                label: tKey("airQuality.scoreDistribution"),
                language,
              })}
            >
              {tKey("airQuality.scoreDistribution")}
            </DataLabelWithHelp>
            <strong>{stations.length}</strong>
          </header>
          <div className="air-score-bars">
            {scoreDistribution(airQuality.detail?.score_counts ?? {}, language, tKey, dataLabel).map((bucket) => (
              <div className={`air-score-row air-score-row-${["neutral", "good", "good", "warn", "bad", "bad"][bucket.score]}`} key={bucket.score}>
                <span>{bucket.label}</span>
                <i aria-hidden="true">
                  <span style={{ width: `${bucket.width}%` }} />
                </i>
                <strong>{bucket.count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="air-glass-panel air-field-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "available_fields",
                label: tKey("airQuality.availableFields"),
                language,
              })}
            >
              {tKey("airQuality.availableFields")}
            </DataLabelWithHelp>
            <strong>{readyFieldCount(fields)}</strong>
          </header>
          <div className="air-field-grid">
            {fields.map((field) => (
              <article className={field.ready ? "air-field-ready" : "air-field-missing"} key={field.key}>
                <span>{field.label}</span>
                <strong>{field.ready ? tKey("airQuality.ready") : tKey("airQuality.missing2")}</strong>
                <small>{field.detail}</small>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="air-summary-strip" aria-label={tKey("airQuality.airQualitySummaryMetrics")}>
        {POLLUTANT_PROFILES.map((profile) => {
          const value = airQuality.detail?.pollutants[profile.key]?.average ?? null;
          return (
            <article className="air-glass-panel" key={profile.key}>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: profile.key,
                  label: tKey(`airQuality.${profile.labelKey}`),
                  language,
                })}
              >
                {tKey(`airQuality.${profile.labelKey}`)}
              </DataLabelWithHelp>
              <strong>
                {hasNumber(value) ? formatNumber(value, profile.key === "european_aqi" ? 0 : 1) : tKey("airQuality.noValue")}
                {hasNumber(value) && profile.unit ? <small>{profile.unit}</small> : null}
              </strong>
              <span className={`air-metric-detail air-metric-detail-${airQuality.detail?.pollutants[profile.key]?.tone ?? "neutral"}`}>
                {cautionDetail(airQuality.detail, profile.key, tKey)}
              </span>
            </article>
          );
        })}
        <article className="air-glass-panel">
          <span>{tKey("airQuality.stationsReporting")}</span>
          <strong>
            {airQuality.quality.reporting_station_count}
            <small className="quiet-value">/{airQuality.quality.station_count}</small>
          </strong>
          <span className="air-metric-detail">
            {airQuality.quality.station_count - airQuality.quality.reporting_station_count > 0
              ? `${airQuality.quality.station_count - airQuality.quality.reporting_station_count} ${tKey("airQuality.stationReturnedNoValue")}`
              : tKey("airQuality.normalizedStationReadings")}
          </span>
        </article>
        <article className="air-glass-panel">
          <span>{tKey("airQuality.dataAge")}</span>
          <strong>{tKey("airQuality.snapshotAge")}</strong>
          <span className="air-metric-detail">
            {tKey("airQuality.absoluteDemoTimestamp")}
          </span>
        </article>
      </section>

      <TrendChart
        className="air-glass-panel"
        emptyMessage={tKey("airQuality.noDailyAirQualityHistoryIsAvailable")}
        eyebrow={`${historyPoints.length}D ${tKey("airQuality.history")}`}
        maximumFractionDigits={0}
        points={historyPoints}
        title={tKey("airQuality.worstStationScoreTrend")}
        tone={(airQuality.detail?.tone ?? "neutral") as AirTone}
        unit="/5"
      />

      <section className="air-main-grid" aria-label={tKey("airQuality.airQualityStationAnalytics")}>
        <article className="air-glass-panel air-pollutant-panel">
          <header>
            <div>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "pollutant_fields",
                  label: tKey("airQuality.pollutantConcentration"),
                  language,
                })}
              >
                {tKey("airQuality.pollutantConcentration")}
              </DataLabelWithHelp>
              <h3>{tKey(`airQuality.${activePollutantProfile.labelKey}`)} {tKey("airQuality.byReportingStation")}</h3>
            </div>
            <div className="air-pollutant-toggle" aria-label={tKey("airQuality.pollutantField")}>
              {POLLUTANT_PROFILES.map((profile) => (
                <button
                  aria-pressed={activePollutantKey === profile.key}
                  className={activePollutantKey === profile.key ? "active" : ""}
                  key={profile.key}
                  onClick={() => setActivePollutantKey(profile.key)}
                  title={profile.unit ? `${tKey(`airQuality.${profile.labelKey}`)}, ${profile.unit}` : tKey(`airQuality.${profile.labelKey}`)}
                  type="button"
                >
                  {tKey(`airQuality.${profile.labelKey}`)}
                </button>
              ))}
            </div>
          </header>
          {renderPollutantChart(airQuality.detail, activePollutantProfile, stations, language, tKey, dataLabel)}
        </article>

        <article className="air-station-panel">
          <header className="air-station-heading">
            <h2>{tKey("airQuality.stationsTitle")}</h2>
          </header>
          <div className="air-station-table" role="table" aria-label={tKey("airQuality.stationsTitle")}>
            <div className="air-station air-station-head" role="row">
              <span role="columnheader">{tKey("airQuality.station")}</span>
              <span role="columnheader">{tKey("airQuality.score")}</span>
              <span role="columnheader">{tKey("airQuality.pm25")}</span>
              <span role="columnheader">{tKey("airQuality.updated")}</span>
            </div>
            {topStations.length > 0 ? (
              topStations.map((station) => {
                const tone = (station.tone ?? "neutral") as AirTone;
                const updatedClock = hasNumber(station.score) || hasNumber(station.pm2_5)
                  ? formatStationClock(airQuality.observed_at, dataTimezone)
                  : null;
                return (
                  <div className={`air-station air-station-${tone}`} key={station.station} role="row">
                    <strong role="cell">{stationDisplayName(station)}</strong>
                    <span className="air-station-score" role="cell">
                      {hasNumber(station.score)
                        ? `${formatNumber(station.score, 0)}/5 ${scoreLabel(station.score, station.label, language, tKey, dataLabel)}`
                        : tKey("airQuality.noValue")}
                    </span>
                    <span role="cell">
                      {hasNumber(station.pm2_5) ? formatNumber(station.pm2_5, 1) : UNAVAILABLE_DATA_VALUE}
                    </span>
                    <span className="air-station-updated" role="cell">
                      {updatedClock ?? tKey("airQuality.empty")}
                    </span>
                  </div>
                );
              })
            ) : (
              <p>{tKey("airQuality.noStationRowsWereNormalizedFromTheLatestHsyPayload")}</p>
            )}
          </div>
        </article>

        <div className="air-side-grid">
          <article className="air-glass-panel air-map-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "station_geometry",
                  label: tKey("airQuality.stationGeometry"),
                  language,
                })}
              >
                {tKey("airQuality.stationGeometry")}
              </DataLabelWithHelp>
              <strong>{stations.filter((station) => hasNumber(station.lat) && hasNumber(station.lon)).length}</strong>
            </header>
            {renderStationMap(stations, language, tKey, dataLabel)}
          </article>

          <article className="air-glass-panel air-quality-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "data_quality",
                  label: tKey("airQuality.dataQuality"),
                  language,
                })}
              >
                {tKey("airQuality.dataQuality")}
              </DataLabelWithHelp>
              <strong>{formatPercent(airQuality.quality.field_coverage_pct, tKey)}</strong>
            </header>
            <span className="air-quality-meter" aria-hidden="true">
              <span style={{ width: `${airQuality.quality.field_coverage_pct}%` }} />
            </span>
            <div className="air-quality-facts">
              <span>{airQuality.quality.station_count} {tKey("airQuality.stationFeatures")}</span>
              <span>{airQuality.quality.reporting_station_count} {tKey("airQuality.scoredStations")}</span>
              <span>{airQuality.quality.missing_fields.length} {tKey("airQuality.missing")} {tKey("airQuality.fieldGroups")}</span>
            </div>
            <p>
              {airQuality.quality.missing_fields.length > 0
                ? `${tKey("airQuality.missingFullStationFields")}: ${airQuality.quality.missing_fields.join(", ")}.`
                : tKey("airQuality.allTrackedStationFieldsArePresent")}
            </p>
            {airQuality.quality.notes.map((note) => (
              <small key={note}>{localizedPlatformCopy(note, language) ?? note}</small>
            ))}
          </article>

          <article className="air-glass-panel air-pipeline-panel">
            <header>
              <span>{tKey("airQuality.collectionPipeline")}</span>
            </header>
            <div>
              {airQuality.data_pipeline.map((stage) => (
                <article className={`air-stage air-stage-${stageTone(stage)}`} key={stage.key}>
                  <strong>{localizedPlatformCopy(stage.label, language) ?? stage.label}</strong>
                  <span>
                    {enumLabel(stage.status).toUpperCase()}
                    {stage.record_count !== null ? `, ${stage.record_count} ${tKey("airQuality.records")}` : ""}
                  </span>
                </article>
              ))}
            </div>
          </article>

          <article className="air-glass-panel air-source-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "source_request",
                  label: tKey("airQuality.sourceRequest"),
                  language,
                })}
              >
                {tKey("airQuality.sourceRequest")}
              </DataLabelWithHelp>
              <strong>{sourceRequestCount(airQuality)}</strong>
            </header>
            <div>
              {airQuality.source_requests.map((request) => (
                <article className={`air-request air-request-${stageTone(request)}`} key={request.key}>
                  <div>
                    <strong>{localizedPlatformCopy(request.label, language) ?? request.label}</strong>
                    <span>{enumLabel(request.status)}</span>
                  </div>
                  <p>
                    {endpointLabel(request, tKey)}
                    {request.fetched_at ? `, ${tKey("airQuality.fetched")} ${scopedDataAge(request.fetched_at, airQuality.time_scope, language, tKey, "airQuality.notObserved", dataTimezone)}` : ""}
                  </p>
                  <small>{request.content_type ?? tKey("airQuality.contentTypeUnavailable")}</small>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className={`air-provider-status air-provider-status-${liveTone}`} aria-label={tKey("airQuality.airQualityProviderStatus")}>
        <div>
          <span aria-hidden="true" />
          <strong>{tKey("airQuality.providerStatus")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            {localizedPlatformCopy("HSY Air Quality WFS", language)}
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {tKey("airQuality.lastSync")}: {observedExactLabel(airQuality.observed_at ?? scopedReferenceTime(airQuality.time_scope), language, tKey, dataTimezone, airQuality.time_scope)}
          </span>
          <i aria-hidden="true" />
          <span className="air-provider-coverage">{tKey("airQuality.coverage2")}: {formatPercent(airQuality.quality.field_coverage_pct, tKey)}</span>
        </div>
      </section>

      <p className="air-detail-freshness">
        {localizedPlatformCopy(airQuality.summary, language) ?? localizedPlatformCopy(category?.description, language) ?? tKey("airQuality.latestNormalizedHsyAirQualityStationSignals")}
      </p>
    </section>
  );
}

function orderedStations(stations: AirQualityStation[], order: string[] = []): AirQualityStation[] {
  const byId = new Map(stations.map((station) => [station.station, station]));
  return order.flatMap((id) => { const station = byId.get(id); return station ? [station] : []; });
}
