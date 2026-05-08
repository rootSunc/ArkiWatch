import { translateKeyDataItemLabel, type LanguageMode } from "./i18n";
import { PlatformCategory, PlatformKeyDataItem } from "./types";

const CATEGORY_KEY_DATA_ITEMS: Record<string, string[]> = {
  weather: [
    "temperature",
    "precipitation",
    "wind_speed",
    "wind_gust",
    "humidity",
    "weather_warning",
    "radar_nowcast",
    "validity_window"
  ],
  air: ["air_quality_index", "european_aqi", "pm2_5", "pm10", "no2", "station_location"],
  mobility: [
    "service_alert",
    "traffic_message",
    "route_id",
    "stop_id",
    "road_weather",
    "train_status"
  ],
  transit: ["route_id", "trip_id", "stop_id", "arrival_prediction", "service_alert"],
  energy: ["spot_price", "price_forecast", "consumption", "generation_forecast", "low_value_window"],
  traffic: ["traffic_message", "road_weather", "traffic_volume", "average_speed", "train_status"],
  water: ["water_level", "discharge", "groundwater", "snow_water_equivalent", "flood_warning"],
  city_services: [
    "service_location",
    "opening_hours",
    "temporary_closure",
    "accessibility"
  ],
  events: ["event_id", "event_time", "event_location", "keywords", "ticketing", "event_language"],
  geospatial: ["address", "building", "district", "parcel", "geometry"],
  regional_profile: ["population", "age_structure", "income", "employment", "health_indicator"]
};

export function keyDataItemLabelKey(key: string): string {
  const [head, ...tail] = key.split("_");
  return head + tail.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join("");
}

export function toKeyDataItem(key: string): PlatformKeyDataItem {
  return { key, label_key: keyDataItemLabelKey(key) };
}

export function keyDataItemKey(item: PlatformKeyDataItem | string): string {
  return typeof item === "string" ? item : item.key;
}

export function categoryKeyDataItems(category: PlatformCategory): PlatformKeyDataItem[] {
  if (category.key_data_items && category.key_data_items.length > 0) {
    return category.key_data_items;
  }

  return (CATEGORY_KEY_DATA_ITEMS[category.key] ?? []).map(toKeyDataItem);
}

export function categoryKeyDataItemKeys(category: PlatformCategory): string[] {
  return categoryKeyDataItems(category).map(keyDataItemKey);
}

export function mergeKeyDataItems(categories: PlatformCategory[]): PlatformKeyDataItem[] {
  const seen = new Set<string>();
  const items: PlatformKeyDataItem[] = [];

  for (const category of categories) {
    for (const item of categoryKeyDataItems(category)) {
      const key = keyDataItemKey(item);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push(item);
    }
  }

  return items;
}

export function keyDataItemLabel(
  language: LanguageMode,
  item: PlatformKeyDataItem | string,
): string {
  return translateKeyDataItemLabel(language, item);
}

/** @deprecated Use keyDataItemLabel with structured key_data_items instead. */
export function formatDataItemLabel(value: string): string {
  return value.replaceAll("_", " ");
}
