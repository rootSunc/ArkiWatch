import { describe, expect, it } from "vitest";

import { toKeyDataItem } from "./category-metadata";
import {
  buildMobilityCategory,
  displayTitle,
  eventMatchesSearch,
  eventTimeLabel,
  matchesSearch,
  mergeMobilityCategories,
  recentEventLabel,
  signalReadout,
  statusLabel
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
    key_data_items: [toKeyDataItem(key)],
    summary_metrics: [
      {
        key: "source_status",
        label: "Source status",
        label_key: "sourceStatus",
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

  it("resolves category titles from shell nav keys", () => {
    expect(displayTitle(category("events"), "zh")).toBe("关联活动");
    expect(displayTitle(category("energy"), "en")).toBe("Energy");
  });

  it("presents an empty category as unavailable rather than healthy", () => {
    const emptyWeather = { ...category("weather"), status: "empty" };
    const readout = signalReadout(
      emptyWeather,
      null,
      null,
      null,
      null,
      null,
      "en"
    );

    expect(statusLabel(emptyWeather, "en")).toBe("Empty");
    expect(statusLabel(emptyWeather, "zh")).toBe("无数据");
    expect(readout.tone).toBe("neutral");
    expect("progress" in readout).toBe(false);
  });

  it("evaluates event status and time labels against the snapshot context", () => {
    const event: PlatformEvent = {
      id: "snapshot-event",
      category_key: "weather",
      event_type: "rain_risk",
      title: "Rain risk",
      body: "A short shower is expected.",
      severity: "MEDIUM",
      starts_at: "2026-08-09T05:00:00Z",
      ends_at: "2026-08-09T08:00:00Z",
      source_codes: ["fmi"],
      evidence: [],
    };

    expect(
      eventTimeLabel(
        [category("weather")],
        event,
        "en",
        "2026-08-09T06:00:00Z",
        "Europe/Helsinki",
      ),
    ).toContain("Ongoing until 09 Aug, 11:00");
  });

  it("labels the event panel count as recent rather than active", () => {
    expect(recentEventLabel(2, "en")).toBe("2 recent events");
    expect(recentEventLabel(1, "zh")).toBe("1 最近事件");
  });
});
