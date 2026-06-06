import { describe, expect, it } from "vitest";

import { dataHelpText } from "./data-help";

describe("dataHelpText", () => {
  it("resolves common domain help keys in both supported languages", () => {
    expect(dataHelpText({ key: "wind", language: "zh" })).toBe(
      "当前天气快照中观测到的持续风速。",
    );
    expect(dataHelpText({ key: "raw_alerts", language: "zh" })).toBe(
      "标准化前从源数据流接收到的原始提醒数量。",
    );
    expect(dataHelpText({ key: "wind", language: "en" })).toContain(
      "Sustained wind speed",
    );
  });

  it("falls back to caller detail when a future key is not catalogued", () => {
    expect(
      dataHelpText({
        key: "future_metric",
        detail: "A temporary explanation",
        language: "zh",
      }),
    ).toBe("A temporary explanation");
  });
});
