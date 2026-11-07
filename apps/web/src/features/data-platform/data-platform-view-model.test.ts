import { describe, expect, it } from "vitest";

import { toKeyDataItem } from "./category-metadata";
import {
  buildMobilityCategory,
  displayTitle,
  eventAttributeRows,
  eventMatchesSearch,
  eventTimeLabel,
  eventTypeLabel,
  formatAttributeValue,
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
      title_zh: "降雨提醒",
      body: "Bring an umbrella",
      body_zh: "带上雨伞",
      severity: "LOW",
      starts_at: "2026-05-31T09:00:00Z",
      ends_at: "2026-05-31T12:00:00Z",
      source_codes: ["fmi"],
      evidence: []
    };

    expect(matchesSearch(category("weather", [event]), "umbrella", "en")).toBe(true);
    expect(eventMatchesSearch(event, "rain", "en")).toBe(true);
    expect(matchesSearch(category("weather", [event]), "雨伞", "zh")).toBe(true);
    expect(eventMatchesSearch(event, "降雨", "zh")).toBe(true);
    expect(matchesSearch(category("weather"), "来源状态", "zh")).toBe(true);
  });

  it("resolves category titles from shell nav keys", () => {
    expect(displayTitle(category("events"), "zh")).toBe("事件");
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
      null,
      "en"
    );

    expect(statusLabel(emptyWeather, "en")).toBe("Empty");
    expect(statusLabel(emptyWeather, "zh")).toBe("无数据");
    expect(readout.tone).toBe("neutral");
    expect("progress" in readout).toBe(false);
  });

  it("localizes an unavailable source record count on catalog cards", () => {
    const catalogCategory: PlatformCategory = {
      ...category("geospatial"),
      status: "background",
      stage: "background",
      summary_metrics: [
        {
          key: "records_ingested",
          label: "Latest ingest",
          label_key: "recordsIngested",
          value: "n/a",
          tone: "neutral",
          unit: "records",
          detail: "Records from the latest collector run(s).",
          updated_at: null,
          source_codes: ["geospatial"],
        },
      ],
    };

    const readout = signalReadout(catalogCategory, null, null, null, null, null, null, "en");

    expect(readout.value).toBe("not collected");
  });

  it("uses household price semantics when both energy feeds are available", () => {
    const energyCategory = {
      ...category("energy"),
      summary_metrics: [],
    };
    const systemEnergy = {
      status: "ready",
      current_window: { average_value: 980, unit: "MW" },
    } as never;
    const householdEnergy = {
      status: "ready",
      current_window: { average_value: 7.8, unit: "c/kWh" },
    } as never;

    const readout = signalReadout(
      energyCategory,
      null,
      null,
      systemEnergy,
      householdEnergy,
      null,
      null,
      "zh",
    );

    expect(readout.label).toBe("最佳电价");
    expect(readout.value).toBe("7.80 c/kWh");
  });

  it("labels a system-only energy card as grid load", () => {
    const readout = signalReadout(
      { ...category("energy"), summary_metrics: [] },
      null,
      null,
      {
        status: "ready",
        current_window: { average_value: 980, unit: "MW" },
      } as never,
      null,
      null,
      null,
      "en",
    );

    expect(readout.label).toBe("Current grid load");
    expect(readout.value).toBe("980.00 MW");
  });

  it("keeps the merged mobility category empty when both sources are empty", () => {
    const transit = { ...category("transit"), status: "empty" };
    const traffic = { ...category("traffic"), status: "empty" };
    const mobility = buildMobilityCategory(
      [transit, traffic],
      { status: "empty", quality: { active_alert_count: 4 } } as never,
      { status: "empty", quality: { active_event_count: 3 } } as never,
    );

    expect(mobility?.status).toBe("empty");
    expect(mobility?.summary_metrics).toEqual([]);
    expect(mobility?.events).toEqual([]);
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

  it("localizes event attribute values and event types", () => {
    expect(formatAttributeValue(true, "zh")).toBe("是");
    expect(formatAttributeValue(false, "zh")).toBe("否");
    expect(formatAttributeValue([{ value: "ok" }], "zh")).toContain("1 条记录");
    expect(eventTypeLabel("rain_risk", "zh")).toBe("降雨风险");
    expect(eventTypeLabel(null, "zh")).toBe("缺失");
    expect(formatAttributeValue({ route_ids: ["4", "10"] }, "zh")).toBe("线路 ID: 4, 10");

    const rows = eventAttributeRows(
      {
        id: "event",
        category_key: "weather",
        event_type: "rain_risk",
        title: "Rain risk",
        body: "A short shower is expected.",
        severity: "LOW",
        starts_at: "2026-08-09T05:00:00Z",
        ends_at: "2026-08-09T08:00:00Z",
        source_codes: ["fmi"],
        evidence: [],
        attributes: { event_location: "Helsinki", confirmed: true },
      },
      "zh",
    );

    expect(rows).toEqual([
      { label: "活动地点", value: "Helsinki" },
      { label: "已确认", value: "是" },
    ]);
  });
});
