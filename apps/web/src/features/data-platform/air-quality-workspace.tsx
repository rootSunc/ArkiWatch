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

const SCORE_LABELS = ["n/a", "Good", "Fair", "Moderate", "Poor", "Very poor"];

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

function scoreTone(score: number | null | undefined): string {
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

function stageTone(stage: Pick<AirQualityDataStage | AirQualitySourceRequest, "status">): string {
  if (stage.status === "ready" || stage.status === "fetched") {
    return "good";
  }
  if (stage.status === "empty" || stage.status === "missing") {
    return "warn";
  }
  return "neutral";
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

function pollutantAverage(
  stations: AirQualityStation[],
  key: "pm2_5" | "pm10" | "no2"
): number | null {
  const values = stations.flatMap((station) => {
    const value = station[key];
    return value === null ? [] : [value];
  });
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function AirQualityWorkspace({ airQuality, category }: AirQualityWorkspaceProps) {
  if (!airQuality) {
    return (
      <section className="air-empty" aria-label="Air-quality data unavailable">
        <span className="label-text">Air quality</span>
        <h2>Station data is not available yet</h2>
        <p>HSY air-quality station snapshots have not arrived for the current platform window.</p>
      </section>
    );
  }

  const stations = airQuality.stations ?? [];
  const topStations = stations.slice(0, 6);
  const quality = airQuality.quality;
  const currentScore = airQuality.worst_score;
  const currentLabel = scoreLabel(currentScore, airQuality.worst_label);
  const missingFields =
    quality.missing_fields.length > 0 ? quality.missing_fields : ["no full-field gaps"];
  const pm25Average = pollutantAverage(stations, "pm2_5");
  const pm10Average = pollutantAverage(stations, "pm10");
  const no2Average = pollutantAverage(stations, "no2");

  return (
    <section className="air-workspace" aria-label="Air-quality workspace">
      <div className={`air-hero air-hero-${scoreTone(currentScore)}`}>
        <div>
          <span className="label-text">{airQuality.source_code} air quality</span>
          <h2>{airQuality.location ?? "Helsinki"} station network</h2>
          <p>{airQuality.summary ?? category?.description ?? "Latest normalized air-quality signals."}</p>
        </div>
        <div className="air-current">
          <span>Worst station</span>
          <strong>{currentLabel}</strong>
          <small>
            {airQuality.worst_station ?? "n/a"} · score {formatNumber(currentScore, 0)}/5 ·{" "}
            {airQuality.observed_at ? formatRelativeAge(airQuality.observed_at) : "not observed"}
          </small>
        </div>
      </div>

      <div className="air-kpi-grid">
        <article>
          <span>Reporting stations</span>
          <strong>{quality.reporting_station_count}</strong>
          <small>{quality.station_count} station features in the latest payload</small>
        </article>
        <article>
          <span>PM2.5 average</span>
          <strong>{formatNumber(pm25Average)} ug/m3</strong>
          <small>fine particulate matter across reporting stations</small>
        </article>
        <article>
          <span>PM10 average</span>
          <strong>{formatNumber(pm10Average)} ug/m3</strong>
          <small>coarse particulate matter where supplied</small>
        </article>
        <article>
          <span>NO2 average</span>
          <strong>{formatNumber(no2Average)} ug/m3</strong>
          <small>traffic-related nitrogen dioxide signal</small>
        </article>
      </div>

      <div className="air-data-grid">
        <section className="air-pipeline-panel" aria-label="Air-quality data pipeline">
          <header>
            <div>
              <span className="label-text">Data pipeline</span>
              <h3>Fetch, clean, visualize</h3>
            </div>
            <strong>{airQuality.data_pipeline.filter((stage) => stage.status === "ready").length}/3</strong>
          </header>
          <div className="air-stage-list">
            {airQuality.data_pipeline.map((stage) => (
              <article className={`air-stage air-stage-${stageTone(stage)}`} key={stage.key}>
                <div>
                  <strong>{stage.label}</strong>
                  <span>{stage.status.replaceAll("_", " ")}</span>
                </div>
                <small>
                  {stage.detail}
                  {stage.record_count !== null ? ` · records ${stage.record_count}` : ""}
                </small>
              </article>
            ))}
          </div>
        </section>

        <section className="air-quality-panel" aria-label="Air-quality cleaning quality">
          <header>
            <div>
              <span className="label-text">Cleaned data</span>
              <h3>{quality.reporting_station_count} scored stations</h3>
            </div>
            <strong>{formatNumber(quality.field_coverage_pct, 0)}%</strong>
          </header>
          <div className="air-quality-meter">
            <i style={{ "--quality": `${quality.field_coverage_pct}%` } as CSSProperties} />
          </div>
          <div className="air-quality-grid">
            <span>{quality.station_count} features</span>
            <span>{missingFields.join(", ")}</span>
          </div>
          <div className="air-quality-notes">
            {(quality.notes.length > 0 ? quality.notes : ["No quality notes returned."]).map((note) => (
              <small key={note}>{note}</small>
            ))}
          </div>
        </section>
      </div>

      <div className="air-main-grid">
        <section className="air-station-panel" aria-label="Air-quality station ranking">
          <header>
            <div>
              <span className="label-text">Station ranking</span>
              <h3>Worst current scores</h3>
            </div>
            <small>{topStations.length} rows</small>
          </header>
          <div className="air-station-list">
            {topStations.length > 0 ? (
              topStations.map((station) => (
                <article className={`air-station air-station-${scoreTone(station.score)}`} key={station.station}>
                  <div>
                    <strong>{station.station}</strong>
                    <span>{scoreLabel(station.score, station.label)}</span>
                  </div>
                  <div className="air-score-track">
                    <i style={{ "--score": `${((station.score ?? 0) / 5) * 100}%` } as CSSProperties} />
                  </div>
                  <small>
                    PM2.5 {formatNumber(station.pm2_5)} · PM10 {formatNumber(station.pm10)} · NO2{" "}
                    {formatNumber(station.no2)}
                  </small>
                </article>
              ))
            ) : (
              <p>No station rows were normalized from the latest HSY payload.</p>
            )}
          </div>
        </section>

        <section className="air-source-panel" aria-label="Air-quality source requests">
          <header>
            <span className="label-text">Source requests</span>
            <strong>{airQuality.source_requests.filter((request) => request.status === "fetched").length}</strong>
          </header>
          <div className="air-request-list">
            {airQuality.source_requests.map((request) => (
              <article className={`air-request air-request-${stageTone(request)}`} key={request.key}>
                <div>
                  <strong>{request.label}</strong>
                  <span>{request.status}</span>
                </div>
                <small>
                  {endpointLabel(request)}
                  {request.fetched_at ? ` · fetched ${formatRelativeAge(request.fetched_at)}` : ""}
                </small>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
