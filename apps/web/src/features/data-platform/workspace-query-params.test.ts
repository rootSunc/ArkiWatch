import { describe, expect, it } from "vitest";

import {
  defaultEnergyTabForScenario,
  resolveEnergyTabParam,
  resolveMobilityTabParam
} from "./workspace-query-params";

describe("workspace query parameter helpers", () => {
  it("keeps mobility tabs inside the supported set", () => {
    expect(resolveMobilityTabParam("traffic")).toBe("traffic");
    expect(resolveMobilityTabParam("rail")).toBe("transit");
    expect(resolveMobilityTabParam(null)).toBe("transit");
  });

  it("defaults scenario energy views to household pricing", () => {
    expect(resolveEnergyTabParam("fingrid")).toBe("fingrid");
    expect(resolveEnergyTabParam("market")).toBe("porssisahko");
    expect(defaultEnergyTabForScenario()).toBe("porssisahko");
  });
});
