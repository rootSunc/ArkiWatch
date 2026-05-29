import { describe, expect, it } from "vitest";

import { viewerStateLabel } from "./viewer-state";

describe("viewerStateLabel", () => {
  it("distinguishes public live data from the isolated demo", () => {
    expect(viewerStateLabel(false, false, "en")).toBe("Public data view");
    expect(viewerStateLabel(false, true, "en")).toBe("Demo view");
    expect(viewerStateLabel(false, false, "zh")).toBe("公共数据浏览");
  });

  it("keeps the authenticated state distinct from both public modes", () => {
    expect(viewerStateLabel(true, false, "en")).toBe("Signed in");
    expect(viewerStateLabel(true, true, "en")).toBe("Signed in");
  });
});
