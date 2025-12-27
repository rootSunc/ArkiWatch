import type { CSSProperties } from "react";

import { formatRelativeAge } from "@/features/shared/format";

import {
  AirQualityCurrentResponse,
  AirQualityDataStage,
  AirQualitySourceRequest,
  AirQualityStation,
  PlatformCategory
} from "./types";

type AirQualityWorkspaceProps = {
  airQuality: AirQualityCurrentResponse | null;
  category: PlatformCategory | null;
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

function scoreLabel(score: number | null | undefined, fallback?: string | null): string {
  if (score === null || score === undefined) {
    return fallback ?? "n/a";
  }

  return SCORE_LABELS[Math.min(Math.max(Math.round(score), 0), 5)] ?? fallback ?? "n/a";
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

function endpointLabel(request: AirQualitySourceRequest): string {
  if (!request.endpoint) {
    return "endpoint not recorded";
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

function fieldSignals(stations: AirQualityStation[]): FieldSignal[] {
  return [
    {
      key: "score",
      label: "Station score",
      ready: fieldCoverage(stations, "score") > 0,
      detail: `${fieldCoverage(stations, "score")}% populated`
    },
    {
      key: "index",
      label: "AQ index label",
      ready: fieldCoverage(stations, "label") > 0,
      detail: `${fieldCoverage(stations, "label")}% populated`
    },
    {
      key: "pm2_5",
      label: "PM2.5",
      ready: fieldCoverage(stations, "pm2_5") > 0,
      detail: `${fieldCoverage(stations, "pm2_5")}% populated`
    },
    {
      key: "pm10",
      label: "PM10",
      ready: fieldCoverage(stations, "pm10") > 0,
      detail: `${fieldCoverage(stations, "pm10")}% populated`
    },
    {
      key: "no2",
      label: "NO2",
      ready: fieldCoverage(stations, "no2") > 0,
      detail: `${fieldCoverage(stations, "no2")}% populated`
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

function scoreDistribution(stations: AirQualityStation[]) {
  const max = Math.max(1, ...SCORE_BUCKETS.map((score) => stations.filter((station) => station.score === score).length));
  return SCORE_BUCKETS.map((score) => {
    const count = stations.filter((station) => station.score === score).length;
    return {
      count,
      label: scoreLabel(score),
      score,
      width: Math.max(8, (count / max) * 100)
    };
  });
}

function observedLabel(value: string | null): string {
  return value ? formatRelativeAge(value) : "not observed";
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

export function AirQualityWorkspace({ airQuality, category }: AirQualityWorkspaceProps) {
  if (!airQuality) {
    return (
      <section className="air-detail-empty" aria-label="Air-quality data unavailable">
        <span>Air Quality</span>
        <h2>Station data is not available yet</h2>
        <p>HSY air-quality station snapshots have not arrived for the current platform window.</p>
      </section>
    );
  }

  const stations = airQuality.stations ?? [];
  const ranked = rankedStations(stations);
  const topStations = ranked.slice(0, 8);
  const fields = fieldSignals(stations);
  const currentScore = airQuality.worst_score;
  const currentTone = scoreTone(currentScore);
  const indexValues = stations.map(stationIndex).filter(hasNumber);
  const peakIndex = indexValues.length > 0 ? Math.max(...indexValues) : null;
  const lowIndex = indexValues.length > 0 ? Math.min(...indexValues) : null;
  const pollutantFieldsReady = POLLUTANT_FIELD_KEYS.filter((field) => fieldCoverage(stations, field) > 0).length;
  const scoreFieldsReady = SCORE_FIELD_KEYS.filter((field) => fieldCoverage(stations, field) > 0).length;

  return (
    <section className="air-detail-page" aria-label="Air-quality detail">
      <div className="air-detail-header">
        <div>
          <h2>{airQuality.location ? `${airQuality.location} Air Quality Network` : "Air Quality Network"}</h2>
          <div className="air-live-status">
            <span aria-hidden="true" />
            <strong>{airQuality.status === "ready" ? "HSY Sync Active" : "Sync Delayed"}</strong>
          </div>
        </div>
        <div>{airQuality.source_code.toUpperCase()} / {observedLabel(airQuality.observed_at)}</div>
      </div>

      <section className="air-bento-grid" aria-label="Air-quality current condition">
        <article className={`air-glass-panel air-hero air-hero-${currentTone}`}>
          <div className="air-card-kicker">
            <span>Current Network Condition</span>
            <time>{airQuality.observed_at ? observedLabel(airQuality.observed_at) : "not observed"}</time>
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
              <strong>{scoreLabel(currentScore, airQuality.worst_label)}</strong>
              <p>{airQuality.worst_station ?? "Worst station unavailable"}</p>
            </div>
          </div>
          <div className="air-hero-footer">
            <div>
              <span>Reporting</span>
              <strong>{airQuality.quality.reporting_station_count}/{airQuality.quality.station_count} stations</strong>
            </div>
            <div>
              <span>Index Range</span>
              <strong>
                {hasNumber(lowIndex) && hasNumber(peakIndex)
                  ? `${formatNumber(lowIndex, 0)}-${formatNumber(peakIndex, 0)}`
                  : "index missing"}
              </strong>
            </div>
          </div>
        </article>

        <article className="air-glass-panel air-distribution-panel">
          <header>
            <span>Score Distribution</span>
            <strong>{stations.length}</strong>
          </header>
          <div className="air-score-bars">
            {scoreDistribution(stations).map((bucket) => (
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
            <span>Available Fields</span>
            <strong>{readyFieldCount(fields)}</strong>
          </header>
          <div className="air-field-grid">
            {fields.map((field) => (
              <article className={field.ready ? "air-field-ready" : "air-field-missing"} key={field.key}>
                <span>{field.label}</span>
                <strong>{field.ready ? "Ready" : "Missing"}</strong>
                <small>{field.detail}</small>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="air-summary-strip" aria-label="Air-quality summary metrics">
        <article className="air-glass-panel">
          <span>Worst Score</span>
          <strong>{formatNumber(currentScore, 0)}/5</strong>
        </article>
        <article className="air-glass-panel">
          <span>Peak Index</span>
          <strong>{hasNumber(peakIndex) ? formatNumber(peakIndex, 0) : "missing"}</strong>
        </article>
        <article className="air-glass-panel">
          <span>Field Coverage</span>
          <strong>{formatNumber(airQuality.quality.field_coverage_pct, 0)}%</strong>
        </article>
        <article className="air-glass-panel">
          <span>Pollutant Fields</span>
          <strong>{pollutantFieldsReady}/3</strong>
        </article>
        <article className="air-glass-panel">
          <span>Score Fields</span>
          <strong>{scoreFieldsReady}/2</strong>
        </article>
      </section>

      <section className="air-main-grid" aria-label="Air-quality station analytics">
        <article className="air-glass-panel air-station-panel">
          <header>
            <div>
              <span>Station Ranking</span>
              <h3>Highest HSY index values</h3>
            </div>
            <strong>{topStations.length} rows</strong>
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
                        <span>{scoreLabel(station.score, station.label)} · score {formatNumber(station.score, 0)}/5</span>
                      </div>
                      <em>{hasNumber(index) ? formatNumber(index, 0) : "index missing"}</em>
                    </div>
                    <span className="air-index-track" aria-hidden="true">
                      <span style={{ width: `${indexPercent(index)}%` }} />
                    </span>
                  </article>
                );
              })
            ) : (
              <p>No station rows were normalized from the latest HSY payload.</p>
            )}
          </div>
        </article>

        <div className="air-side-grid">
          <article className="air-glass-panel air-quality-panel">
            <header>
              <span>Data Quality</span>
              <strong>{formatNumber(airQuality.quality.field_coverage_pct, 0)}%</strong>
            </header>
            <span className="air-quality-meter" aria-hidden="true">
              <span style={{ width: `${airQuality.quality.field_coverage_pct}%` }} />
            </span>
            <div className="air-quality-facts">
              <span>{airQuality.quality.station_count} station features</span>
              <span>{airQuality.quality.reporting_station_count} scored stations</span>
              <span>{airQuality.quality.missing_fields.length} missing field groups</span>
            </div>
            <p>
              {airQuality.quality.missing_fields.length > 0
                ? `Missing full station fields: ${airQuality.quality.missing_fields.join(", ")}.`
                : "All tracked station fields are present."}
            </p>
            {airQuality.quality.notes.map((note) => (
              <small key={note}>{note}</small>
            ))}
          </article>

          <article className="air-glass-panel air-pipeline-panel">
            <header>
              <span>Pipeline</span>
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
                    <span>{stage.status.replaceAll("_", " ")}</span>
                  </div>
                  <p>
                    {stage.detail}
                    {stage.record_count !== null ? ` · ${stage.record_count} records` : ""}
                  </p>
                </article>
              ))}
            </div>
          </article>

          <article className="air-glass-panel air-source-panel">
            <header>
              <span>Source Request</span>
              <strong>{sourceRequestCount(airQuality)}</strong>
            </header>
            <div>
              {airQuality.source_requests.map((request) => (
                <article className={`air-request air-request-${stageTone(request)}`} key={request.key}>
                  <div>
                    <strong>{request.label}</strong>
                    <span>{request.status.replaceAll("_", " ")}</span>
                  </div>
                  <p>
                    {endpointLabel(request)}
                    {request.fetched_at ? ` · fetched ${formatRelativeAge(request.fetched_at)}` : ""}
                  </p>
                  <small>{request.content_type ?? "content type unavailable"}</small>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="air-provider-status" aria-label="Air-quality provider status">
        <div>
          <span aria-hidden="true" />
          <strong>Provider Status</strong>
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
            Last Sync: {airQuality.observed_at ? observedLabel(airQuality.observed_at) : "not observed"}
          </span>
          <i aria-hidden="true" />
          <span className="air-provider-coverage">Coverage: {formatNumber(airQuality.quality.field_coverage_pct, 0)}%</span>
        </div>
      </section>

      <p className="air-detail-freshness">
        {airQuality.summary ?? category?.description ?? "Latest normalized HSY air-quality station signals."}
      </p>
    </section>
  );
}
