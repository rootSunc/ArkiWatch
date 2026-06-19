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
  { value: "helsinki", label: "Helsinki" },
  { value: "espoo", label: "Espoo" },
  { value: "vantaa", label: "Vantaa" },
  { value: "tampere", label: "Tampere" },
  { value: "turku", label: "Turku" },
  { value: "oulu", label: "Oulu" }
];

export const CITY_COVERAGE_AREAS: Record<string, string> = {
  helsinki: "Helsinki / Uusimaa",
  espoo: "Espoo / Uusimaa",
  vantaa: "Vantaa / Uusimaa",
  tampere: "Tampere / Pirkanmaa",
  turku: "Turku / Southwest Finland",
  oulu: "Oulu / North Ostrobothnia",
};

/** Representative coordinates used for city-scoped data summaries and maps. */
export const CITY_COORDINATES: Record<string, CityCoordinates> = {
  helsinki: { latitude: 60.1699, longitude: 24.9384 },
  espoo: { latitude: 60.2055, longitude: 24.6559 },
  vantaa: { latitude: 60.2934, longitude: 25.0378 },
  tampere: { latitude: 61.4978, longitude: 23.761 },
  turku: { latitude: 60.4518, longitude: 22.2666 },
  oulu: { latitude: 65.0121, longitude: 25.4651 },
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
