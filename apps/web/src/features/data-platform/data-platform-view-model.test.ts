import { describe, expect, it } from "vitest";

import {
  buildMobilityCategory,
  eventMatchesSearch,
  matchesSearch,
  mergeMobilityCategories
} from "./data-platform-view-model";
import type { PlatformCategory, PlatformEvent } from "./types";

function category(key: string, events: PlatformEvent[] = []): PlatformCategory {
  return {
    key,
    title: key,
    description: `${key} description`,
    status: "connected",
    stage: "connected",
    priority: "P0",
    source_codes: [key],
    key_data_items: [key],
    summary_metrics: [
      {
        key: "source_status",
        label: "Source status",
        value: "Healthy",
        tone: "good",
        unit: null,
        detail: "healthy source",
        updated_at: null,
        source_codes: [key]
      }
    ],
    visualizations: [],
    events,
    sources: [
      {
        id: `${key}-source`,
        source_code: key,
        source_name: key,
        auth_type: "NONE",
        poll_interval_seconds: 300,
        operational_status: "healthy",
        stage: "connected",
        last_run_status: "succeeded",
        last_run_started_at: null,
        last_run_finished_at: null,
        records_ingested: 1,
        error_message: null
      }
    ]
  };
}

describe("data platform view model", () => {
  it("merges transit and traffic into a single mobility category", () => {
    const transit = category("transit");
    const traffic = category("traffic");
    const weather = category("weather");
    const mobility = buildMobilityCategory([weather, transit, traffic], null, null);

    expect(mobility?.key).toBe("mobility");
    expect(mobility?.source_codes).toEqual(["transit", "traffic"]);
    expect(mergeMobilityCategories([weather, transit, traffic], mobility).map((item) => item.key)).toEqual([
      "weather",
      "mobility"
    ]);
  });

  it("searches translated category and event content", () => {
    const event: PlatformEvent = {
      id: "rain",
      category_key: "weather",
      event_type: "rain_risk",
      title: "Rain risk",
      body: "Bring an umbrella",
      severity: "LOW",
      starts_at: "2026-05-31T09:00:00Z",
      ends_at: "2026-05-31T12:00:00Z",
      source_codes: ["fmi"],
      evidence: []
    };

    expect(matchesSearch(category("weather", [event]), "umbrella", "en")).toBe(true);
    expect(eventMatchesSearch(event, "rain", "en")).toBe(true);
  });
});
