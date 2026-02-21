import type { ReactNode } from "react";

type Translate = (value: string) => string;

type DataHelpTextOptions = {
  key?: string | null;
  label?: string | null;
  detail?: string | null;
  t?: Translate;
};

type DataHelpIconProps = {
  text: string | null | undefined;
};

type DataLabelWithHelpProps = {
  children: ReactNode;
  className?: string;
  helpText: string | null | undefined;
};

const HELP_TEXT_BY_KEY: Record<string, string> = {
  active_alerts: "Alerts that are active right now in the selected time window.",
  active_events: "Events or guidance items still active in the selected time window.",
  active_fields: "Tracked key fields across the visible data streams.",
  aqi_avg: "Air-quality index on a 1 to 5 scale; higher values mean worse air.",
  alert_scope: "How many alerts include route, stop, trip, or network-wide scope.",
  available_fields: "Fields present in the latest normalized source payload.",
  best_price: "Sustained relative-low electricity-price window found in the current forecast horizon.",
  best_window: "Best sustained low-value energy window found in the current signal horizon.",
  catalog_coverage: "How much of the source catalog is represented by mapped sources, datasets, and fields.",
  catalog_stage: "Integration stage of this category in the platform catalog.",
  collection_volume: "Records or source points collected for this panel.",
  comparative_matrix: "Side-by-side city indicator table for quick comparison.",
  current_condition: "Latest normalized value that represents the current state.",
  current_network_condition: "Worst reported station condition across the air-quality network.",
  current_transit_risk: "Current count and severity of active transit alerts.",
  data_quality: "Completeness of the required fields and records for this panel.",
  data_sources: "External datasets and APIs registered for the current platform view.",
  event_keywords: "Distinct keyword labels attached to visible events.",
  event_places: "Distinct event locations in the visible Linked Events window.",
  event_readiness: "Whether source records can be normalized into timeline events.",
  feed_coverage: "Share of expected feed fields present in the latest decoded payload.",
  field_coverage: "Percent of required fields that are present in the latest normalized data.",
  free_events: "Events with at least one free offer in the source payload.",
  high_severity: "Alerts or events classified as high severity.",
  hourly_points: "Number of hourly forecast rows available for charts and summaries.",
  latest_ingest: "Records collected during the latest source collector run.",
  last_sync: "Most recent successful collection or generation time available for this signal.",
  live_data_streams: "Number of signal categories currently loaded in this dashboard.",
  low_energy_window: "Detected low-price or low-system-value window for flexible electricity use.",
  normalized: "Source records converted into the platform event model.",
  normalized_event: "Normalized platform event structure built from source payload fields.",
  peak_gust: "Highest short burst of wind in the forecast period.",
  peak_index: "Highest parsed air-quality index value among reporting stations.",
  peak_precipitation: "Highest hourly rain intensity in the forecast period.",
  peak_rain: "Highest hourly rain intensity in the forecast period.",
  peak_wind: "Highest sustained wind speed in the forecast period.",
  pipeline: "Processing stages used to fetch, clean, normalize, and expose the data.",
  pollutant_fields: "European AQI and pollutant measurements with at least one reporting station.",
  rain_windows: "Forecast periods where measurable rain is expected.",
  raw_decoded: "Raw feed entities decoded before normalization.",
  raw_feed: "Raw alert entities received directly from the source feed.",
  raw_messages: "Traffic messages decoded from the source feed before normalization.",
  records_ingested: "Records collected during the latest source collector run.",
  relative_savings: "How far the selected flexible-use window sits below the forecast average.",
  road_disruptions: "Road events normalized from traffic messages.",
  road_weather: "Road-weather risk messages detected in the current window.",
  route_scoped: "Alerts that include at least one route identifier.",
  corridors: "Grouped affected road or rail locations.",
  score_distribution: "How reporting stations are distributed across air-quality scores.",
  score_fields: "Station score and score label fields found in the payload.",
  selected_event: "The event currently opened for location, keyword, and source inspection.",
  severity_mix: "Distribution of alerts or events by severity level.",
  signal_level: "Fallback metric selected to summarize this signal when no domain-specific readout exists.",
  source_layers: "Source datasets or layers used to build this view.",
  source_readiness: "Number of configured sources that are ready for this category.",
  source_request: "Latest request made to the upstream data provider.",
  source_state: "Operational status of the upstream source for this panel.",
  source_status: "Operational health of the registered sources for this category.",
  event_map_geometry: "Activities with latitude and longitude available for mapping.",
  station_geometry: "Stations with latitude and longitude available for mapping.",
  station_ranking: "Stations ordered by the highest reported air-quality index.",
  stop_scoped: "Alerts that include at least one stop identifier.",
  temperature_range: "Minimum and maximum forecast temperature in the visible period.",
  thermal_range: "Minimum and maximum forecast temperature in the visible period.",
  tracked_fields: "Data fields this panel expects and maps from source records.",
  transit_disruptions: "Service alerts detected by the transit collector.",
  upcoming_events: "Future events in the currently selected time window.",
  window_state: "Whether the platform found a usable energy window.",
  worst_score: "Worst station score in the current air-quality network snapshot.",
  worst_station: "Station with the worst current air-quality status."
};

const HELP_TEXT_BY_LABEL: Record<string, string> = {
  "active events": HELP_TEXT_BY_KEY.active_events,
  "active fields": HELP_TEXT_BY_KEY.active_fields,
  "active now": HELP_TEXT_BY_KEY.active_alerts,
  "alert scope": HELP_TEXT_BY_KEY.alert_scope,
  "available fields": HELP_TEXT_BY_KEY.available_fields,
  "best price": HELP_TEXT_BY_KEY.best_price,
  "best window": HELP_TEXT_BY_KEY.best_window,
  "catalog coverage": HELP_TEXT_BY_KEY.catalog_coverage,
  "catalog stage": HELP_TEXT_BY_KEY.catalog_stage,
  "collection volume": HELP_TEXT_BY_KEY.collection_volume,
  "comparative matrix": HELP_TEXT_BY_KEY.comparative_matrix,
  "current condition": HELP_TEXT_BY_KEY.current_condition,
  "current network condition": HELP_TEXT_BY_KEY.current_network_condition,
  "current transit risk": HELP_TEXT_BY_KEY.current_transit_risk,
  "data quality": HELP_TEXT_BY_KEY.data_quality,
  "data sources": HELP_TEXT_BY_KEY.data_sources,
  "event readiness": HELP_TEXT_BY_KEY.event_readiness,
  "feed coverage": HELP_TEXT_BY_KEY.feed_coverage,
  "field coverage": HELP_TEXT_BY_KEY.field_coverage,
  "free events": HELP_TEXT_BY_KEY.free_events,
  "high severity": HELP_TEXT_BY_KEY.high_severity,
  "hourly points": HELP_TEXT_BY_KEY.hourly_points,
  "latest ingest": HELP_TEXT_BY_KEY.latest_ingest,
  "last sync": HELP_TEXT_BY_KEY.last_sync,
  "live data streams": HELP_TEXT_BY_KEY.live_data_streams,
  "normalized": HELP_TEXT_BY_KEY.normalized,
  "normalized event": HELP_TEXT_BY_KEY.normalized_event,
  "peak gust": HELP_TEXT_BY_KEY.peak_gust,
  "peak index": HELP_TEXT_BY_KEY.peak_index,
  "peak rain": HELP_TEXT_BY_KEY.peak_rain,
  "peak wind": HELP_TEXT_BY_KEY.peak_wind,
  "pipeline": HELP_TEXT_BY_KEY.pipeline,
  "pollutant fields": HELP_TEXT_BY_KEY.pollutant_fields,
  "rain windows": HELP_TEXT_BY_KEY.rain_windows,
  "raw decoded": HELP_TEXT_BY_KEY.raw_decoded,
  "raw feed": HELP_TEXT_BY_KEY.raw_feed,
  "raw messages": HELP_TEXT_BY_KEY.raw_messages,
  "records": HELP_TEXT_BY_KEY.records_ingested,
  "below forecast average": HELP_TEXT_BY_KEY.relative_savings,
  "road events": HELP_TEXT_BY_KEY.road_disruptions,
  "weather risk": HELP_TEXT_BY_KEY.road_weather,
  "corridors": HELP_TEXT_BY_KEY.corridors,
  "route scoped": HELP_TEXT_BY_KEY.route_scoped,
  "score distribution": HELP_TEXT_BY_KEY.score_distribution,
  "score fields": HELP_TEXT_BY_KEY.score_fields,
  "selected event": HELP_TEXT_BY_KEY.selected_event,
  "severity mix": HELP_TEXT_BY_KEY.severity_mix,
  "signal level": HELP_TEXT_BY_KEY.signal_level,
  "source layers": HELP_TEXT_BY_KEY.source_layers,
  "source readiness": HELP_TEXT_BY_KEY.source_readiness,
  "source request": HELP_TEXT_BY_KEY.source_request,
  "source state": HELP_TEXT_BY_KEY.source_state,
  "source status": HELP_TEXT_BY_KEY.source_status,
  "event map geometry": HELP_TEXT_BY_KEY.event_map_geometry,
  "station geometry": HELP_TEXT_BY_KEY.station_geometry,
  "station ranking": HELP_TEXT_BY_KEY.station_ranking,
  "stop scoped": HELP_TEXT_BY_KEY.stop_scoped,
  "temperature range": HELP_TEXT_BY_KEY.temperature_range,
  "thermal range": HELP_TEXT_BY_KEY.thermal_range,
  "tracked fields": HELP_TEXT_BY_KEY.tracked_fields,
  "upcoming events": HELP_TEXT_BY_KEY.upcoming_events,
  "window state": HELP_TEXT_BY_KEY.window_state,
  "worst score": HELP_TEXT_BY_KEY.worst_score,
  "worst station": HELP_TEXT_BY_KEY.worst_station
};

function normalizeHelpKey(value: string | null | undefined): string | null {
  const key = value?.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  return key || null;
}

function normalizeHelpLabel(value: string | null | undefined): string | null {
  const label = value
    ?.trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ");

  return label || null;
}

export function dataHelpText({
  key,
  label,
  detail,
  t
}: DataHelpTextOptions): string | null {
  const normalizedKey = normalizeHelpKey(key);
  const normalizedLabel = normalizeHelpLabel(label);
  const helpText =
    (normalizedKey ? HELP_TEXT_BY_KEY[normalizedKey] : null) ??
    (normalizedLabel ? HELP_TEXT_BY_LABEL[normalizedLabel] : null) ??
    detail ??
    null;

  if (!helpText) {
    return null;
  }

  return t ? t(helpText) : helpText;
}

export function DataHelpIcon({ text }: DataHelpIconProps) {
  if (!text) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className="data-help-icon"
      data-tooltip={text}
      title={text}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        info
      </span>
    </span>
  );
}

export function DataLabelWithHelp({
  children,
  className,
  helpText
}: DataLabelWithHelpProps) {
  if (!helpText) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span className={["data-label-with-help", className].filter(Boolean).join(" ")}>
      <span>{children}</span>
      <DataHelpIcon text={helpText} />
    </span>
  );
}
