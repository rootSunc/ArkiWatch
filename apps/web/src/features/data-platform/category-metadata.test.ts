import { describe, expect, it } from "vitest";

import {
  categoryKeyDataItems,
  keyDataItemLabelKey,
  mergeKeyDataItems,
  toKeyDataItem
} from "./category-metadata";
import type { PlatformCategory, PlatformKeyDataItem } from "./types";

function category(key: string, keyDataItems?: PlatformKeyDataItem[]): PlatformCategory {
  return {
    key,
    title: key,
    description: `${key} description`,
    status: "connected",
    stage: "connected",
    priority: "P0",
    source_codes: [key],
    key_data_items: keyDataItems,
    summary_metrics: [],
    visualizations: [],
    events: [],
    sources: []
  };
}

describe("keyDataItemLabelKey", () => {
  it("leaves a single-word key unchanged", () => {
    expect(keyDataItemLabelKey("temperature")).toBe("temperature");
  });

  it("camel-cases a snake_case key", () => {
    expect(keyDataItemLabelKey("wind_gust")).toBe("windGust");
    expect(keyDataItemLabelKey("snow_water_equivalent")).toBe("snowWaterEquivalent");
  });
});

describe("categoryKeyDataItems", () => {
  it("prefers the category's own key_data_items when present", () => {
    const explicit = [toKeyDataItem("custom_field")];
    const items = categoryKeyDataItems(category("weather", explicit));

    expect(items).toEqual(explicit);
  });

  it("falls back to the static table by category key when empty", () => {
    const items = categoryKeyDataItems(category("air", []));

    expect(items.map((item) => item.key)).toEqual([
      "air_quality_index",
      "european_aqi",
      "pm2_5",
      "pm10",
      "no2",
      "station_location"
    ]);
    expect(items.every((item) => item.label_key.length > 0)).toBe(true);
  });

  it("returns an empty list for a category with no table entry and no own items", () => {
    expect(categoryKeyDataItems(category("not_a_real_category"))).toEqual([]);
  });
});

describe("mergeKeyDataItems", () => {
  it("dedupes items shared across categories, keeping first-seen order", () => {
    // "mobility" and "traffic" both list traffic_message, road_weather, and
    // train_status in the static table, so a real collision is exercised.
    const merged = mergeKeyDataItems([category("mobility", []), category("traffic", [])]);
    const keys = merged.map((item) => item.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      "service_alert",
      "traffic_message",
      "route_id",
      "stop_id",
      "road_weather",
      "train_status",
      "traffic_volume",
      "average_speed"
    ]);
  });
});
