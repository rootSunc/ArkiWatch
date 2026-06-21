import { describe, expect, it } from "vitest";

import {
  dashboardShellClassName,
  dashboardSideNavClassName,
} from "./data-platform-layout";

describe("data platform layout class names", () => {
  it("keeps workspace mode and hidden navigation explicit", () => {
    expect(dashboardShellClassName("today", true)).toBe(
      "dashboard-shell dashboard-shell-mode-today dashboard-shell-nav-hidden",
    );
    expect(dashboardShellClassName("data", false)).toBe(
      "dashboard-shell dashboard-shell-mode-data",
    );
  });

  it("composes detail and mobile navigation states", () => {
    expect(dashboardSideNavClassName(true, true, true)).toBe(
      "dashboard-side-nav detail-side-nav mobile-side-nav-open dashboard-side-nav-hidden",
    );
    expect(dashboardSideNavClassName(false, false, false)).toBe(
      "dashboard-side-nav",
    );
  });
});
