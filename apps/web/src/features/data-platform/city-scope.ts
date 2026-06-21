import { CITY_PACKS } from "./city-coverage";

export type CityScopeOption = {
  value: string;
  label: string;
};

export type CityCoordinates = {
  latitude: number;
  longitude: number;
};

export const CITY_STORAGE_KEY = "arkiwatch-city";
export const DEFAULT_CITY = "helsinki";

export const CITY_OPTIONS: CityScopeOption[] = [
  ...CITY_PACKS.map(({ value, label }) => ({ value, label })),
];

export const CITY_COVERAGE_AREAS: Record<string, string> = {
  ...Object.fromEntries(CITY_PACKS.map((pack) => [pack.value, `${pack.label} / ${pack.region}`])),
};

/** Representative coordinates used for city-scoped data summaries and maps. */
export const CITY_COORDINATES: Record<string, CityCoordinates> = {
  ...Object.fromEntries(
    CITY_PACKS.map((pack) => [pack.value, { latitude: pack.latitude, longitude: pack.longitude }]),
  ),
};

const CITY_SCOPED_CATEGORY_KEYS = new Set(["weather", "air", "transit", "water", "city_services", "events"]);

export function normalizeCityValue(value: string | null | undefined): string {
  const normalizedValue = (value ?? "").trim().toLowerCase().replaceAll(" ", "_");
  return CITY_OPTIONS.some((option) => option.value === normalizedValue) ? normalizedValue : DEFAULT_CITY;
}

export function cityLabel(value: string): string {
  return CITY_OPTIONS.find((option) => option.value === value)?.label ?? CITY_OPTIONS[0].label;
}

export function cityCoverageArea(value: string): string {
  return CITY_COVERAGE_AREAS[value] ?? cityLabel(value);
}

export function cityCoordinates(value: string | null | undefined): CityCoordinates {
  return CITY_COORDINATES[normalizeCityValue(value)] ?? CITY_COORDINATES[DEFAULT_CITY];
}

export function categorySupportsCityScope(categoryKey: string): boolean {
  return CITY_SCOPED_CATEGORY_KEYS.has(categoryKey);
}
