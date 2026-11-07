import { UNAVAILABLE_DATA_VALUE } from "./data-value";
import { categorySignalAttribution } from "./signal-attribution";
import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { categorySupportsCityScope, cityLabel } from "./city-scope";
import { CATEGORY_ICONS } from "./data-platform-nav-utils";
import {
  displayTitle,
  signalReadout,
  statusLabel,
} from "./data-platform-view-model";
import type { LanguageMode } from "./i18n";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "./types";

type SignalCardProps = {
  airQuality: AirQualityCurrentResponse | null;
  category: PlatformCategory;
  energy: EnergyCurrentResponse | null;
  householdEnergy: EnergyCurrentResponse | null;
  language: LanguageMode;
  onSelect: () => void;
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
  language,
  onSelect,
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

  return (
    <button
      className={`signal-card signal-card-${readout.tone}`}
      data-category={category.key}
      onClick={onSelect}
      type="button"
    >
      <span className="signal-card-top">
        <span className="material-symbols-outlined" aria-hidden="true">
          {CATEGORY_ICONS[category.key] ?? "database"}
        </span>
        <strong className="signal-card-title">{displayTitle(category, language)}</strong>
        <span className={`signal-card-status signal-card-status-${readout.tone}`}>
          {statusLabel(category, language)}
        </span>
      </span>

      <span className="signal-readout">
        <DataLabelWithHelp
          helpText={dataHelpText({
            key: readout.helpKey,
            label: readout.label,
            language,
          })}
        >
          {readout.label}
        </DataLabelWithHelp>
        <strong>{readout.value}</strong>
      </span>

      <span className="signal-card-footer">
        <span className="material-symbols-outlined" aria-hidden="true">
          {followsSelectedCity ? "location_on" : "public"}
        </span>
        <span className="signal-card-scope">
          {followsSelectedCity ? cityLabel(selectedCity) : regionalScopeLabel}
        </span>
        <span className="signal-card-footer-spacer" />
        {hasProvider ? (
          <span className="signal-card-provider" title={provider}>
            {provider}
          </span>
        ) : null}
        <span className="material-symbols-outlined signal-card-arrow" aria-hidden="true">
          chevron_right
        </span>
      </span>
    </button>
  );
}
