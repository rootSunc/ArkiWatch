 "use client";

import type { CSSProperties } from "react";

import { formatRelativeAge } from "@/features/shared/format";

import { LanguageMode, useI18n } from "./i18n";
import {
  AirQualityCurrentResponse,
  AirQualityDataStage,
  AirQualitySourceRequest,
  AirQualityStation,
  PlatformCategory,
  PlatformHistoricalSnapshot
} from "./types";
import { TrendChart, TrendChartPoint } from "./trend-chart";

type AirQualityWorkspaceProps = {
  airQuality: AirQualityCurrentResponse | null;
  category: PlatformCategory | null;
  history: PlatformHistoricalSnapshot<AirQualityCurrentResponse>[];
};

type AirTone = "good" | "warn" | "bad" | "neutral";

type FieldSignal = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
};

const SCORE_LABELS = ["n/a", "Good", "Fair", "Moderate", "Poor", "Very poor"];
const SCORE_BUCKETS = [1, 2, 3, 4, 5];
const SCORE_FIELD_KEYS: Array<keyof AirQualityStation> = ["score", "label"];
const POLLUTANT_FIELD_KEYS: Array<keyof AirQualityStation> = ["pm2_5", "pm10", "no2"];

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
  t: (value: string) => string
): string {
  if (score === null || score === undefined) {
    return fallback ? t(fallback) : "n/a";
  }

  return t(SCORE_LABELS[Math.min(Math.max(Math.round(score), 0), 5)] ?? fallback ?? "n/a");
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

function endpointLabel(request: AirQualitySourceRequest, t: (value: string) => string): string {
  if (!request.endpoint) {
    return t("endpoint not recorded");
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

function fieldSignals(stations: AirQualityStation[], t: (value: string) => string): FieldSignal[] {
  return [
    {
      key: "score",
      label: t("Station score"),
      ready: fieldCoverage(stations, "score") > 0,
      detail: `${fieldCoverage(stations, "score")}% ${t("populated")}`
    },
    {
      key: "index",
      label: t("AQ index label"),
      ready: fieldCoverage(stations, "label") > 0,
      detail: `${fieldCoverage(stations, "label")}% ${t("populated")}`
    },
    {
      key: "pm2_5",
      label: "PM2.5",
      ready: fieldCoverage(stations, "pm2_5") > 0,
      detail: `${fieldCoverage(stations, "pm2_5")}% ${t("populated")}`
    },
    {
      key: "pm10",
      label: "PM10",
      ready: fieldCoverage(stations, "pm10") > 0,
      detail: `${fieldCoverage(stations, "pm10")}% ${t("populated")}`
    },
    {
      key: "no2",
      label: "NO2",
      ready: fieldCoverage(stations, "no2") > 0,
      detail: `${fieldCoverage(stations, "no2")}% ${t("populated")}`
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

function scoreDistribution(stations: AirQualityStation[], language: LanguageMode, t: (value: string) => string) {
  const max = Math.max(1, ...SCORE_BUCKETS.map((score) => stations.filter((station) => station.score === score).length));
  return SCORE_BUCKETS.map((score) => {
    const count = stations.filter((station) => station.score === score).length;
    return {
      count,
      label: scoreLabel(score, null, language, t),
      score,
      width: Math.max(8, (count / max) * 100)
    };
  });
}

function observedLabel(value: string | null, language: LanguageMode, t: (value: string) => string): string {
  return value ? formatRelativeAge(value, language) : t("not observed");
}

function scorePercent(score: number | null | undefined): number {
  return Math.max(6, Math.min(100, ((score ?? 0) / 5) * 100));
}

function indexPercent(value: number | null): number {
  return Math.max(6, Math.min(100, value ?? 0));
}

function sourceRequestCount(airQuality: AirQualityCurrentResponse): string {
  const fetched = airQuality.source_requests.filter((request) => request.status === "fetched").length;
  return `${fetched}/${airQuality.source_requests.length}`;
}

function readyFieldCount(fields: FieldSignal[]): string {
  return `${fields.filter((field) => field.ready).length}/${fields.length}`;
}

function formatHistoryDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Helsinki"
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
  t: (value: string) => string
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
        label: formatHistoryDate(snapshot.date),
        value: worstScore,
        detail: `${data.quality.reporting_station_count}/${data.quality.station_count} ${t("stations")} · ${formatNumber(data.quality.field_coverage_pct, 0)}% ${t("coverage")}`
      }
    ];
  });
}

export function AirQualityWorkspace({ airQuality, category, history }: AirQualityWorkspaceProps) {
  const { language, t } = useI18n();

  if (!airQuality) {
    return (
      <section className="air-detail-empty" aria-label={t("Air-quality data unavailable")}>
        <span>{t("Air Quality")}</span>
        <h2>{t("Station data is not available yet")}</h2>
        <p>{t("HSY air-quality station snapshots have not arrived for the current platform window.")}</p>
      </section>
    );
  }

  const stations = airQuality.stations ?? [];
  const ranked = rankedStations(stations);
  const topStations = ranked.slice(0, 8);
  const fields = fieldSignals(stations, t);
  const currentScore = airQuality.worst_score;
  const currentTone = scoreTone(currentScore);
  const indexValues = stations.map(stationIndex).filter(hasNumber);
  const peakIndex = indexValues.length > 0 ? Math.max(...indexValues) : null;
  const lowIndex = indexValues.length > 0 ? Math.min(...indexValues) : null;
  const pollutantFieldsReady = POLLUTANT_FIELD_KEYS.filter((field) => fieldCoverage(stations, field) > 0).length;
  const scoreFieldsReady = SCORE_FIELD_KEYS.filter((field) => fieldCoverage(stations, field) > 0).length;
  const historyPoints = airHistoryPoints(history, t);

  return (
    <section className="air-detail-page" aria-label={t("Air-quality detail")}>
      <div className="air-detail-header">
        <div>
          <h2>{airQuality.location ? `${airQuality.location} ${t("Air Quality Network")}` : t("Air Quality Network")}</h2>
          <div className="air-live-status">
            <span aria-hidden="true" />
            <strong>{airQuality.status === "ready" ? t("HSY Sync Active") : t("Sync Delayed")}</strong>
          </div>
        </div>
        <div>{airQuality.source_code.toUpperCase()} / {observedLabel(airQuality.observed_at, language, t)}</div>
      </div>

      <section className="air-bento-grid" aria-label={t("Air-quality current condition")}>
        <article className={`air-glass-panel air-hero air-hero-${currentTone}`}>
          <div className="air-card-kicker">
            <span>{t("Current Network Condition")}</span>
            <time>{airQuality.observed_at ? observedLabel(airQuality.observed_at, language, t) : t("not observed")}</time>
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
              <strong>{scoreLabel(currentScore, airQuality.worst_label, language, t)}</strong>
              <p>{airQuality.worst_station ?? t("Worst station unavailable")}</p>
            </div>
          </div>
          <div className="air-hero-footer">
            <div>
              <span>{t("Reporting")}</span>
              <strong>{airQuality.quality.reporting_station_count}/{airQuality.quality.station_count} {t("stations")}</strong>
            </div>
            <div>
              <span>{t("Index Range")}</span>
              <strong>
                {hasNumber(lowIndex) && hasNumber(peakIndex)
                  ? `${formatNumber(lowIndex, 0)}-${formatNumber(peakIndex, 0)}`
                  : t("index missing")}
              </strong>
            </div>
          </div>
        </article>

        <article className="air-glass-panel air-distribution-panel">
          <header>
            <span>{t("Score Distribution")}</span>
            <strong>{stations.length}</strong>
          </header>
          <div className="air-score-bars">
            {scoreDistribution(stations, language, t).map((bucket) => (
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
            <span>{t("Available Fields")}</span>
            <strong>{readyFieldCount(fields)}</strong>
          </header>
          <div className="air-field-grid">
            {fields.map((field) => (
              <article className={field.ready ? "air-field-ready" : "air-field-missing"} key={field.key}>
                <span>{field.label}</span>
                <strong>{field.ready ? t("Ready") : t("Missing")}</strong>
                <small>{field.detail}</small>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="air-summary-strip" aria-label={t("Air-quality summary metrics")}>
        <article className="air-glass-panel">
          <span>{t("Worst Score")}</span>
          <strong>{formatNumber(currentScore, 0)}/5</strong>
        </article>
        <article className="air-glass-panel">
          <span>{t("Peak Index")}</span>
          <strong>{hasNumber(peakIndex) ? formatNumber(peakIndex, 0) : t("missing")}</strong>
        </article>
        <article className="air-glass-panel">
          <span>{t("Field Coverage")}</span>
          <strong>{formatNumber(airQuality.quality.field_coverage_pct, 0)}%</strong>
        </article>
        <article className="air-glass-panel">
          <span>{t("Pollutant Fields")}</span>
          <strong>{pollutantFieldsReady}/3</strong>
        </article>
        <article className="air-glass-panel">
          <span>{t("Score Fields")}</span>
          <strong>{scoreFieldsReady}/2</strong>
        </article>
      </section>

      <TrendChart
        className="air-glass-panel"
        emptyMessage={t("No daily air-quality history is available.")}
        eyebrow={`${historyPoints.length}D ${t("History")}`}
        maximumFractionDigits={0}
        points={historyPoints}
        title={t("Worst Station Score Trend")}
        tone={scoreTone(currentScore)}
        unit="/5"
      />

      <section className="air-main-grid" aria-label={t("Air-quality station analytics")}>
        <article className="air-glass-panel air-station-panel">
          <header>
            <div>
              <span>{t("Station Ranking")}</span>
              <h3>{t("Highest HSY index values")}</h3>
            </div>
            <strong>{topStations.length} {t("rows")}</strong>
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
                        <span>{scoreLabel(station.score, station.label, language, t)} · {t("score")} {formatNumber(station.score, 0)}/5</span>
                      </div>
                      <em>{hasNumber(index) ? formatNumber(index, 0) : t("index missing")}</em>
                    </div>
                    <span className="air-index-track" aria-hidden="true">
                      <span style={{ width: `${indexPercent(index)}%` }} />
                    </span>
                  </article>
                );
              })
            ) : (
              <p>{t("No station rows were normalized from the latest HSY payload.")}</p>
            )}
          </div>
        </article>

        <div className="air-side-grid">
          <article className="air-glass-panel air-quality-panel">
            <header>
              <span>{t("Data Quality")}</span>
              <strong>{formatNumber(airQuality.quality.field_coverage_pct, 0)}%</strong>
            </header>
            <span className="air-quality-meter" aria-hidden="true">
              <span style={{ width: `${airQuality.quality.field_coverage_pct}%` }} />
            </span>
            <div className="air-quality-facts">
              <span>{airQuality.quality.station_count} {t("station features")}</span>
              <span>{airQuality.quality.reporting_station_count} {t("scored stations")}</span>
              <span>{airQuality.quality.missing_fields.length} {t("missing")} {t("field groups")}</span>
            </div>
            <p>
              {airQuality.quality.missing_fields.length > 0
                ? `${t("Missing full station fields")}: ${airQuality.quality.missing_fields.join(", ")}.`
                : t("All tracked station fields are present.")}
            </p>
            {airQuality.quality.notes.map((note) => (
              <small key={note}>{note}</small>
            ))}
          </article>

          <article className="air-glass-panel air-pipeline-panel">
            <header>
              <span>{t("Pipeline")}</span>
              <strong>
                {airQuality.data_pipeline.filter((stage) => stage.status === "ready").length}/
                {airQuality.data_pipeline.length}
              </strong>
            </header>
            <div>
              {airQuality.data_pipeline.map((stage) => (
                <article className={`air-stage air-stage-${stageTone(stage)}`} key={stage.key}>
                  <div>
                    <strong>{stage.label}</strong>
                    <span>{t(stage.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>
                    {stage.detail}
                    {stage.record_count !== null ? ` · ${stage.record_count} ${t("records")}` : ""}
                  </p>
                </article>
              ))}
            </div>
          </article>

          <article className="air-glass-panel air-source-panel">
            <header>
              <span>{t("Source Request")}</span>
              <strong>{sourceRequestCount(airQuality)}</strong>
            </header>
            <div>
              {airQuality.source_requests.map((request) => (
                <article className={`air-request air-request-${stageTone(request)}`} key={request.key}>
                  <div>
                    <strong>{request.label}</strong>
                    <span>{t(request.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>
                    {endpointLabel(request, t)}
                    {request.fetched_at ? ` · ${t("fetched")} ${formatRelativeAge(request.fetched_at, language)}` : ""}
                  </p>
                  <small>{request.content_type ?? t("content type unavailable")}</small>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="air-provider-status" aria-label={t("Air-quality provider status")}>
        <div>
          <span aria-hidden="true" />
          <strong>{t("Provider Status")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            HSY Air Quality WFS
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {t("Last Sync")}: {airQuality.observed_at ? observedLabel(airQuality.observed_at, language, t) : t("not observed")}
          </span>
          <i aria-hidden="true" />
          <span className="air-provider-coverage">{t("Coverage")}: {formatNumber(airQuality.quality.field_coverage_pct, 0)}%</span>
        </div>
      </section>

      <p className="air-detail-freshness">
        {airQuality.summary ?? category?.description ?? t("Latest normalized HSY air-quality station signals.")}
      </p>
    </section>
  );
}
