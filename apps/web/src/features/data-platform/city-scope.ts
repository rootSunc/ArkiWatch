export type CityScopeOption = {
  value: string;
  label: string;
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

const CITY_SCOPED_CATEGORY_KEYS = new Set(["weather", "air", "transit", "water", "city_services"]);

export function normalizeCityValue(value: string | null | undefined): string {
  const normalizedValue = (value ?? "").trim().toLowerCase().replaceAll(" ", "_");
  return CITY_OPTIONS.some((option) => option.value === normalizedValue) ? normalizedValue : DEFAULT_CITY;
}

export function cityLabel(value: string): string {
  return CITY_OPTIONS.find((option) => option.value === value)?.label ?? CITY_OPTIONS[0].label;
}

export function categorySupportsCityScope(categoryKey: string): boolean {
  return CITY_SCOPED_CATEGORY_KEYS.has(categoryKey);
}
