import { describe, expect, it } from "vitest";

import type {
  PlatformCategory,
  WeatherForecastPoint,
  WeatherForecastResponse,
} from "./types";
import {
  buildTimelineItems,
  compassDirection,
  conditionForPoint,
  forecastWindow,
  formatCompactTime,
  formatDegree,
  formatNumber,
  formatTimeZoneName,
  latestPoint,
  metricValue,
} from "./weather-detail-utils";
import { formatHistoryDate } from "./workspace-datetime";

describe("conditionForPoint", () => {
  const tKey = (key: string) => key;

  it("does not infer snow from a missing temperature", () => {
    const point = {
      timestamp: "2099-08-08T08:00:00Z",
      precipitation_mm: 0.5,
      temperature_c: null,
      cloud_cover_pct: null,
      wind_speed_ms: null,
      wind_gust_ms: null,
    } as WeatherForecastPoint;

    expect(conditionForPoint(point, tKey)).toEqual({
      icon: "rainy",
      label: "weather.rainLowCloud",
    });
  });

  it("does not invent a sky condition when weather fields are missing", () => {
    const point = {
      timestamp: "2099-08-08T08:00:00Z",
      precipitation_mm: null,
      temperature_c: null,
      cloud_cover_pct: null,
      wind_speed_ms: null,
      wind_gust_ms: null,
    } as WeatherForecastPoint;

    expect(conditionForPoint(point, tKey)).toEqual({
      icon: "cloud_sync",
      label: "weather.awaitingForecast",
    });
  });
});

describe("formatTimeZoneName", () => {
  it("uses daylight-saving time for Finnish summer timestamps", () => {
    expect(formatTimeZoneName("2026-08-09T12:00:00Z", "en")).toBe("EEST");
  });

  it("uses standard time for Finnish winter timestamps", () => {
    expect(formatTimeZoneName("2026-01-09T12:00:00Z", "en")).toBe("EET");
  });
});

describe("unavailable weather values", () => {
  it("uses a language-neutral placeholder instead of leaking n/a", () => {
    expect(formatNumber(null)).toBe("-");
    expect(formatDegree(undefined)).toBe("-");
    expect(formatCompactTime(null, "zh")).toBe("-");
    expect(formatCompactTime("not-a-timestamp", "zh")).toBe("-");
    expect(compassDirection(null)).toBe("-");
    expect(metricValue(null, "forecast_hours")).toBe("-");
  });
});

describe("localized weather history labels", () => {
  it("formats historical chart dates in the selected language", () => {
    expect(formatHistoryDate("2026-08-08", "en", "Europe/Helsinki")).toBe("08 Aug");
    expect(formatHistoryDate("2026-08-08", "zh", "Europe/Helsinki")).toBe("8月8日");
  });
});

describe("buildTimelineItems", () => {
  it("uses localized event copy when the weather workspace is Chinese", () => {
    const items = buildTimelineItems(
      null,
      {
        events: [
          {
            id: "rain-1",
            category_key: "weather",
            event_type: "rain_risk",
            title: "Brief rain may affect the late morning",
            title_zh: "上午晚些时候可能有短时降雨",
            body: "Keep a light shell handy.",
            body_zh: "随身准备轻便防雨外套。",
            severity: "MEDIUM",
            starts_at: "2099-08-08T08:00:00Z",
            ends_at: "2099-08-08T09:00:00Z",
            source_codes: ["fmi"],
            evidence: ["FMI"],
          },
        ],
      } as PlatformCategory,
      "zh",
      (key) => key,
    );

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "上午晚些时候可能有短时降雨",
          body: "随身准备轻便防雨外套。",
        }),
      ]),
    );
  });

  it("evaluates historical event state at the supplied snapshot reference", () => {
    const historicalWeather = {
      time_scope: {
        mode: "historical",
        date: "2099-08-08",
        timezone: "Europe/Helsinki",
        reference_time: "2099-08-08T08:30:00Z",
        window_start: "2099-08-07T21:00:00Z",
        window_end: "2099-08-08T21:00:00Z",
      },
      points: [],
      warnings: [],
      rain_windows: [],
    } as unknown as WeatherForecastResponse;
    const items = buildTimelineItems(
      historicalWeather,
      {
        events: [
          {
            id: "snapshot-rain",
            category_key: "weather",
            event_type: "rain_risk",
            title: "Morning rain",
            body: "Rain is affecting the morning.",
            severity: "MEDIUM",
            starts_at: "2099-08-08T08:00:00Z",
            ends_at: "2099-08-08T09:00:00Z",
            source_codes: ["fmi"],
            evidence: ["FMI"],
          },
        ],
      } as PlatformCategory,
      "en",
      (key) => key,
      null,
      "Europe/Helsinki",
      "2099-08-08T08:30:00Z",
    );

    expect(items[0]).toMatchObject({
      id: "snapshot-rain",
      active: true,
      state: "active",
      time: "weather.activeAtSnapshot",
    });
  });
});

describe("historical forecast point selection", () => {
  const points: WeatherForecastPoint[] = [
    { timestamp: "2099-08-08T08:00:00Z", temperature_c: 10 } as WeatherForecastPoint,
    { timestamp: "2099-08-08T12:00:00Z", temperature_c: 14 } as WeatherForecastPoint,
  ];

  it("does not use the browser clock to select a past snapshot point", () => {
    const referenceAt = "2099-08-08T20:00:00Z";
    expect(forecastWindow(points, 50, referenceAt)).toEqual(points);
    expect(latestPoint(points, referenceAt)?.timestamp).toBe("2099-08-08T12:00:00Z");
  });
});
