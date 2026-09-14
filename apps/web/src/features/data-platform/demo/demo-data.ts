import { cityCoverageArea, cityLabel, normalizeCityValue } from "../city-scope";
import { normalizeSourceDateValue } from "../time-window";
import type {
  AirQualityCurrentResponse,
  DashboardSource,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformEvent,
  PlatformHistoryApiResponse,
  PlatformHistoricalSnapshot,
  PlatformHistoryAvailabilityResponse,
  PlatformMetric,
  PlatformOverviewResponse,
  PlatformTimeScope,
  PublicActionRead,
  PublicDashboardRead,
  PublicScenarioSectionRead,
  PublicTimelineItemRead,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "../types";

export const DEMO_SNAPSHOT_DATE = "2026-08-08";
export const DEMO_CITY = "helsinki";
export const DEMO_SNAPSHOT_LABEL = "Static Helsinki snapshot";

const DEMO_CHECKED_AT = "2026-08-09T04:00:00.000Z";
const DEMO_TIMEZONE = "Europe/Helsinki";
const DEMO_SNAPSHOT_HOUR_UTC = 4;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const DEMO_TIME_SCOPED_CATEGORY_KEYS = new Set([
  "air",
  "city_services",
  "energy",
  "events",
  "traffic",
  "transit",
  "water",
  "weather",
]);

export type DemoFixture = {
  airQuality: AirQualityCurrentResponse;
  energy: EnergyCurrentResponse;
  householdEnergy: EnergyCurrentResponse;
  history: PlatformHistoryApiResponse;
  historyAvailability: PlatformHistoryAvailabilityResponse;
  overview: PlatformOverviewResponse;
  publicDashboard: PublicDashboardRead;
  roadRail: RoadRailCurrentResponse;
  transit: TransitCurrentResponse;
  weather: WeatherForecastResponse;
};

function at(hours: number): string {
  const timestamp = new Date(DEMO_CHECKED_AT);
  timestamp.setUTCHours(timestamp.getUTCHours() + hours);
  return timestamp.toISOString();
}

function timeScope(date: string | null): PlatformTimeScope {
  const scopeStart = date
    ? new Date(`${date}T00:00:00.000+03:00`)
    : new Date(DEMO_CHECKED_AT);
  const scopeEnd = new Date(scopeStart);
  scopeEnd.setUTCHours(scopeEnd.getUTCHours() + 18);

  return {
    mode: date ? "historical" : "live",
    is_demo: true,
    date,
    timezone: DEMO_TIMEZONE,
    reference_time: date ? scopeEnd.toISOString() : DEMO_CHECKED_AT,
    window_start: scopeStart.toISOString(),
    window_end: scopeEnd.toISOString(),
  };
}

function demoSnapshotShift(date: string | null): number {
  if (!date) {
    return 0;
  }

  const sourceTimestamp = Date.parse(DEMO_CHECKED_AT);
  const targetHour = String(DEMO_SNAPSHOT_HOUR_UTC).padStart(2, "0");
  const targetTimestamp = Date.parse(`${date}T${targetHour}:00:00.000Z`);
  return Number.isFinite(sourceTimestamp) && Number.isFinite(targetTimestamp)
    ? targetTimestamp - sourceTimestamp
    : 0;
}

function emptyDemoResponse<T extends { status: string }>(value: T, unavailable: boolean): T {
  return unavailable ? { ...value, status: "empty" } : value;
}

function scopedDemoCategory(
  category: PlatformCategory,
  unavailable: boolean,
): PlatformCategory {
  if (!unavailable || !DEMO_TIME_SCOPED_CATEGORY_KEYS.has(category.key)) {
    return category;
  }

  return {
    ...category,
    status: "empty",
    events: [],
    summary_metrics: [],
  };
}

function shiftDemoTimestamps<T>(value: T, shiftMs: number): T {
  if (shiftMs === 0) {
    return value;
  }

  if (typeof value === "string") {
    if (!ISO_TIMESTAMP_PATTERN.test(value)) {
      return value;
    }

    return new Date(Date.parse(value) + shiftMs).toISOString() as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => shiftDemoTimestamps(item, shiftMs)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shiftDemoTimestamps(item, shiftMs)]),
    ) as T;
  }

  return value;
}

function withHistoricalScope<T>(
  snapshots: PlatformHistoricalSnapshot<T>[],
  date: string | null,
): PlatformHistoricalSnapshot<T>[] {
  return snapshots.map((snapshot) => ({
    ...snapshot,
    data: snapshot.data ? withScope(snapshot.data, date) : snapshot.data,
  }));
}

function makeSource(
  sourceCode: string,
  sourceName: string,
  categories: string[],
  documentationUrl: string,
): DashboardSource {
  return {
    id: `demo-${sourceCode}`,
    source_code: sourceCode,
    source_name: sourceName,
    auth_type: "public",
    poll_interval_seconds: 600,
    operational_status: "healthy",
    stage: "connected",
    categories,
    datasets: [],
    key_data_items: [],
    license_label: "Public data · see provider terms",
    documentation_url: documentationUrl,
    last_run_status: "success",
    last_run_started_at: at(-1),
    last_run_finished_at: DEMO_CHECKED_AT,
    records_ingested: 42,
    error_message: null,
  };
}

const SOURCES: Record<string, DashboardSource> = {
  fmi: makeSource(
    "fmi",
    "Finnish Meteorological Institute",
    ["weather"],
    "https://en.ilmatieteenlaitos.fi/open-data",
  ),
  hsy: makeSource(
    "hsy",
    "Helsinki Region Environmental Services",
    ["air"],
    "https://www.hsy.fi/en/environmental-information/open-data/",
  ),
  digitransit: makeSource(
    "digitransit",
    "Digitransit / HSL",
    ["transit"],
    "https://digitransit.fi/en/developers/",
  ),
  digitraffic: makeSource(
    "digitraffic",
    "Digitraffic",
    ["traffic"],
    "https://www.digitraffic.fi/en/",
  ),
  fingrid: makeSource(
    "fingrid",
    "Fingrid",
    ["energy"],
    "https://data.fingrid.fi/en/",
  ),
  porssisahko: makeSource(
    "porssisahko",
    "Pörssisähkö API",
    ["energy"],
    "https://api.porssisahko.net/",
  ),
  syke: makeSource(
    "syke",
    "Finnish Environment Institute",
    ["water"],
    "https://www.syke.fi/en-US/Open_information",
  ),
  servicemap: makeSource(
    "servicemap",
    "Helsinki Service Map",
    ["city_services"],
    "https://www.hel.fi/palvelukarttaws/restpages/index_en.html",
  ),
  linkedevents: makeSource(
    "linkedevents",
    "Helsinki Linked Events",
    ["events"],
    "https://github.com/City-of-Helsinki/linkedevents",
  ),
};

function metric(
  key: string,
  label: string,
  value: string,
  tone: PlatformMetric["tone"],
  sourceCodes: string[],
  unit: string | null = null,
): PlatformMetric {
  return {
    key,
    label,
    label_key: key,
    value,
    tone,
    unit,
    detail: null,
    updated_at: DEMO_CHECKED_AT,
    source_codes: sourceCodes,
  };
}

function event(
  id: string,
  categoryKey: string,
  eventType: string,
  title: string,
  body: string,
  severity: string,
  sourceCodes: string[],
  startsAt: string,
  endsAt: string,
  attributes: Record<string, unknown> = {},
  localized: Pick<PlatformEvent, "title_zh" | "body_zh"> = {},
): PlatformEvent {
  return {
    id,
    category_key: categoryKey,
    event_type: eventType,
    title,
    title_zh: localized.title_zh,
    body,
    body_zh: localized.body_zh,
    severity,
    starts_at: startsAt,
    ends_at: endsAt,
    source_codes: sourceCodes,
    evidence: [sourceCodes.map((sourceCode) => sourceCode.toUpperCase()).join(" · ")],
    attributes,
  };
}

function category(
  key: string,
  title: string,
  description: string,
  sourceCodes: string[],
  events: PlatformEvent[] = [],
  metrics: PlatformMetric[] = [],
  stage: PlatformCategory["stage"] = "connected",
  statusOverride: string | null = null,
): PlatformCategory {
  return {
    key,
    title,
    description,
    status: statusOverride ?? (
      stage === "connected"
        ? events.some((item) => ["HIGH", "CRITICAL"].includes(item.severity))
          ? "watch"
          : "healthy"
        : stage
    ),
    stage,
    priority: key === "weather" || key === "air" ? "P0" : "P1",
    source_codes: sourceCodes,
    summary_metrics: metrics,
    visualizations: [],
    events,
    sources: sourceCodes.map((sourceCode) => SOURCES[sourceCode]).filter(Boolean),
  };
}

function action(
  id: string,
  scenarioKey: string,
  title: string,
  body: string,
  severity: string,
  validFrom: string,
  validTo: string,
  evidence: string[],
  localized: Pick<PublicActionRead, "title_zh" | "body_zh"> = {},
): PublicActionRead {
  return {
    id,
    scenario_key: scenarioKey,
    title,
    title_zh: localized.title_zh,
    body,
    body_zh: localized.body_zh,
    severity,
    area_scope: "Helsinki",
    freshness_state: "fresh",
    valid_from: validFrom,
    valid_to: validTo,
    evidence,
  };
}

function sourceRequest(key: string, label: string, endpoint: string) {
  return {
    key,
    label,
    status: "fetched",
    endpoint,
    content_type: "application/json",
    fetched_at: DEMO_CHECKED_AT,
  };
}

function dataStage(key: string, label: string, recordCount: number) {
  return {
    key,
    label,
    status: "ready",
    detail: "Static demo fixture",
    record_count: recordCount,
    updated_at: DEMO_CHECKED_AT,
  };
}

const RAIN_EVENT = event(
  "demo-rain-risk",
  "weather",
  "rain_risk",
  "Brief rain may affect the late morning",
  "A short rain window is likely around the late-morning commute. A light shell is enough.",
  "MEDIUM",
  ["fmi"],
  at(3),
  at(6),
  { peak_precip_mm: 1.8 },
  {
    title_zh: "短时降雨可能影响上午晚些时候的通勤",
    body_zh: "上午晚些时候可能有一阵短时降雨。随身带一件轻便防雨外套即可。",
  },
);

const AIR_EVENT = event(
  "demo-air-status",
  "air",
  "air_quality_status",
  "Air quality is suitable for normal outdoor activity",
  "Station readings are in the good range across the Helsinki example network.",
  "LOW",
  ["hsy"],
  at(-1),
  at(12),
  {},
  {
    title_zh: "空气质量适合正常户外活动",
    body_zh: "赫尔辛基示例网络中的监测站读数均处于良好范围。",
  },
);

const TRANSIT_EVENT = event(
  "demo-transit-delay",
  "transit",
  "transit_delay",
  "Allow a few extra minutes on the westbound tram",
  "A service alert may slow the westbound tram corridor during the morning peak.",
  "HIGH",
  ["digitransit"],
  at(1),
  at(4),
  { alert_id: "demo-alert-4", route_ids: ["4", "10"] },
  {
    title_zh: "乘坐西向有轨电车请预留几分钟",
    body_zh: "早高峰期间，西向有轨电车示例线路可能因服务提醒而减速。",
  },
);

const ROAD_EVENT = event(
  "demo-road-weather",
  "traffic",
  "road_weather_risk",
  "Road surfaces may be slippery after the rain window",
  "Keep a little extra distance if you are driving after the late-morning shower.",
  "MEDIUM",
  ["digitraffic"],
  at(5),
  at(8),
  {
    location_description: "Helsinki westbound approach",
    situation_id: "demo-road-1",
  },
  {
    title_zh: "降雨后路面可能湿滑",
    body_zh: "上午晚些时候阵雨过后驾车，请适当拉大跟车距离。",
  },
);

const ENERGY_EVENT = event(
  "demo-cheap-energy",
  "energy",
  "cheap_energy_window",
  "A lower-cost household energy window starts at noon",
  "The example price curve is most favourable between 12:00 and 14:00.",
  "LOW",
  ["porssisahko"],
  at(5),
  at(7),
  { average_value: 7.8, unit: "c/kWh" },
  {
    title_zh: "中午开始进入较低成本的家庭用电时段",
    body_zh: "示例价格曲线显示，12:00 至 14:00 最适合安排可灵活调整的用电。",
  },
);

function buildWeather(): WeatherForecastResponse {
  const points = Array.from({ length: 7 }, (_, index) => ({
    timestamp: at(index * 3),
    temperature_c: 16 + index,
    precipitation_mm: index === 1 ? 1.8 : index === 2 ? 0.6 : 0,
    wind_speed_ms: 3.4 + index * 0.2,
    wind_gust_ms: 6.2 + index * 0.3,
    wind_direction_deg: 210,
    cloud_cover_pct: index === 1 ? 78 : 46,
    humidity_pct: 72 - index * 2,
    dew_point_c: 11 + index * 0.4,
    pressure_hpa: 1011 + index,
    visibility_m: 12000,
    weather_symbol: index === 1 ? 9 : 2,
    smart_symbol: index === 1 ? 9 : 2,
  }));

  return {
    checked_at: DEMO_CHECKED_AT,
    time_scope: timeScope(null),
    status: "ready",
    location: "Helsinki",
    source_code: "fmi",
    generated_at: DEMO_CHECKED_AT,
    valid_from: DEMO_CHECKED_AT,
    valid_to: at(18),
    summary: "Mild and mostly clear, with a brief late-morning rain window.",
    metrics: [
      metric("temperature", "Temperature", "16", "good", ["fmi"], "C"),
      metric("wind", "Wind", "3.4", "good", ["fmi"], "m/s"),
      metric("precipitation", "Precipitation", "1.8", "warn", ["fmi"], "mm"),
      metric("humidity", "Humidity", "72", "good", ["fmi"], "%"),
    ],
    points,
    rain_windows: [
      {
        starts_at: at(3),
        ends_at: at(6),
        peak_precip_mm: 1.8,
        peak_precip_at: at(4),
        total_precip_mm: 2.4,
        hours: 3,
      },
    ],
    source_layers: [
      {
        key: "fmi_forecast",
        label: "FMI forecast",
        status: "ready",
        detail: "Static demo layer",
        updated_at: DEMO_CHECKED_AT,
      },
    ],
    source_requests: [
      sourceRequest("fmi", "Finnish Meteorological Institute", "https://opendata.fmi.fi"),
    ],
    data_pipeline: [
      dataStage("raw", "Raw observation", points.length),
      dataStage("normalized", "Normalized forecast", points.length),
    ],
    quality: {
      point_count: points.length,
      forecast_hours: 18,
      field_coverage_pct: 98,
      rain_window_count: 1,
      missing_fields: [],
      notes: ["Static demo fixture; not a live forecast."],
    },
    warnings: [],
  };
}

function buildAirQuality(): AirQualityCurrentResponse {
  return {
    checked_at: DEMO_CHECKED_AT,
    time_scope: timeScope(null),
    status: "ready",
    location: "Helsinki",
    source_code: "hsy",
    observed_at: DEMO_CHECKED_AT,
    valid_to: at(3),
    summary: "Good air quality across the example station network.",
    worst_station: "kallio",
    worst_label: "Good",
    worst_score: 1.2,
    metrics: [
      metric("european_aqi", "European AQI", "1.2", "good", ["hsy"]),
      metric("pm2_5", "PM2.5", "5.4", "good", ["hsy"], "µg/m³"),
      metric("pm10", "PM10", "9.8", "good", ["hsy"], "µg/m³"),
    ],
    stations: [
      {
        station: "kallio",
        label: "Kallio",
        score: 1.2,
        european_aqi: 1.2,
        pm2_5: 5.4,
        pm10: 9.8,
        no2: 18,
        lat: 60.184,
        lon: 24.95,
      },
      {
        station: "leppavaara",
        label: "Leppävaara",
        score: 0.8,
        european_aqi: 0.8,
        pm2_5: 3.9,
        pm10: 7.1,
        no2: 12,
        lat: 60.218,
        lon: 24.813,
      },
    ],
    source_requests: [
      sourceRequest("hsy", "HSY air quality", "https://kartta.hsy.fi/geoserver/ilmanlaatu/wfs"),
    ],
    data_pipeline: [dataStage("normalized", "Normalized station readings", 2)],
    quality: {
      station_count: 2,
      reporting_station_count: 2,
      field_coverage_pct: 100,
      missing_fields: [],
      notes: ["Static demo fixture; not a live station reading."],
    },
  };
}

function buildEnergy(sourceCode: string, providerName: string): EnergyCurrentResponse {
  const isHousehold = sourceCode === "porssisahko";
  const values = isHousehold ? [7.8, 8.1, 9.6, 12.2, 10.4, 8.5] : [890, 920, 980, 1050, 1010, 940];
  const unit = isHousehold ? "c/kWh" : "MW";
  const points = values.map((value, index) => ({
    starts_at: at(index * 2),
    ends_at: at(index * 2 + 2),
    value,
    unit,
    estimated_cost_eur: isHousehold ? Number((value * 0.02).toFixed(2)) : null,
  }));
  const currentWindow = {
    starts_at: at(5),
    ends_at: at(7),
    average_value: values[2],
    minimum_value: Math.min(...values),
    maximum_value: Math.max(...values),
    unit,
    point_count: 1,
    severity: "LOW",
    source: sourceCode,
    estimated_cost_eur: isHousehold ? 0.16 : null,
    usage_kwh: isHousehold ? 2 : null,
    threshold_value: isHousehold ? 9 : null,
    horizon_average_value: values.reduce((sum, value) => sum + value, 0) / values.length,
    savings_vs_average_pct: isHousehold ? 18 : null,
    selection_strategy: "demo-low-window",
  };

  return {
    checked_at: DEMO_CHECKED_AT,
    time_scope: timeScope(null),
    status: "ready",
    location: "Finland",
    source_code: sourceCode,
    provider_name: providerName,
    observed_at: DEMO_CHECKED_AT,
    valid_from: DEMO_CHECKED_AT,
    valid_to: at(12),
    summary: isHousehold
      ? "The example household price is lowest around noon."
      : "Grid load is moderate in the example morning window.",
    unit,
    current_window: currentWindow,
    metrics: [
      metric("low_energy_window", "Low-energy window", isHousehold ? "7.80" : "890", "good", [sourceCode], unit),
      metric("average", "Average", isHousehold ? "9.50" : "965", "neutral", [sourceCode], unit),
    ],
    points,
    source_requests: [
      sourceRequest(
        sourceCode,
        providerName,
        SOURCES[sourceCode]?.documentation_url ?? "https://data.fingrid.fi/en/",
      ),
    ],
    data_pipeline: [dataStage("normalized", "Normalized energy curve", points.length)],
    quality: {
      point_count: points.length,
      window_point_count: 1,
      field_coverage_pct: 100,
      minimum_value: Math.min(...values),
      maximum_value: Math.max(...values),
      average_value: values.reduce((sum, value) => sum + value, 0) / values.length,
      missing_fields: [],
      notes: ["Static demo fixture; not a live market or grid reading."],
    },
  };
}

function buildTransit(): TransitCurrentResponse {
  return {
    checked_at: DEMO_CHECKED_AT,
    time_scope: timeScope(null),
    status: "watch",
    location: "Helsinki",
    source_code: "digitransit",
    observed_at: DEMO_CHECKED_AT,
    summary: "One example service alert may affect the westbound tram corridor.",
    metrics: [metric("active_alerts", "Active alerts", "1", "warn", ["digitransit"])],
    alerts: [
      {
        id: "demo-alert-4",
        title: "Westbound tram service is slower",
        description: "Allow a few extra minutes during the morning peak.",
        severity: "HIGH",
        event_type: "transit_delay",
        starts_at: at(1),
        ends_at: at(4),
        active: true,
        cause: "TRAFFIC_JAM",
        effect: "SIGNIFICANT_DELAYS",
        route_ids: ["4", "10"],
        stop_ids: [],
        trip_ids: [],
      },
    ],
    source_requests: [
      sourceRequest("digitransit", "Digitransit alerts", "https://api.digitransit.fi"),
    ],
    data_pipeline: [dataStage("normalized", "Normalized transit alerts", 1)],
    quality: {
      raw_alert_count: 3,
      normalized_event_count: 1,
      active_alert_count: 1,
      route_alert_count: 1,
      stop_alert_count: 0,
      field_coverage_pct: 100,
      missing_fields: [],
      notes: ["Static demo fixture; not a live service alert."],
    },
  };
}

function buildRoadRail(): RoadRailCurrentResponse {
  return {
    checked_at: DEMO_CHECKED_AT,
    time_scope: timeScope(null),
    status: "watch",
    location: "Finland",
    source_code: "digitraffic",
    observed_at: DEMO_CHECKED_AT,
    summary: "One example road-weather event is worth allowing extra space for.",
    metrics: [metric("active_events", "Active events", "1", "warn", ["digitraffic"])],
    incidents: [
      {
        id: "demo-road-1",
        title: "Wet road surface risk",
        description: "Road surfaces may be slippery after the rain window.",
        severity: "MEDIUM",
        event_type: "road_weather_risk",
        starts_at: at(5),
        ends_at: at(8),
        active: true,
        location_ref: "helsinki-west",
        message_type: "WEATHER",
        situation_type: "SLIPPERY_ROAD",
        location_description: "Helsinki westbound approach",
        feature_names: ["Road weather"],
        geometry_bbox: null,
      },
    ],
    corridors: [
      {
        key: "helsinki-west",
        label: "Helsinki westbound",
        event_count: 1,
        active_event_count: 1,
        weather_risk_count: 1,
        severity: "MEDIUM",
        latest_title: "Wet road surface risk",
        latest_valid_to: at(8),
        geometry_bbox: null,
      },
    ],
    source_requests: [
      {
        ...sourceRequest("digitraffic", "Digitraffic road events", "https://tie.digitraffic.fi"),
        message_count: 2,
      },
    ],
    data_pipeline: [dataStage("normalized", "Normalized road events", 1)],
    quality: {
      raw_message_count: 2,
      normalized_event_count: 1,
      active_event_count: 1,
      road_event_count: 1,
      rail_event_count: 0,
      weather_risk_count: 1,
      corridor_count: 1,
      field_coverage_pct: 100,
      missing_fields: [],
      notes: ["Static demo fixture; not a live road event."],
    },
  };
}

function buildPublicDashboard(): PublicDashboardRead {
  const outdoorAction = action(
    "demo-action-outdoor",
    "outdoor",
    "Carry a light rain layer",
    "A short shower may cross the late-morning commute. Keep a light shell handy.",
    "MEDIUM",
    at(3),
    at(6),
    ["FMI · rain risk · 1.8 mm peak"],
    {
      title_zh: "带上一件轻便防雨外套",
      body_zh: "上午晚些时候可能有一阵短时阵雨，随身准备轻便外套即可。",
    },
  );
  const commuteAction = action(
    "demo-action-commute",
    "commute",
    "Leave a few minutes earlier",
    "The westbound tram example has a service alert during the morning peak.",
    "HIGH",
    at(1),
    at(4),
    ["Digitransit · routes 4 and 10"],
    {
      title_zh: "提前几分钟出发",
      body_zh: "西向有轨电车示例线路在早高峰期间有服务提醒，建议留出一些缓冲时间。",
    },
  );
  const airAction = action(
    "demo-action-air",
    "home_air",
    "Normal outdoor activity is fine",
    "Example station readings are in the good range. Ventilate when convenient.",
    "LOW",
    at(-1),
    at(12),
    ["HSY · two reporting stations"],
    {
      title_zh: "可以正常进行户外活动",
      body_zh: "示例监测站读数均处于良好范围，方便时开窗通风即可。",
    },
  );
  const energyAction = action(
    "demo-action-energy",
    "energy",
    "Run flexible appliances around noon",
    "The example household price window is most favourable between 12:00 and 14:00.",
    "LOW",
    at(5),
    at(7),
    ["Pörssisähkö · 7.80 c/kWh example window"],
    {
      title_zh: "中午安排可灵活调整的家务用电",
      body_zh: "示例家庭电价在 12:00 至 14:00 最有利，可将洗衣等用电安排在这段时间。",
    },
  );
  const sections: PublicScenarioSectionRead[] = [
    {
      key: "outdoor",
      title: "Outdoor",
      title_zh: "户外",
      description: "Weather timing for the next useful decision.",
      description_zh: "帮助你安排下一步出行的天气时段。",
      status_label: "Watch",
      status_label_zh: "留意",
      area_scope: "Helsinki",
      freshness_state: "fresh",
      valid_from: at(3),
      valid_to: at(6),
      evidence: outdoorAction.evidence,
      source_codes: ["fmi"],
      recommendation: outdoorAction,
    },
    {
      key: "commute",
      title: "Commute",
      title_zh: "通勤",
      description: "Transit and road signals that may change your route.",
      description_zh: "可能影响路线选择的公共交通和道路信号。",
      status_label: "Needs attention",
      status_label_zh: "需要留意",
      area_scope: "Helsinki",
      freshness_state: "fresh",
      valid_from: at(1),
      valid_to: at(4),
      evidence: commuteAction.evidence,
      source_codes: ["digitransit", "digitraffic"],
      recommendation: commuteAction,
    },
    {
      key: "home_air",
      title: "Home air",
      title_zh: "室内空气",
      description: "Outdoor air conditions for ventilation and activity.",
      description_zh: "帮助安排通风和户外活动的空气状况。",
      status_label: "Good",
      status_label_zh: "良好",
      area_scope: "Helsinki",
      freshness_state: "fresh",
      valid_from: at(-1),
      valid_to: at(12),
      evidence: airAction.evidence,
      source_codes: ["hsy"],
      recommendation: airAction,
    },
    {
      key: "energy",
      title: "Energy",
      title_zh: "能源",
      description: "A practical window for flexible household use.",
      description_zh: "适合安排可灵活调整家庭用电的时间段。",
      status_label: "Good window",
      status_label_zh: "合适时段",
      area_scope: "Finland",
      freshness_state: "fresh",
      valid_from: at(5),
      valid_to: at(7),
      evidence: energyAction.evidence,
      source_codes: ["porssisahko", "fingrid"],
      recommendation: energyAction,
    },
  ];
  const timeline: PublicTimelineItemRead[] = [
    {
      scenario_key: "commute",
      label: "Morning peak · westbound tram alert",
      label_zh: "早高峰 · 西向有轨电车提醒",
      severity: "HIGH",
      starts_at: at(1),
      ends_at: at(4),
    },
    {
      scenario_key: "outdoor",
      label: "Late morning · brief rain window",
      label_zh: "上午晚些时候 · 短时降雨",
      severity: "MEDIUM",
      starts_at: at(3),
      ends_at: at(6),
    },
    {
      scenario_key: "energy",
      label: "Noon · lower-cost household window",
      label_zh: "中午 · 较低成本家庭用电时段",
      severity: "LOW",
      starts_at: at(5),
      ends_at: at(7),
    },
  ];

  return {
    checked_at: DEMO_CHECKED_AT,
    snapshot_date: DEMO_SNAPSHOT_DATE,
    snapshot_available: true,
    app_name: "ArkiWatch",
    timezone: DEMO_TIMEZONE,
    coverage_area: "Helsinki / Uusimaa",
    top_actions: [commuteAction, outdoorAction, energyAction],
    scenario_channels: sections.map((section) => ({
      scenario_key: section.key,
      title: section.title,
      title_zh: section.title_zh,
      description: section.description,
      description_zh: section.description_zh,
    })),
    scenario_sections: sections,
    timeline,
    broadcasts: [airAction],
    sources: Object.values(SOURCES),
  };
}

function buildOverview(): PlatformOverviewResponse {
  const categories: PlatformCategory[] = [
    category("weather", "Weather", "Forecast and rain timing.", ["fmi"], [RAIN_EVENT], [
      metric("source_status", "Source status", "healthy", "good", ["fmi"]),
      metric("rain_window", "Rain windows", "1", "warn", ["fmi"]),
    ]),
    category("air", "Air quality", "Station-level outdoor air quality.", ["hsy"], [AIR_EVENT], [
      metric("source_status", "Source status", "healthy", "good", ["hsy"]),
      metric("european_aqi", "European AQI", "1.2", "good", ["hsy"]),
    ]),
    category("energy", "Energy", "Grid load and household price signals.", ["fingrid", "porssisahko"], [ENERGY_EVENT], [
      metric("source_status", "Source status", "healthy", "good", ["fingrid", "porssisahko"]),
      metric("low_energy_window", "Low-energy window", "7.80", "good", ["porssisahko"], "c/kWh"),
    ]),
    category("transit", "Transit", "Public transport service alerts.", ["digitransit"], [TRANSIT_EVENT], [
      metric("source_status", "Source status", "healthy", "good", ["digitransit"]),
      metric("active_events", "Active events", "1", "warn", ["digitransit"]),
    ]),
    category("traffic", "Road & Rail", "Road and rail operational events.", ["digitraffic"], [ROAD_EVENT], [
      metric("source_status", "Source status", "healthy", "good", ["digitraffic"]),
      metric("active_events", "Active events", "1", "warn", ["digitraffic"]),
    ]),
    category("water", "Water and snow", "Hydrology and seasonal conditions.", ["syke"], [], [
      metric("source_status", "Source status", "healthy", "good", ["syke"]),
      metric("coverage", "Coverage", "Helsinki region", "neutral", ["syke"]),
    ], "connected", "empty"),
    category("events", "Linked Events", "Public events and activities.", ["linkedevents"], [], [
      metric("source_status", "Source status", "healthy", "good", ["linkedevents"]),
      metric("active_events", "Upcoming events", "12", "good", ["linkedevents"]),
    ], "connected", "empty"),
    category("city_services", "City services", "Public service locations and opening information.", ["servicemap"], [], [
      metric("source_status", "Source status", "healthy", "good", ["servicemap"]),
      metric("service_units", "Service units", "24", "good", ["servicemap"]),
    ], "connected", "empty"),
    category("geospatial", "Geospatial base", "Location context for public signals.", [], [], [
      metric("catalog_stage", "Catalog stage", "background", "neutral", []),
    ], "background"),
    category("regional_profile", "Regional profile", "Regional coverage and context.", [], [], [
      metric("catalog_stage", "Catalog stage", "background", "neutral", []),
    ], "background"),
  ];
  const recentEvents = [RAIN_EVENT, TRANSIT_EVENT, ROAD_EVENT, ENERGY_EVENT, AIR_EVENT];

  return {
    checked_at: DEMO_CHECKED_AT,
    time_scope: timeScope(null),
    app_name: "ArkiWatch",
    timezone: DEMO_TIMEZONE,
    coverage_area: "Helsinki / Uusimaa",
    health_status: "healthy",
    categories,
    recent_events: recentEvents,
    sources: Object.values(SOURCES),
  };
}

function buildHistory(): PlatformHistoryApiResponse {
  const weather = buildWeather();
  const airQuality = buildAirQuality();
  const energy = buildEnergy("fingrid", "Fingrid");
  const householdEnergy = buildEnergy("porssisahko", "Pörssisähkö API");
  const roadRail = buildRoadRail();
  const transit = buildTransit();

  return {
    weather: [{ date: DEMO_SNAPSHOT_DATE, data: weather, error: null }],
    air_quality: [{ date: DEMO_SNAPSHOT_DATE, data: airQuality, error: null }],
    energy: [{ date: DEMO_SNAPSHOT_DATE, data: energy, error: null }],
    household_energy: [{ date: DEMO_SNAPSHOT_DATE, data: householdEnergy, error: null }],
    road_rail: [{ date: DEMO_SNAPSHOT_DATE, data: roadRail, error: null }],
    transit: [{ date: DEMO_SNAPSHOT_DATE, data: transit, error: null }],
  };
}

function buildHistoryAvailability(): PlatformHistoryAvailabilityResponse {
  return {
    checked_at: DEMO_CHECKED_AT,
    city: "helsinki",
    days: [
      {
        date: DEMO_SNAPSHOT_DATE,
        has_data: true,
        record_count: 42,
        source_codes: Object.keys(SOURCES),
        categories: ["weather", "air", "energy", "transit", "traffic"],
        datasets: ["demo_snapshot"],
      },
    ],
  };
}

const BASE_FIXTURE: DemoFixture = {
  airQuality: buildAirQuality(),
  energy: buildEnergy("fingrid", "Fingrid"),
  householdEnergy: buildEnergy("porssisahko", "Pörssisähkö API"),
  history: buildHistory(),
  historyAvailability: buildHistoryAvailability(),
  overview: buildOverview(),
  publicDashboard: buildPublicDashboard(),
  roadRail: buildRoadRail(),
  transit: buildTransit(),
  weather: buildWeather(),
};

function withScope<T>(value: T, date: string | null): T & { time_scope: PlatformTimeScope } {
  return { ...value, time_scope: timeScope(date) };
}

export function demoFixtureForScope(scope: {
  city?: string | null;
  date?: string | null;
} = {}): DemoFixture {
  const cityRef = normalizeCityValue(scope.city);
  const city = cityLabel(cityRef);
  const coverageArea = cityCoverageArea(cityRef);
  const date = normalizeSourceDateValue(scope.date);
  const scopeSuffix = date ? ` · ${date}` : "";
  const unavailableCityScope = cityRef !== DEMO_CITY;
  const unavailableHistoricalDate = date !== null && date !== DEMO_SNAPSHOT_DATE;
  const unavailableScopedData = unavailableCityScope || unavailableHistoricalDate;
  const scopedBaseFixture = shiftDemoTimestamps(BASE_FIXTURE, demoSnapshotShift(date));
  const scopedCategories = scopedBaseFixture.overview.categories.map((categoryItem) =>
    scopedDemoCategory(categoryItem, unavailableScopedData),
  );

  return {
    ...scopedBaseFixture,
    overview: {
      ...withScope(scopedBaseFixture.overview, date),
      coverage_area: `${coverageArea}${scopeSuffix}`,
      categories: scopedCategories,
      recent_events: unavailableScopedData ? [] : scopedBaseFixture.overview.recent_events,
      sources: scopedBaseFixture.overview.sources,
    },
    publicDashboard: {
      ...scopedBaseFixture.publicDashboard,
      coverage_area: `${scopedBaseFixture.publicDashboard.coverage_area}${scopeSuffix}`,
      snapshot_date: date ?? scopedBaseFixture.publicDashboard.snapshot_date,
      snapshot_available:
        !unavailableScopedData && (date === null || date === DEMO_SNAPSHOT_DATE),
      top_actions: unavailableScopedData ? [] : scopedBaseFixture.publicDashboard.top_actions,
      scenario_channels: unavailableScopedData
        ? []
        : scopedBaseFixture.publicDashboard.scenario_channels,
      scenario_sections: unavailableScopedData
        ? []
        : scopedBaseFixture.publicDashboard.scenario_sections,
      timeline: unavailableScopedData ? [] : scopedBaseFixture.publicDashboard.timeline,
      broadcasts: unavailableScopedData ? [] : scopedBaseFixture.publicDashboard.broadcasts,
    },
    weather: {
      ...withScope(emptyDemoResponse(scopedBaseFixture.weather, unavailableScopedData), date),
      location: city,
    },
    airQuality: {
      ...withScope(emptyDemoResponse(scopedBaseFixture.airQuality, unavailableScopedData), date),
      location: city,
    },
    energy: withScope(emptyDemoResponse(scopedBaseFixture.energy, unavailableScopedData), date),
    householdEnergy: withScope(
      emptyDemoResponse(scopedBaseFixture.householdEnergy, unavailableScopedData),
      date,
    ),
    roadRail: withScope(emptyDemoResponse(scopedBaseFixture.roadRail, unavailableScopedData), date),
    transit: {
      ...withScope(emptyDemoResponse(scopedBaseFixture.transit, unavailableScopedData), date),
      location: city,
    },
    history: {
      weather: unavailableScopedData
        ? []
        : withHistoricalScope(scopedBaseFixture.history.weather, date),
      air_quality: unavailableScopedData
        ? []
        : withHistoricalScope(scopedBaseFixture.history.air_quality, date),
      energy: unavailableScopedData
        ? []
        : withHistoricalScope(scopedBaseFixture.history.energy, date),
      household_energy: unavailableScopedData
        ? []
        : withHistoricalScope(scopedBaseFixture.history.household_energy, date),
      road_rail: unavailableScopedData
        ? []
        : withHistoricalScope(scopedBaseFixture.history.road_rail, date),
      transit: unavailableScopedData
        ? []
        : withHistoricalScope(scopedBaseFixture.history.transit, date),
    },
    historyAvailability: {
      ...scopedBaseFixture.historyAvailability,
      city: cityRef,
      days: unavailableCityScope ? [] : scopedBaseFixture.historyAvailability.days,
    },
  };
}
