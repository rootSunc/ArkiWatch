import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../i18n";
import { WorkspacePanelLoading } from "./workspace-panels";

describe("WorkspacePanelLoading", () => {
  it("keeps the transient workspace state in the page heading hierarchy", () => {
    render(
      <I18nProvider language="en">
        <WorkspacePanelLoading />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Loading data panel");
    expect(document.querySelectorAll(".workspace-panel-loading .platform-skeleton-block")).toHaveLength(8);
  });

  it("can preserve the requested workspace title while a panel is loading", () => {
    render(
      <I18nProvider language="en">
        <WorkspacePanelLoading titleKey="cityServices.dashboardTitle" />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("City services");
  });
});
