import { describe, expect, it } from "vitest";

import { weatherSnapshotDetail, weatherSnapshotHeadline } from "./weather-snapshot-display";
import type { WeatherForecastResponse } from "./types";

const baseWeather: WeatherForecastResponse = {
  status: "ready",
  location: "helsinki",
  checked_at: "2026-05-31T09:00:00Z",
  generated_at: "2026-05-31T08:55:00Z",
  valid_from: "2026-05-31T09:00:00Z",
  valid_to: "2026-06-01T09:00:00Z",
  time_scope: null,
  source_code: "fmi",
  summary: null,
  points: [],
  rain_windows: [],
  metrics: [],
  warnings: [],
  source_layers: [],
  source_requests: [],
  data_pipeline: [],
  quality: {
    point_count: 0,
    forecast_hours: 0,
    field_coverage_pct: 0,
    missing_fields: [],
    rain_window_count: 0,
    notes: []
  }
};

describe("weather snapshot display", () => {
  it("prefers temperature range metrics for the headline", () => {
    const weather = {
      ...baseWeather,
      metrics: [{ key: "temperature_range", label: "Temperature", label_key: "temperatureRange", value: "3.0 to 7.0", unit: "C" }]
    };

    expect(weatherSnapshotHeadline(weather, "en")).toBe("3.0 to 7.0 °C");
  });

  it("summarizes warnings before secondary weather metrics", () => {
    const weather = {
      ...baseWeather,
      warnings: [
        {
          title: "Wind warning",
          description: "Wind warning",
          link: null,
          published_at: "2026-05-31T09:00:00Z",
          severity: "medium"
        }
      ]
    };

    expect(weatherSnapshotDetail(weather, "en")).toBe("1 warnings");
  });
});
