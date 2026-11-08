import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "./i18n";
import type { AirQualityCurrentResponse, PlatformCategory, PlatformOverviewResponse, WeatherForecastResponse } from "./types";
import { WorkspaceConsole } from "./workspace-console";

const category = {
  key: "mobility",
  title: "Mobility",
  description: "",
  status: "connected",
  stage: "connected",
  priority: "P1",
  source_codes: ["digitransit"],
  summary_metrics: [],
  visualizations: [],
  events: [],
  sources: [{ source_code: "digitransit", source_name: "HSL", license_label: "HSL open data" }],
} as unknown as PlatformCategory;

const overview = {
  checked_at: "2026-08-13T09:30:00Z",
  timezone: "Europe/Helsinki",
  coverage_area: "Helsinki / Uusimaa",
  time_scope: {
    mode: "live",
    timezone: "Europe/Helsinki",
    reference_time: "2026-08-13T09:30:00Z",
  },
} as PlatformOverviewResponse;

describe("WorkspaceConsole", () => {
  it("keeps the chart and breakdown in the page and the specialist note inside inspection", () => {
    render(
      <I18nProvider language="en">
        <WorkspaceConsole
          airQuality={null}
          energy={null}
          highlightedEventId={null}
          history={{
            weather: [],
            airQuality: [],
            energy: [],
            householdEnergy: [],
            roadRail: [],
            transit: [],
          }}
          householdEnergy={null}
          onEnergyPanelChange={() => undefined}
          onMobilityTabChange={() => undefined}
          overview={overview}
          roadRail={null}
          roadRailCategory={null}
          route="mobility"
          selectedCategory={category}
          selectedEnergyTab="porssisahko"
          selectedMobilityTab="transit"
          transit={null}
          transitCategory={null}
          weather={null}
        >
          <p>Westbound tram alert</p>
        </WorkspaceConsole>
      </I18nProvider>,
    );

    const explanation = screen.getByText("Westbound tram alert");
    const inspection = screen.getByText("Detailed inspection").closest("details");
    expect(inspection).not.toHaveAttribute("open");
    expect(explanation.closest("details")).toBe(inspection);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Breakdown" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("table", { name: "Breakdown" }).closest("section")!).getByRole("button", { name: "Export CSV" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Mobility" })).toBeInTheDocument();
    expect(screen.getByText("Helsinki / Uusimaa · DIGITRANSIT observation")).toBeInTheDocument();
  });

  it("colors each air station from its own score", () => {
    render(
      <I18nProvider language="en">
        <WorkspaceConsole
          airQuality={{
            source_code: "hsy",
            observed_at: "2026-08-13T09:00:00Z",
            status: "ready",
            stations: [
              { station: "Kallio", score: 1 },
              { station: "Mannerheimintie", score: 4 },
            ],
          } as AirQualityCurrentResponse}
          energy={null}
          highlightedEventId={null}
          history={{
            weather: [],
            airQuality: [],
            energy: [],
            householdEnergy: [],
            roadRail: [],
            transit: [],
          }}
          householdEnergy={null}
          onEnergyPanelChange={() => undefined}
          onMobilityTabChange={() => undefined}
          overview={overview}
          roadRail={null}
          roadRailCategory={null}
          route="air"
          selectedCategory={{ ...category, key: "air", status: "healthy", source_codes: ["hsy"], sources: [{ source_code: "hsy", source_name: "HSY" }] } as PlatformCategory}
          selectedEnergyTab="porssisahko"
          selectedMobilityTab="transit"
          transit={null}
          transitCategory={null}
          weather={null}
        >
          <p>Specialist inspection</p>
        </WorkspaceConsole>
      </I18nProvider>,
    );

    expect(screen.getByText("Kallio").closest("tr")).toHaveAttribute("data-tone", "good");
    expect(screen.getByText("Mannerheimintie").closest("tr")).toHaveAttribute("data-tone", "warn");
  });

  it("puts feels-like beside the weather reading", () => {
    render(
      <I18nProvider language="en">
        <WorkspaceConsole
          airQuality={null}
          energy={null}
          highlightedEventId={null}
          history={{
            weather: [],
            airQuality: [],
            energy: [],
            householdEnergy: [],
            roadRail: [],
            transit: [],
          }}
          householdEnergy={null}
          onEnergyPanelChange={() => undefined}
          onMobilityTabChange={() => undefined}
          overview={overview}
          roadRail={null}
          roadRailCategory={null}
          route="weather"
          selectedCategory={{ ...category, key: "weather", source_codes: ["fmi"], sources: [{ source_code: "fmi", source_name: "FMI" }] } as PlatformCategory}
          selectedEnergyTab="porssisahko"
          selectedMobilityTab="transit"
          transit={null}
          transitCategory={null}
          weather={{
            source_code: "fmi",
            status: "ready",
            checked_at: "2026-08-13T09:30:00Z",
            points: [{
              timestamp: "2026-08-13T09:00:00Z",
              temperature_c: 16,
              wind_speed_ms: 3.4,
              wind_direction_deg: 200,
              wind_gust_ms: 6.2,
              assessment: { apparent_temperature_c: 15 },
            }],
          } as WeatherForecastResponse}
        >
          <p>Specialist inspection</p>
        </WorkspaceConsole>
      </I18nProvider>,
    );

    expect(screen.getByText("Feels Like")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("SSW · 6.2")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Time" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "12:00" })).toBeInTheDocument();
  });
});
