import { describe, expect, it } from "vitest";

import {
  assistantCitationDetail,
  assistantCitationSourceLabel,
  assistantCitationView,
} from "./assistant-citations";

describe("assistant citation presentation", () => {
  it("localizes known sources and maps them to a useful workspace", () => {
    expect(assistantCitationSourceLabel("weather", "zh")).toBe("天气");
    expect(assistantCitationView("weather")).toBe("weather");
    expect(assistantCitationView("transit")).toBe("mobility");
    expect(assistantCitationSourceLabel("Static demo fixture", "zh")).toBe("静态演示数据");
    expect(assistantCitationView("static demo fixture")).toBe("overview");
  });

  it("turns structured source details into readable localized evidence", () => {
    expect(
      assistantCitationDetail(
        "platform_overview",
        "platform_overview status=healthy, location=Helsinki region.",
        "zh",
      ),
    ).toBe("状态：运行正常 · 赫尔辛基地区");
    expect(assistantCitationDetail("weather", "weather data snapshot.", "zh")).toBe(
      "天气 数据快照",
    );
    expect(assistantCitationDetail("weather", "weather data snapshot.", "en")).toBe(
      "Weather data snapshot",
    );
  });

  it("keeps unknown provider details intact", () => {
    expect(
      assistantCitationDetail("custom_source", "Provider-specific evidence.", "zh"),
    ).toBe("Provider-specific evidence.");
    expect(assistantCitationView("custom_source")).toBeNull();
  });
});
