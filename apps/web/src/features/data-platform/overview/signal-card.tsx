import { formatReadingDelta, labeledCompactAge } from "@/features/shared/format";
import { UNAVAILABLE_DATA_VALUE } from "../model/data-value";
import { categorySignalAttribution } from "./signal-attribution";
import { MetricTile } from "@/features/shared/ui/console";
import { signalTrend, weatherReferencePoint } from "./console-model";
import { categorySupportsCityScope, cityLabel } from "../model/city-scope";
import { sourcesViewHref } from "../shell/data-platform-nav-utils";
import {
  displayTitle,
  signalReadout,
  statusLabel,
} from "../model/data-platform-view-model";
import { translateMessageKey, type LanguageMode } from "../i18n";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformHistoryResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "../types";

type SignalCardProps = {
  airQuality: AirQualityCurrentResponse | null;
  category: PlatformCategory;
  energy: EnergyCurrentResponse | null;
  householdEnergy: EnergyCurrentResponse | null;
  history?: PlatformHistoryResponse;
  language: LanguageMode;
  onSelect: () => void;
  onAsk?: (question: string) => void;
  date?: string | null;
  platformTimezone?: string;
  regionalScopeLabel: string;
  roadRail: RoadRailCurrentResponse | null;
  selectedCity: string;
  transit: TransitCurrentResponse | null;
  weather: WeatherForecastResponse | null;
};

export function SignalCard({
  airQuality,
  category,
  energy,
  householdEnergy,
  history,
  language,
  onSelect,
  onAsk,
  date = null,
  platformTimezone,
  regionalScopeLabel,
  roadRail,
  selectedCity,
  transit,
  weather,
}: SignalCardProps) {
  const readout = signalReadout(
    category,
    weather,
    airQuality,
    energy,
    householdEnergy,
    roadRail,
    transit,
    language,
    platformTimezone,
  );
  const provider = categorySignalAttribution(
    category,
    weather,
    airQuality,
    energy,
    householdEnergy,
    roadRail,
    transit,
  ).sources;
  // A card with no provider codes shows the scope alone. Printing the
  // unavailable placeholder here would put a bare glyph in the footer without
  // saying anything the empty slot does not already say.
  const hasProvider = Boolean(provider) && provider !== UNAVAILABLE_DATA_VALUE;
  const followsSelectedCity = categorySupportsCityScope(category.key);

  const attribution = categorySignalAttribution(
    category,
    weather,
    airQuality,
    energy,
    householdEnergy,
    roadRail,
    transit,
  );
  const primarySource =
    category.sources.find(
      (source) => source.source_code.toUpperCase() === provider,
    ) ?? category.sources[0];
  const points = signalTrend(
    category,
    { weather, airQuality, energy, householdEnergy, history },
    language,
    platformTimezone ?? "Europe/Helsinki",
  );
  const first = points[0]?.value,
    last = points.at(-1)?.value;
  const delta =
    points.length >= 3 && first != null && last != null
      ? formatReadingDelta(first, last, category.key === "weather" ? "°" : null)
      : undefined;
  const invalid = ["stale", "failed", "error"].includes(category.status);
  const failingSource =
    category.sources.find((source) =>
      ["failed", "failing", "stale", "degraded"].includes(source.operational_status),
    ) ?? category.sources[0];
  const invalidValue = labeledCompactAge(
    statusLabel(category, language),
    failingSource?.last_successful_run_at ??
      failingSource?.last_run_finished_at ??
      attribution.updatedAt,
  );
  return (
    <MetricTile
      label={displayTitle(category, language)}
      value={invalid ? invalidValue : readout.value}
      trend={points.map((p) => p.value)}
      trendLabel={translateMessageKey(
        language,
        ["air", "mobility"].includes(category.key)
          ? "shell.availableHistory"
          : category.key === "weather"
            ? "shell.forecast24h"
            : "shell.trend24h",
      )}
      delta={invalid ? undefined : delta}
      tone={
        invalid ? (category.status === "stale" ? "warn" : "bad") : readout.tone
      }
      status={statusLabel(category, language)}
      onSelect={onSelect}
      onAsk={
        onAsk
          ? () =>
              onAsk(
                `${displayTitle(category, language)}: ${invalid ? statusLabel(category, language) : readout.value}`,
              )
          : undefined
      }
      source={hasProvider ? provider : undefined}
      evidence={{
        provider,
        station: followsSelectedCity
          ? cityLabel(selectedCity)
          : regionalScopeLabel,
        observedAt: attribution.updatedAt,
        validAt:
          category.key === "weather"
            ? weatherReferencePoint(weather)?.timestamp
            : null,
        licence: (category.key === "energy" && primarySource
          ? [primarySource]
          : category.sources
        )
          .map((source) =>
            source.license_label
              ? `${source.source_code}: ${source.license_label}`
              : null,
          )
          .filter(Boolean)
          .join("; "),
        method: null,
        href: sourcesViewHref({
          city: selectedCity,
          date,
          source: primarySource?.source_code,
        }),
      }}
    />
  );
}
