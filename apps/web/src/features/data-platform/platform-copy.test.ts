import { describe, expect, it } from "vitest";

import { localizedPlatformCopy } from "./platform-copy";

describe("localizedPlatformCopy", () => {
  it("localizes known platform descriptions", () => {
    expect(localizedPlatformCopy("Hydrology and seasonal conditions.", "zh")).toBe("水文与季节性状况。");
    expect(localizedPlatformCopy("The example household price is lowest around noon.", "zh")).toBe(
      "示例家庭电价在中午左右最低。",
    );
    expect(localizedPlatformCopy("Westbound tram service is slower", "zh")).toBe("西向有轨电车运行较慢");
    expect(localizedPlatformCopy("Static demo fixture", "zh")).toBe("静态演示数据");
    expect(localizedPlatformCopy("FMI (Finnish Meteorological Institute)", "zh")).toBe("FMI（芬兰气象研究所）");
  });

  it("preserves unknown upstream copy", () => {
    expect(localizedPlatformCopy("Unknown upstream description", "zh")).toBe("Unknown upstream description");
    expect(localizedPlatformCopy(null, "zh")).toBeNull();
  });
});
