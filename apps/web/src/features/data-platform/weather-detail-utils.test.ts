import { describe, expect, it } from "vitest";

import type { PlatformCategory } from "./types";
import { buildTimelineItems, formatTimeZoneName } from "./weather-detail-utils";

describe("formatTimeZoneName", () => {
  it("uses daylight-saving time for Finnish summer timestamps", () => {
    expect(formatTimeZoneName("2026-08-09T12:00:00Z", "en")).toBe("EEST");
  });

  it("uses standard time for Finnish winter timestamps", () => {
    expect(formatTimeZoneName("2026-01-09T12:00:00Z", "en")).toBe("EET");
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
});
