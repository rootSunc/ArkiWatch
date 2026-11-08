import { DEMO_CITY, DEMO_SNAPSHOT_DATE } from "./constants";
import rawFixture from "./raw-fixture.json";
import generatedDetails from "../generated/details.json";
import rawEnergyCosts from "../generated/energy-costs.json";
import generatedDecisions from "../generated/briefings.json";
import type { BriefingDecision } from "../types";
import { cityCoverageArea, cityLabel, normalizeCityValue } from "../model/city-scope";
import { normalizeSourceDateValue } from "../model/time-window";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformHistoryApiResponse,
  PlatformHistoricalSnapshot,
  PlatformHistoryAvailabilityResponse,
  PlatformOverviewResponse,
  PlatformTimeScope,
  PublicDashboardRead,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "../types";

const generatedEnergyCosts = rawEnergyCosts as Record<"energy" | "householdEnergy", Partial<EnergyCurrentResponse["quality"]>>;

export { DEMO_CITY, DEMO_SNAPSHOT_DATE } from "./constants";
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

const BASE_FIXTURE = rawFixture as DemoFixture;

function withScope<T>(value: T, date: string | null): T & { time_scope: PlatformTimeScope } {
  return { ...value, time_scope: timeScope(date) };
}

export function rawDemoFixtureForScope(scope: {
  city?: string | null;
  date?: string | null;
} = {}): DemoFixture {
  const cityRef = normalizeCityValue(scope.city);
  const city = cityLabel(cityRef);
  const coverageArea = cityCoverageArea(cityRef);
  const date = normalizeSourceDateValue(scope.date);
  const scopeSuffix = date ? `, ${date}` : "";
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
      warnings: unavailableScopedData ? [] : scopedBaseFixture.weather.warnings,
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

// Generated Go decisions are shifted with the fixture's timestamps. Selecting a
// fixture is presentation plumbing; no business rules run in the browser.
type DemoDetailPatch = Pick<DemoFixture, "history"> & {
  [K in "weather" | "airQuality" | "transit" | "roadRail" | "overview"]: Partial<DemoFixture[K]>;
};

function withEnergyCosts(data: EnergyCurrentResponse, source: "energy" | "householdEnergy"): EnergyCurrentResponse {
  return { ...data, quality: { ...data.quality, ...generatedEnergyCosts[source] } };
}

function withHistoryCosts(snapshots: PlatformHistoricalSnapshot<EnergyCurrentResponse>[], source: "energy" | "householdEnergy") {
  return snapshots.map((snapshot) => ({
    ...snapshot,
    data: snapshot.data ? withEnergyCosts(snapshot.data, source) : null,
  }));
}

export function demoFixtureForScope(scope: { city?: string | null; date?: string | null } = {}): DemoFixture {
  const fixture = rawDemoFixtureForScope(scope);
  const city = normalizeCityValue(scope.city);
  const date = normalizeSourceDateValue(scope.date);
  const kind = date === null ? "live" : date === DEMO_SNAPSHOT_DATE ? "historical" : "missing";
  const key = `${city}:${kind}` as keyof typeof generatedDecisions;
  const baseDate = kind === "missing" ? "2026-08-07" : kind === "historical" ? DEMO_SNAPSHOT_DATE : null;
  const shift = demoSnapshotShift(date) - demoSnapshotShift(baseDate);
  const details = shiftDemoTimestamps(generatedDetails[key], shift) as unknown as DemoDetailPatch;
  const decision = shiftDemoTimestamps(generatedDecisions[key], shift) as BriefingDecision;
  return {
    ...fixture,
    weather: { ...fixture.weather, ...details.weather },
    airQuality: { ...fixture.airQuality, ...details.airQuality },
    transit: { ...fixture.transit, ...details.transit },
    roadRail: { ...fixture.roadRail, ...details.roadRail },
    overview: { ...fixture.overview, ...details.overview },
    energy: withEnergyCosts(fixture.energy, "energy"),
    householdEnergy: withEnergyCosts(fixture.householdEnergy, "householdEnergy"),
    history: {
      ...details.history,
      energy: withHistoryCosts(details.history.energy, "energy"),
      household_energy: withHistoryCosts(details.history.household_energy, "householdEnergy"),
    },
    publicDashboard: {
      ...fixture.publicDashboard,
      decision,
      signals: {
        weather: { ...fixture.weather, ...details.weather },
        airQuality: { ...fixture.airQuality, ...details.airQuality },
        transit: { ...fixture.transit, ...details.transit },
        roadRail: { ...fixture.roadRail, ...details.roadRail },
        energy: withEnergyCosts(fixture.energy, "energy"),
        householdEnergy: withEnergyCosts(fixture.householdEnergy, "householdEnergy"),
      },
    },
  };
}
