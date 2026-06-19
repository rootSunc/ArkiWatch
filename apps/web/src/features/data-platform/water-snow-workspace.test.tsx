import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "./i18n";
import type { PlatformCategory } from "./types";
import { WaterSnowWorkspace } from "./water-snow-workspace";

const pendingCatalogCategory: PlatformCategory = {
  key: "water",
  title: "Water and snow",
  description: "Hydrology and seasonal conditions.",
  status: "pending",
  stage: "connected",
  priority: "P1",
  source_codes: ["syke"],
  summary_metrics: [
    {
      key: "records_ingested",
      label: "Records ingested",
      label_key: "recordsIngested",
      value: "0",
      tone: "warn",
      unit: "records",
      detail: "Records from the latest collector run(s).",
      updated_at: null,
      source_codes: ["syke"],
    },
  ],
  visualizations: [],
  events: [],
  sources: [
    {
      id: "catalog-syke",
      source_code: "syke",
      source_name: "Finnish Environment Institute",
      auth_type: "public",
      poll_interval_seconds: 86400,
      operational_status: "pending",
      stage: "connected",
      categories: ["water"],
      datasets: ["hydrology"],
      key_data_items: ["water_level"],
      data_structures: [],
      normalized_event_structures: [],
      license_label: "Open data",
      documentation_url: "https://www.syke.fi/en-US/Open_information",
      last_run_status: null,
      last_run_started_at: null,
      last_run_finished_at: null,
      records_ingested: null,
      error_message: null,
    },
  ],
};

describe("WaterSnowWorkspace source state", () => {
  it("does not call a pending catalog source an active feed", () => {
    render(
      <I18nProvider language="en">
        <WaterSnowWorkspace category={pendingCatalogCategory} />
      </I18nProvider>,
    );

    expect(screen.getByText("Hydrology source mapped")).toBeInTheDocument();
    expect(screen.queryByText("Hydrology feed active")).not.toBeInTheDocument();
    expect(document.querySelector(".water-command-panel-warn")).toBeInTheDocument();
    expect(document.querySelector(".water-signal-list")?.textContent).toContain("not observed");
    expect(document.querySelector(".water-volume-panel")?.textContent).toContain("not observed");
  });
});
