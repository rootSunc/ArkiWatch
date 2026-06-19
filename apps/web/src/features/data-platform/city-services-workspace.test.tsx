import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CityServicesWorkspace } from "./city-services-workspace";
import { I18nProvider } from "./i18n";
import type { PlatformCategory } from "./types";

const pendingCategory: PlatformCategory = {
  key: "city_services",
  title: "City services",
  description: "Public service locations and opening information.",
  status: "pending",
  stage: "connected",
  priority: "P1",
  source_codes: ["servicemap"],
  key_data_items: [],
  summary_metrics: [
    {
      key: "records_ingested",
      label: "Latest ingest",
      label_key: "recordsIngested",
      value: "0",
      tone: "warn",
      unit: "records",
      detail: "Records from the latest collector run(s).",
      updated_at: null,
      source_codes: ["servicemap"],
    },
  ],
  visualizations: [],
  events: [],
  sources: [
    {
      id: "catalog-servicemap",
      source_code: "servicemap",
      source_name: "Helsinki Service Map",
      auth_type: "public",
      poll_interval_seconds: 600,
      operational_status: "pending",
      stage: "connected",
      categories: ["city_services"],
      datasets: ["service_units"],
      key_data_items: ["service_location"],
      data_structures: [],
      normalized_event_structures: [],
      license_label: "Open data",
      documentation_url: "https://www.hel.fi/",
      last_run_status: null,
      last_run_started_at: null,
      last_run_finished_at: null,
      records_ingested: null,
      error_message: null,
    },
  ],
};

describe("CityServicesWorkspace collection state", () => {
  it("does not render a null ingest count as zero records", () => {
    render(
      <I18nProvider language="en">
        <CityServicesWorkspace category={pendingCategory} />
      </I18nProvider>,
    );

    expect(screen.getAllByText("not collected").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 records")).not.toBeInTheDocument();
  });
});
