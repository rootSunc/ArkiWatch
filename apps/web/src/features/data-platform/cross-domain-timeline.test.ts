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
});
