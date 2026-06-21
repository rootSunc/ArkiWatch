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

export const CITY_PACKS: readonly CityPack[] = [
  {
    value: "helsinki",
    label: "Helsinki",
    region: "Uusimaa",
    latitude: 60.1699,
    longitude: 24.9384,
    signals: { weather: "live", air: "live", transit: "live", water: "live", city_services: "live", events: "live" },
    recommendationScope: "regional",
  },
  {
    value: "espoo",
    label: "Espoo",
    region: "Uusimaa",
    latitude: 60.2055,
    longitude: 24.6559,
    signals: { weather: "live", air: "live", transit: "live", water: "live", city_services: "planned", events: "live" },
    recommendationScope: "regional",
  },
  {
    value: "vantaa",
    label: "Vantaa",
    region: "Uusimaa",
    latitude: 60.2934,
    longitude: 25.0378,
    signals: { weather: "live", air: "live", transit: "live", water: "live", city_services: "planned", events: "planned" },
    recommendationScope: "regional",
  },
  {
    value: "tampere",
    label: "Tampere",
    region: "Pirkanmaa",
    latitude: 61.4978,
    longitude: 23.761,
    signals: { weather: "live", air: "live", transit: "planned", water: "live", city_services: "planned", events: "planned" },
    recommendationScope: "regional-only",
  },
  {
    value: "turku",
    label: "Turku",
    region: "Southwest Finland",
    latitude: 60.4518,
    longitude: 22.2666,
    signals: { weather: "live", air: "live", transit: "planned", water: "live", city_services: "planned", events: "planned" },
    recommendationScope: "regional-only",
  },
  {
    value: "oulu",
    label: "Oulu",
    region: "North Ostrobothnia",
    latitude: 65.0121,
    longitude: 25.4651,
    signals: { weather: "live", air: "live", transit: "planned", water: "live", city_services: "planned", events: "planned" },
    recommendationScope: "regional-only",
  },
];

export function cityPackFor(value: string | null | undefined): CityPack {
  return CITY_PACKS.find((pack) => pack.value === value) ?? CITY_PACKS[0];
}
