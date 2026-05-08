import { describe, expect, it } from "vitest";

import {
  translateDataLabel,
  translateEnumLabel,
  translateKeyDataItemLabel,
  translateMessageKey,
  translateMetricLabel,
} from "./i18n";

describe("translateMessageKey", () => {
  it("resolves structured shell keys in zh", () => {
    expect(translateMessageKey("zh", "shell.navWeather")).toBe("天气");
  });

  it("falls back to English when zh key is missing", () => {
    expect(translateMessageKey("zh", "shell.fakeMissingKey")).toBe("shell.fakeMissingKey");
  });
});

describe("translateEnumLabel", () => {
  it("maps status tokens through shell aliases", () => {
    expect(translateEnumLabel("zh", "ready")).toBe("已就绪");
    expect(translateEnumLabel("en", "ready")).toBe("Ready");
  });
});

describe("translateDataLabel", () => {
  it("resolves labels namespace from English metric text", () => {
    expect(translateDataLabel("zh", "Visibility")).toBe("能见度");
  });

  it("resolves labels namespace from snake_case field keys", () => {
    expect(translateDataLabel("zh", "visibility")).toBe("能见度");
  });

  it("maps category keys through shell nav aliases", () => {
    expect(translateDataLabel("zh", "city_services")).toBe("城市服务");
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
    ).toBe("pm2 5");
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
