import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CrossDomainTimelineItem } from "../cross-domain-timeline";
import { I18nProvider } from "../i18n";
import type { PlatformEvent } from "../types";
import { DayPlanTimeline } from "./day-plan-timeline";

const item: CrossDomainTimelineItem = {
  id: "tram",
  kind: "event",
  title: "Leave a few minutes earlier",
  detail: "The westbound tram is slower.",
  severity: "HIGH",
  startsAt: "2026-08-09T05:00:00Z",
  endsAt: "2026-08-09T08:00:00Z",
  categoryKey: "transit",
  state: "active",
  event: { source_codes: ["digitransit"] } as PlatformEvent,
};

describe("DayPlanTimeline", () => {
  it("shows the provider with the plan item", () => {
    render(
      <I18nProvider language="en">
        <DayPlanTimeline items={[item]} language="en" timezone="Europe/Helsinki" />
      </I18nProvider>,
    );

    expect(screen.getByText("DIGITRANSIT")).toBeInTheDocument();
    expect(screen.getByText("The westbound tram is slower.")).toBeInTheDocument();
  });
});
