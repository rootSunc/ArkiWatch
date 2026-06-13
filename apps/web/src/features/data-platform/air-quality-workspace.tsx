"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { useState } from "react";

import { formatRelativeAge, formatTimestamp } from "@/features/shared/format";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, useI18n } from "./i18n";
import {
  AirQualityCurrentResponse,
  AirQualityDataStage,
  AirQualitySourceRequest,
  AirQualityStation,
  PlatformCategory,
  PlatformHistoricalSnapshot
} from "./types";
import { TrendChart, TrendChartPoint } from "./lazy-trend-chart";
import { eventAnchorId } from "./recent-events";
import { localizedPlatformCopy } from "./platform-copy";
import { DEFAULT_DATA_TIME_ZONE, resolveDataTimezone } from "./data-timezone";

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
  cautionValue: number;
  severeValue: number;
};

const SCORE_LABEL_KEYS = ["na", "good", "fair", "moderate", "poor", "veryPoor"] as const;
const SCORE_BUCKETS = [1, 2, 3, 4, 5];
const SCORE_FIELD_KEYS: Array<keyof AirQualityStation> = ["score", "label"];
const POLLUTANT_PROFILES: PollutantProfile[] = [
  { key: "european_aqi", labelKey: "europeanAqi", unit: "", cautionValue: 50, severeValue: 75 },
  { key: "pm2_5", labelKey: "pm25", unit: "ug/m3", cautionValue: 10, severeValue: 25 },
  { key: "pm10", labelKey: "pm10", unit: "ug/m3", cautionValue: 20, severeValue: 50 },
  { key: "no2", labelKey: "no2", unit: "ug/m3", cautionValue: 40, severeValue: 100 }
];
const POLLUTANT_FIELD_KEYS: PollutantKey[] = POLLUTANT_PROFILES.map((profile) => profile.key);

function formatNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
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

function scoreTone(score: number | null | undefined): AirTone {
  if (score === null || score === undefined) {
    return "neutral";
  }
  if (score >= 4) {
    return "bad";
  }
  if (score === 3) {
    return "warn";
  }
  return "good";
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

function parseStationIndex(label: string | null | undefined): number | null {
  if (!label) {
    return null;
  }

  const value = Number.parseFloat(label.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function stationIndex(station: AirQualityStation): number | null {
  return parseStationIndex(station.label);
}

function endpointLabel(request: AirQualitySourceRequest, tKey: (key: string) => string): string {
  if (!request.endpoint) {
    return tKey("airQuality.endpointNotRecorded");
  }

  try {
    const url = new URL(request.endpoint);
    return `${url.host}${url.searchParams.get("typeNames") ? ` · ${url.searchParams.get("typeNames")}` : ""}`;
  } catch {
    return request.endpoint;
  }
}

function fieldCoverage(stations: AirQualityStation[], field: keyof AirQualityStation): number {
  if (stations.length === 0) {
    return 0;
  }

  const present = stations.filter((station) => {
    const value = station[field];
    return value !== null && value !== undefined && value !== "";
  }).length;
  return Math.round((present / stations.length) * 100);
}

function fieldSignals(stations: AirQualityStation[], tKey: (key: string) => string): FieldSignal[] {
  return [
    {
      key: "score",
      label: tKey("airQuality.stationScore"),
      ready: fieldCoverage(stations, "score") > 0,
      detail: `${fieldCoverage(stations, "score")}% ${tKey("airQuality.populated")}`
    },
    {
      key: "index",
      label: tKey("airQuality.aqIndexLabel"),
      ready: fieldCoverage(stations, "label") > 0,
      detail: `${fieldCoverage(stations, "label")}% ${tKey("airQuality.populated")}`
    },
    {
      key: "european_aqi",
      label: tKey("airQuality.europeanAqi"),
      ready: fieldCoverage(stations, "european_aqi") > 0,
      detail: `${fieldCoverage(stations, "european_aqi")}% ${tKey("airQuality.populated")}`
    },
    {
      key: "pm2_5",
      label: tKey("airQuality.pm25"),
      ready: fieldCoverage(stations, "pm2_5") > 0,
      detail: `${fieldCoverage(stations, "pm2_5")}% ${tKey("airQuality.populated")}`
    },
    {
      key: "pm10",
      label: tKey("airQuality.pm10"),
      ready: fieldCoverage(stations, "pm10") > 0,
      detail: `${fieldCoverage(stations, "pm10")}% ${tKey("airQuality.populated")}`
    },
    {
      key: "no2",
      label: tKey("airQuality.no2"),
      ready: fieldCoverage(stations, "no2") > 0,
      detail: `${fieldCoverage(stations, "no2")}% ${tKey("airQuality.populated")}`
    }
  ];
}

function rankedStations(stations: AirQualityStation[]): AirQualityStation[] {
  return [...stations].sort((left, right) => {
    const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return (stationIndex(right) ?? -1) - (stationIndex(left) ?? -1);
  });
}

function scoreDistribution(
  stations: AirQualityStation[],
  language: LanguageMode,
  tKey: (key: string) => string,
  dataLabel: (value: string | null | undefined) => string,
) {
  const max = Math.max(1, ...SCORE_BUCKETS.map((score) => stations.filter((station) => station.score === score).length));
  return SCORE_BUCKETS.map((score) => {
    const count = stations.filter((station) => station.score === score).length;
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
): string {
  if (!value) {
    return tKey("airQuality.notObserved");
  }

  return `${formatTimestamp(value, "dateTime", language, timeZone)} (${formatRelativeAge(value, language)})`;
}

function liveStatusTone(status: string | null | undefined): "ready" | "stale" | "empty" {
  if (status === "ready") {
    return "ready";
  }
  if (status === "stale") {
    return "stale";
  }
  return "empty";
}

function scorePercent(score: number | null | undefined): number {
  return Math.max(6, Math.min(100, ((score ?? 0) / 5) * 100));
}

function indexPercent(value: number | null): number {
  return Math.max(6, Math.min(100, value ?? 0));
}

function pollutantProfile(key: PollutantKey): PollutantProfile {
  return POLLUTANT_PROFILES.find((profile) => profile.key === key) ?? POLLUTANT_PROFILES[0];
}

function pollutantValue(station: AirQualityStation, key: PollutantKey): number | null {
  return station[key];
}

function formatPollutantValue(value: number | null, profile: PollutantProfile): string {
  if (!hasNumber(value)) {
    return "n/a";
  }

  const formattedValue = formatNumber(value, profile.unit ? 1 : 0);
  return profile.unit ? `${formattedValue} ${profile.unit}` : formattedValue;
}

function pollutantTone(value: number | null, profile: PollutantProfile): AirTone {
  if (value === null) {
    return "neutral";
  }
  if (value >= profile.severeValue) {
    return "bad";
  }
  if (value >= profile.cautionValue) {
    return "warn";
  }
  return "good";
}

function pollutantStations(stations: AirQualityStation[], key: PollutantKey): AirQualityStation[] {
  return [...stations]
    .filter((station) => hasNumber(pollutantValue(station, key)))
    .sort((left, right) => (pollutantValue(right, key) ?? -1) - (pollutantValue(left, key) ?? -1));
}

function averagePollutantValue(stations: AirQualityStation[], key: PollutantKey): number | null {
  const values = stations.map((station) => pollutantValue(station, key)).filter(hasNumber);
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stationDisplayName(station: AirQualityStation): string {
  return station.station || station.label || "Unknown station";
}

function sourceRequestCount(airQuality: AirQualityCurrentResponse): string {
  const fetched = airQuality.source_requests.filter((request) => request.status === "fetched").length;
  return `${fetched}/${airQuality.source_requests.length}`;
}

function readyFieldCount(fields: FieldSignal[]): string {
  return `${fields.filter((field) => field.ready).length}/${fields.length}`;
}

function formatHistoryDate(value: string, timeZone = DEFAULT_DATA_TIME_ZONE): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: resolveDataTimezone(timeZone)
  })
    .format(parsed)
    .toUpperCase();
}

function fallbackWorstScore(airQuality: AirQualityCurrentResponse): number | null {
  const stationScores = airQuality.stations
    .map((station) => station.score)
    .filter(hasNumber);

  if (airQuality.worst_score !== null && airQuality.worst_score !== undefined) {
    return airQuality.worst_score;
  }

  return stationScores.length > 0 ? Math.max(...stationScores) : null;
}

function airHistoryPoints(
  history: PlatformHistoricalSnapshot<AirQualityCurrentResponse>[],
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): TrendChartPoint[] {
  return history.flatMap((snapshot) => {
    const data = snapshot.data;
    if (!data) {
      return [];
    }

    const worstScore = fallbackWorstScore(data);
    if (worstScore === null) {
      return [];
    }

    return [
      {
        label: formatHistoryDate(snapshot.date, timeZone),
        value: worstScore,
        detail: `${data.quality.reporting_station_count}/${data.quality.station_count} ${tKey("airQuality.stations")} · ${formatNumber(data.quality.field_coverage_pct, 0)}% ${tKey("airQuality.coverage")}`
      }
    ];
  });
}

function renderPollutantChart(
  profile: PollutantProfile,
  stations: AirQualityStation[],
  language: LanguageMode,
  tKey: (key: string) => string,
  dataLabel: (value: string | null | undefined) => string,
) {
  const rows = pollutantStations(stations, profile.key).slice(0, 8);
  const values = rows.map((station) => pollutantValue(station, profile.key)).filter(hasNumber);
  const maxValue = Math.max(profile.severeValue, ...values, 1);
  const averageValue = averagePollutantValue(stations, profile.key);
  const peakValue = values.length > 0 ? Math.max(...values) : null;

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
          <strong>{pollutantStations(stations, profile.key).length}/{stations.length}</strong>
        </article>
      </div>

      {rows.length > 0 ? (
        <div className="air-pollutant-list">
          {rows.map((station) => {
            const value = pollutantValue(station, profile.key);
            const percent = Math.max(2, Math.min(100, ((value ?? 0) / maxValue) * 100));
            const tone = pollutantTone(value, profile);
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
      scoreTone={scoreTone}
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

  if (!airQuality) {
    return (
      <section className="air-detail-empty" aria-label={tKey("airQuality.airQualityDataUnavailable")}>
        <span>{tKey("airQuality.airQuality")}</span>
        <h2>{tKey("airQuality.stationDataIsNotAvailableYet")}</h2>
        <p>{tKey("airQuality.hsyAirQualityStationSnapshotsHaveNotArrivedForTheCurrentPlatformWindow")}</p>
      </section>
    );
  }

  const stations = airQuality.stations ?? [];
  const ranked = rankedStations(stations);
  const topStations = ranked.slice(0, 8);
  const fields = fieldSignals(stations, tKey);
  const currentScore = airQuality.worst_score;
  const dataTimezone = resolveDataTimezone(airQuality.time_scope?.timezone);
  const currentTone = scoreTone(currentScore);
  const indexValues = stations.map(stationIndex).filter(hasNumber);
  const peakIndex = indexValues.length > 0 ? Math.max(...indexValues) : null;
  const lowIndex = indexValues.length > 0 ? Math.min(...indexValues) : null;
  const pollutantFieldsReady = POLLUTANT_FIELD_KEYS.filter((field) => fieldCoverage(stations, field) > 0).length;
  const scoreFieldsReady = SCORE_FIELD_KEYS.filter((field) => fieldCoverage(stations, field) > 0).length;
  const historyPoints = airHistoryPoints(history, tKey, dataTimezone);
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
      <div className="air-detail-header">
        <div>
          <h2>{airQuality.location ? `${airQuality.location} ${tKey("airQuality.airQualityNetwork")}` : tKey("airQuality.airQualityNetwork")}</h2>
          <div className={`air-live-status air-live-status-${liveTone}`}>
            <span aria-hidden="true" />
            <strong>{airQuality.status === "ready" ? tKey("airQuality.hsySyncActive") : tKey("airQuality.syncDelayed")}</strong>
          </div>
        </div>
        <div>{airQuality.source_code.toUpperCase()} / {observedExactLabel(airQuality.observed_at, language, tKey, dataTimezone)}</div>
      </div>

      <section className="air-bento-grid" aria-label={tKey("airQuality.airQualityCurrentCondition")}>
        <article
          className={`air-glass-panel air-hero air-hero-${currentTone}`}
          id={heroEventAnchorId ? eventAnchorId(heroEventAnchorId) : undefined}
        >
          <div className="air-card-kicker">
            <span>{tKey("airQuality.currentNetworkCondition")}</span>
            <time>{observedExactLabel(airQuality.observed_at, language, tKey, dataTimezone)}</time>
          </div>
          <div className="air-current-score">
            <div
              className="air-score-ring"
              style={{ "--score": `${scorePercent(currentScore)}%` } as CSSProperties}
              aria-hidden="true"
            >
              <strong>{formatNumber(currentScore, 0)}</strong>
              <span>/5</span>
            </div>
            <div>
              <strong>{scoreLabel(currentScore, airQuality.worst_label, language, tKey, dataLabel)}</strong>
              <p>{airQuality.worst_station ?? tKey("airQuality.worstStationUnavailable")}</p>
            </div>
          </div>
          <div className="air-hero-footer">
            <div>
              <span>{tKey("airQuality.reporting")}</span>
              <strong>{airQuality.quality.reporting_station_count}/{airQuality.quality.station_count} {tKey("airQuality.stations")}</strong>
            </div>
            <div>
              <span>{tKey("airQuality.indexRange")}</span>
              <strong>
                {hasNumber(lowIndex) && hasNumber(peakIndex)
                  ? `${formatNumber(lowIndex, 0)}-${formatNumber(peakIndex, 0)}`
                  : tKey("airQuality.indexMissing")}
              </strong>
            </div>
          </div>
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
            {scoreDistribution(stations, language, tKey, dataLabel).map((bucket) => (
              <div className={`air-score-row air-score-row-${scoreTone(bucket.score)}`} key={bucket.score}>
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
        <article className="air-glass-panel">
          <DataLabelWithHelp
            helpText={dataHelpText({
              key: "worst_score",
              label: tKey("airQuality.worstScore"),
              language,
            })}
          >
            {tKey("airQuality.worstScore")}
          </DataLabelWithHelp>
          <strong>{formatNumber(currentScore, 0)}/5</strong>
        </article>
        <article className="air-glass-panel">
          <DataLabelWithHelp
            helpText={dataHelpText({
              key: "peak_index",
              label: tKey("airQuality.peakIndex"),
              language,
            })}
          >
            {tKey("airQuality.peakIndex")}
          </DataLabelWithHelp>
          <strong>{hasNumber(peakIndex) ? formatNumber(peakIndex, 0) : tKey("airQuality.missing")}</strong>
        </article>
        <article className="air-glass-panel">
          <DataLabelWithHelp
            helpText={dataHelpText({
              key: "field_coverage",
              label: tKey("airQuality.fieldCoverage"),
              language,
            })}
          >
            {tKey("airQuality.fieldCoverage")}
          </DataLabelWithHelp>
          <strong>{formatNumber(airQuality.quality.field_coverage_pct, 0)}%</strong>
        </article>
        <article className="air-glass-panel">
          <DataLabelWithHelp
            helpText={dataHelpText({
              key: "pollutant_fields",
              label: tKey("airQuality.pollutantFields"),
              language,
            })}
          >
            {tKey("airQuality.pollutantFields")}
          </DataLabelWithHelp>
          <strong>{pollutantFieldsReady}/{POLLUTANT_FIELD_KEYS.length}</strong>
        </article>
        <article className="air-glass-panel">
          <DataLabelWithHelp
            helpText={dataHelpText({
              key: "score_fields",
              label: tKey("airQuality.scoreFields"),
              language,
            })}
          >
            {tKey("airQuality.scoreFields")}
          </DataLabelWithHelp>
          <strong>{scoreFieldsReady}/2</strong>
        </article>
      </section>

      <TrendChart
        className="air-glass-panel"
        emptyMessage={tKey("airQuality.noDailyAirQualityHistoryIsAvailable")}
        eyebrow={`${historyPoints.length}D ${tKey("airQuality.history")}`}
        maximumFractionDigits={0}
        points={historyPoints}
        title={tKey("airQuality.worstStationScoreTrend")}
        tone={scoreTone(currentScore)}
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
                  title={profile.unit ? `${tKey(`airQuality.${profile.labelKey}`)} · ${profile.unit}` : tKey(`airQuality.${profile.labelKey}`)}
                  type="button"
                >
                  {tKey(`airQuality.${profile.labelKey}`)}
                </button>
              ))}
            </div>
          </header>
          {renderPollutantChart(activePollutantProfile, stations, language, tKey, dataLabel)}
        </article>

        <article className="air-glass-panel air-station-panel">
          <header>
            <div>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "station_ranking",
                  label: tKey("airQuality.stationRanking"),
                  language,
                })}
              >
                {tKey("airQuality.stationRanking")}
              </DataLabelWithHelp>
              <h3>{tKey("airQuality.highestHsyIndexValues")}</h3>
            </div>
            <strong>{topStations.length} {tKey("airQuality.rows")}</strong>
          </header>
          <div className="air-station-list">
            {topStations.length > 0 ? (
              topStations.map((station) => {
                const index = stationIndex(station);
                const tone = scoreTone(station.score);
                return (
                  <article className={`air-station air-station-${tone}`} key={station.station}>
                    <div className="air-station-main">
                      <div>
                        <strong>{station.station}</strong>
                        <span>{scoreLabel(station.score, station.label, language, tKey, dataLabel)} · {tKey("airQuality.score")} {formatNumber(station.score, 0)}/5</span>
                      </div>
                      <em>{hasNumber(index) ? formatNumber(index, 0) : tKey("airQuality.indexMissing")}</em>
                    </div>
                    <span className="air-index-track" aria-hidden="true">
                      <span style={{ width: `${indexPercent(index)}%` }} />
                    </span>
                  </article>
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
              <strong>{formatNumber(airQuality.quality.field_coverage_pct, 0)}%</strong>
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
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "pipeline",
                  label: tKey("airQuality.pipeline"),
                  language,
                })}
              >
                {tKey("airQuality.pipeline")}
              </DataLabelWithHelp>
              <strong>
                {airQuality.data_pipeline.filter((stage) => stage.status === "ready").length}/
                {airQuality.data_pipeline.length}
              </strong>
            </header>
            <div>
              {airQuality.data_pipeline.map((stage) => (
                <article className={`air-stage air-stage-${stageTone(stage)}`} key={stage.key}>
                  <div>
                    <strong>{localizedPlatformCopy(stage.label, language) ?? stage.label}</strong>
                    <span>{enumLabel(stage.status)}</span>
                  </div>
                  <p>
                    {localizedPlatformCopy(stage.detail, language) ?? stage.detail}
                    {stage.record_count !== null ? ` · ${stage.record_count} ${tKey("airQuality.records")}` : ""}
                  </p>
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
                    {request.fetched_at ? ` · ${tKey("airQuality.fetched")} ${formatRelativeAge(request.fetched_at, language)}` : ""}
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
            {tKey("airQuality.lastSync")}: {observedExactLabel(airQuality.observed_at, language, tKey, dataTimezone)}
          </span>
          <i aria-hidden="true" />
          <span className="air-provider-coverage">{tKey("airQuality.coverage2")}: {formatNumber(airQuality.quality.field_coverage_pct, 0)}%</span>
        </div>
      </section>

      <p className="air-detail-freshness">
        {localizedPlatformCopy(airQuality.summary, language) ?? localizedPlatformCopy(category?.description, language) ?? tKey("airQuality.latestNormalizedHsyAirQualityStationSignals")}
      </p>
    </section>
  );
}
