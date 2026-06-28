import { describe, expect, it } from "vitest";

import { workspaceRouteForCategory } from "./data-platform-workspace-router";

describe("workspaceRouteForCategory", () => {
  it("maps detail categories to one explicit route key", () => {
    expect(workspaceRouteForCategory("weather")).toBe("weather");
    expect(workspaceRouteForCategory("events")).toBe("linked_events");
    expect(workspaceRouteForCategory("city_services")).toBe("city_services");
  });

  it("keeps overview and unknown categories out of the detail router", () => {
    expect(workspaceRouteForCategory("overview")).toBeNull();
    expect(workspaceRouteForCategory(null)).toBeNull();
    expect(workspaceRouteForCategory(undefined)).toBeNull();
  });
});
