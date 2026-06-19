import { describe, expect, it } from "vitest";

import { buildCrossDomainTimeline } from "./cross-domain-timeline";

describe("buildCrossDomainTimeline", () => {
  it("carries localized event and scenario copy to the presentation layer", () => {
    const items = buildCrossDomainTimeline(
      [
        {
          id: "event-1",
          category_key: "transit",
          event_type: "alert",
          title: "Tram alert",
          title_zh: "有轨电车提醒",
          body: "Leave a little earlier.",
          body_zh: "提前一点出发。",
          severity: "HIGH",
          starts_at: "2099-08-09T08:00:00Z",
          ends_at: "2099-08-09T09:00:00Z",
          source_codes: ["digitransit"],
          evidence: ["DIGITRANSIT"],
        },
      ],
      {
        checked_at: "2099-08-09T07:00:00Z",
        app_name: "ArkiWatch",
        timezone: "Europe/Helsinki",
        coverage_area: "Helsinki/Uusimaa",
        top_actions: [],
        scenario_channels: [],
        scenario_sections: [
          {
            key: "outdoor",
            title: "Outdoor",
            description: "Weather timing.",
            description_zh: "天气时段。",
            status_label: "Watch",
            area_scope: "Helsinki",
            freshness_state: "fresh",
            valid_from: "2099-08-09T08:00:00Z",
            valid_to: "2099-08-09T09:00:00Z",
            evidence: ["FMI"],
            source_codes: ["fmi"],
            recommendation: {
              id: "outdoor-1",
              scenario_key: "outdoor",
              title: "Carry a layer",
              body: "Keep a layer handy.",
              severity: "MEDIUM",
              area_scope: "Helsinki",
              freshness_state: "fresh",
              valid_from: "2099-08-09T08:00:00Z",
              valid_to: "2099-08-09T09:00:00Z",
              evidence: ["FMI"],
            },
          },
        ],
        timeline: [
          {
            scenario_key: "outdoor",
            label: "Late morning rain",
            label_zh: "上午晚些时候降雨",
            severity: "MEDIUM",
            starts_at: "2099-08-09T08:00:00Z",
            ends_at: "2099-08-09T09:00:00Z",
          },
        ],
        broadcasts: [],
        sources: [],
      },
    );

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Tram alert",
          title_zh: "有轨电车提醒",
          detail_zh: "提前一点出发。",
        }),
        expect.objectContaining({
          title: "Late morning rain",
          title_zh: "上午晚些时候降雨",
          detail_zh: "天气时段。",
        }),
      ]),
    );
  });

  it("sorts active, upcoming, and ended items at the supplied snapshot boundary", () => {
    const referenceAt = "2099-08-09T12:00:00Z";
    const items = buildCrossDomainTimeline(
      [
        {
          id: "ended",
          category_key: "weather",
          event_type: "rain_risk",
          title: "Morning rain",
          body: "Rain has passed.",
          severity: "MEDIUM",
          starts_at: "2099-08-09T08:00:00Z",
          ends_at: "2099-08-09T09:00:00Z",
          source_codes: ["fmi"],
          evidence: [],
        },
        {
          id: "upcoming",
          category_key: "transit",
          event_type: "transit_delay",
          title: "Evening delay",
          body: "A delay is expected.",
          severity: "HIGH",
          starts_at: "2099-08-09T18:00:00Z",
          ends_at: "2099-08-09T19:00:00Z",
          source_codes: ["digitransit"],
          evidence: [],
        },
        {
          id: "active",
          category_key: "air",
          event_type: "air_quality_poor",
          title: "Poor air",
          body: "Air quality is poor.",
          severity: "HIGH",
          starts_at: "2099-08-09T11:00:00Z",
          ends_at: "2099-08-09T13:00:00Z",
          source_codes: ["hsy"],
          evidence: [],
        },
      ],
      null,
      10,
      referenceAt,
    );

    expect(items.map((item) => [item.id, item.state])).toEqual([
      ["event-active", "active"],
      ["event-upcoming", "upcoming"],
      ["event-ended", "ended"],
    ]);
  });
});
