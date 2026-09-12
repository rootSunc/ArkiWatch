import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { demoFixtureForScope } from "./demo/demo-data";
import { GeospatialWorkspace } from "./geospatial-workspace";
import { I18nProvider } from "./i18n";
import { RegionalProfileWorkspace } from "./regional-profile-workspace";

const fixture = demoFixtureForScope();
const geospatial = fixture.overview.categories.find((category) => category.key === "geospatial") ?? null;
const regionalProfile = fixture.overview.categories.find((category) => category.key === "regional_profile") ?? null;

describe("catalog-only workspaces", () => {
  it("does not imply a connected provider for geospatial mapping", () => {
    render(
      <I18nProvider language="en">
        <GeospatialWorkspace category={geospatial} timeScope={fixture.overview.time_scope} />
      </I18nProvider>,
    );

    expect(screen.getByText("CATALOG ONLY")).toBeInTheDocument();
    expect(screen.getByText("No source connected")).toBeInTheDocument();
    expect(screen.queryByText("NLS documentation")).not.toBeInTheDocument();
    expect(screen.queryByText("CC BY 4.0")).not.toBeInTheDocument();
  });

  it("does not imply StatFi or Sotkanet feeds for regional mapping", () => {
    render(
      <I18nProvider language="en">
        <RegionalProfileWorkspace category={regionalProfile} timeScope={fixture.overview.time_scope} />
      </I18nProvider>,
    );

    expect(
      screen.getByText(
        "This workspace describes the planned data model; no provider feed is connected yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Empty means no connected indicator observations are available for this snapshot. On narrow screens, scroll horizontally to view all columns.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("StatFi")).not.toBeInTheDocument();
    expect(screen.queryByText("Sotkanet")).not.toBeInTheDocument();
    expect(screen.queryByText("CC BY 4.0")).not.toBeInTheDocument();
  });
});
