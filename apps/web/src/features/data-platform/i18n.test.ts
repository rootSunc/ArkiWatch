import { describe, expect, it } from "vitest";

import {
  translateDataLabel,
  translateEnumLabel,
  translateKeyDataItemLabel,
  translateMessageKey,
  translateMetricLabel,
  applyLanguageMode,
} from "./i18n";

describe("translateMessageKey", () => {
  it("resolves structured shell keys in zh", () => {
    expect(translateMessageKey("zh", "shell.navWeather")).toBe("天气");
    expect(translateMessageKey("zh", "shell.backToToday")).toBe("返回今日");
    expect(translateMessageKey("zh", "shell.stationNetwork")).toBe("监测站网络");
  });

  it("keeps the demo notice scoped without hard-coding a city", () => {
    expect(translateMessageKey("en", "shell.demoModeNotice")).toContain("{city}");
    expect(translateMessageKey("zh", "shell.demoModeNotice")).toContain("{city}");
    expect(translateMessageKey("en", "shell.demoModeNotice")).not.toContain("Helsinki");
    expect(translateMessageKey("zh", "shell.demoModeNotice")).not.toContain("赫尔辛基");
  });

  it("keeps keyboard navigation copy localized", () => {
    expect(translateMessageKey("en", "shell.skipToMainContent")).toBe("Skip to main content");
    expect(translateMessageKey("zh", "shell.skipToMainContent")).toBe("跳转到主要内容");
  });

  it("falls back to English when zh key is missing", () => {
    expect(translateMessageKey("zh", "shell.fakeMissingKey")).toBe("shell.fakeMissingKey");
  });

  it("keeps the road and rail workspace labels available in both languages", () => {
    expect(translateMessageKey("en", "roadRail.railEvents")).toBe("Rail events");
    expect(translateMessageKey("zh", "roadRail.railEvents")).toBe("铁路状况事件");
  });

  it("keeps demo-only assistant copy fully localized", () => {
    expect(translateMessageKey("zh", "assistant.demoMode")).toBe("演示模式 · 基于静态示例");
  });
});

describe("applyLanguageMode", () => {
  it("keeps the document language metadata aligned with the selected copy", () => {
    applyLanguageMode("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.documentElement.dataset.language).toBe("zh");

    applyLanguageMode("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dataset.language).toBe("en");
  });
});

describe("translateEnumLabel", () => {
  it("maps status tokens through shell aliases", () => {
    expect(translateEnumLabel("zh", "ready")).toBe("已就绪");
    expect(translateEnumLabel("en", "ready")).toBe("Ready");
  });

  it("localizes recommendation status labels", () => {
    expect(translateEnumLabel("zh", "needs_attention")).toBe("需要留意");
    expect(translateEnumLabel("zh", "good_window")).toBe("划算时段");
  });

  it("localizes transit alert enums", () => {
    expect(translateEnumLabel("en", "transit_delay")).toBe("transit delay");
    expect(translateEnumLabel("zh", "transit_delay")).toBe("公共交通延误");
    expect(translateEnumLabel("zh", "TRAFFIC_JAM")).toBe("交通拥堵");
    expect(translateEnumLabel("zh", "SIGNIFICANT_DELAYS")).toBe("明显延误");
    expect(translateEnumLabel("zh", "SLIPPERY_ROAD")).toBe("路面湿滑");
  });
});

describe("translateDataLabel", () => {
  it("resolves labels namespace from English metric text", () => {
    expect(translateDataLabel("zh", "Visibility")).toBe("能见度");
    expect(translateDataLabel("zh", "Road weather")).toBe("道路天气");
  });

  it("resolves labels namespace from snake_case field keys", () => {
    expect(translateDataLabel("zh", "visibility")).toBe("能见度");
  });

  it("maps category keys through shell nav aliases", () => {
    expect(translateDataLabel("zh", "city_services")).toBe("城市服务");
  });

  it("localizes dynamic coverage values without changing numeric values", () => {
    expect(translateDataLabel("zh", "Helsinki region")).toBe("赫尔辛基地区");
    expect(translateDataLabel("zh", "healthy")).toBe("运行正常");
    expect(translateDataLabel("zh", "98")).toBe("98");
  });

  it("translates workspace metric labels that are also used as data keys", () => {
    expect(translateMetricLabel("zh", { key: "source_status", label: "Source status" })).toBe(
      "来源状态",
    );
    expect(translateMetricLabel("zh", { key: "low_energy_window", label: "Low-energy window" })).toBe(
      "低能耗时段",
    );
  });
});

describe("translateKeyDataItemLabel", () => {
  it("resolves structured key_data_items via label_key", () => {
    expect(
      translateKeyDataItemLabel("zh", {
        key: "water_level",
        label_key: "waterLevel",
      }),
    ).toBe("水位");
  });
});

describe("translateMetricLabel", () => {
  it("prefers label_key over English label", () => {
    expect(
      translateMetricLabel("zh", {
        key: "visibility",
        label: "Visibility",
        label_key: "visibility",
      }),
    ).toBe("能见度");
  });

  it("derives label_key from metric key when omitted", () => {
    expect(
      translateMetricLabel("zh", {
        key: "pm2_5",
        label: "PM2.5",
      }),
    ).toBe("PM2.5");
  });

  it("keeps common public-data fields localized in the Chinese workspace", () => {
    expect(translateDataLabel("zh", "hydrology_station_catalog")).toBe("水文站点目录");
    expect(translateDataLabel("zh", "road_weather_sensor_history")).toBe("道路天气传感器历史");
    expect(translateDataLabel("zh", "transit_service_alerts")).toBe("公共交通服务提醒");
  });

  it("falls back to dataLabel when no structured label exists", () => {
    expect(
      translateMetricLabel("en", {
        key: "custom_metric",
        label: "Custom Metric",
      }),
    ).toBe("Custom Metric");
  });
});
