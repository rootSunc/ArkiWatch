import { describe, expect, it } from "vitest";

import { localizedContent } from "./content-localization";

describe("localizedContent", () => {
  it("uses optional simplified Chinese copy when the UI is Chinese", () => {
    expect(localizedContent("zh", "Leave a few minutes earlier", "提前几分钟出发")).toBe(
      "提前几分钟出发",
    );
  });

  it("keeps canonical copy for English and when a translation is unavailable", () => {
    expect(localizedContent("en", "Leave a few minutes earlier", "提前几分钟出发")).toBe(
      "Leave a few minutes earlier",
    );
    expect(localizedContent("zh", "Leave a few minutes earlier", "  ")).toBe(
      "Leave a few minutes earlier",
    );
  });
});
