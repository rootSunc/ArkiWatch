import coverage from "./generated/coverage.json";

export type CitySignalKey = "weather" | "air" | "transit" | "water" | "city_services" | "events";
export type CitySignalAvailability = "live" | "regional" | "planned";

export type CityPack = {
  value: string;
  label: string;
  region: string;
  latitude: number;
  longitude: number;
  signals: Record<CitySignalKey, CitySignalAvailability>;
  recommendationScope: "regional" | "regional-only";
};

// Generated from Go for SSR and offline Demo; never maintain a second catalog.
export const CITY_PACKS: readonly CityPack[] = coverage.cities.map((city) => ({
  value: city.city_ref,
  label: city.label,
  region: city.region,
  latitude: city.latitude,
  longitude: city.longitude,
  signals: city.signals as CityPack["signals"],
  recommendationScope: city.recommendation_scope as CityPack["recommendationScope"],
}));

export function cityPackFor(value: string | null | undefined): CityPack {
  return CITY_PACKS.find((pack) => pack.value === value) ?? CITY_PACKS[0];
}
