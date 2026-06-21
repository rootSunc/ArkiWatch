import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import type { ScenarioLiveSignals } from "../scenario-live-hints";
import type { PublicScenarioSectionRead } from "../types";
import { TodayActionCard } from "./today-action-card";

const signals: ScenarioLiveSignals = {
  weather: null,
  airQuality: null,
  transit: null,
  roadRail: null,
  householdEnergy: null,
  systemEnergy: null,
};

const section: PublicScenarioSectionRead = {
  key: "commute",
  title: "Keep a little buffer",
  description: "A transit alert may affect the westbound route.",
  status_label: "Watch",
  area_scope: "Helsinki",
  freshness_state: "fresh",
  valid_from: "2026-08-12T08:00:00Z",
  valid_to: "2026-08-12T11:00:00Z",
  evidence: ["transit"],
  source_codes: ["digitransit"],
  recommendation: {
    id: "commute-action",
    scenario_key: "commute",
    title: "Keep a little buffer",
    body: "A transit alert may affect the westbound route.",
    severity: "MEDIUM",
    area_scope: "Helsinki",
    freshness_state: "fresh",
    valid_from: "2026-08-12T08:00:00Z",
    valid_to: "2026-08-12T11:00:00Z",
    evidence: ["transit"],
  },
};

describe("TodayActionCard", () => {
  it("keeps the evidence route and assistant route distinct", () => {
    const onAskAssistant = vi.fn();
    const onOpen = vi.fn();

    render(
      <I18nProvider language="en">
        <TodayActionCard
          language="en"
          liveSignals={signals}
          onAskAssistant={onAskAssistant}
          onOpen={onOpen}
          section={section}
        />
      </I18nProvider>,
    );

    screen.getByRole("button", { name: /Commute.*No current recommendation/ }).click();
    screen.getByRole("button", { name: "Ask assistant about Commute" }).click();

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onAskAssistant).toHaveBeenCalledWith("Analyze Commute data");
  });
});
