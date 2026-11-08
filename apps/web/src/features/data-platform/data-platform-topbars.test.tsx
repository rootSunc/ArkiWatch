import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "./i18n";
import {
  DataPlatformWorkspaceTopbar,
} from "./data-platform-topbars";

describe("DataPlatformWorkspaceTopbar", () => {
  it("opens the assistant without forwarding the click event as a question", () => {
    const onOpenAssistant = vi.fn();

    render(
      <I18nProvider language="en">
        <DataPlatformWorkspaceTopbar
          availability={[]}
          city="Helsinki"
          date={null}
          isDemo={false}
          isAuthenticated={false}
          isCityPending={false}
          isDatePending={false}
          isDetailPage={false}
          isEventsExpanded={false}
          isHistorical={false}
          isRefreshing={false}
          language="en"
          notificationCount={0}
          notificationTone="neutral"
          onToggleTheme={vi.fn()}
          onCityChange={vi.fn()}
          onDateChange={vi.fn()}
          onLanguageChange={vi.fn()}
          onNotificationsClick={vi.fn()}
          onOpenAssistant={onOpenAssistant}
          onRefresh={vi.fn()}
          onSearchChange={vi.fn()}
          onSelectNav={vi.fn()}
          renderAuthActionButton={() => null}
          restoreSideNavButton={null}
          searchValue=""
          selectedNavKey="overview"
          themeMode="light"
          workspaceMode="data"
        />
      </I18nProvider>,
    );

    screen.getByRole("button", { name: "Open ArkiWatch assistant" }).click();

    expect(onOpenAssistant).toHaveBeenCalledOnce();
    expect(onOpenAssistant).toHaveBeenCalledWith();
  });

  it("leaves preferences in the sidebar and keeps the scope and mode visible", () => {
    const onToggleTheme = vi.fn();

    render(
      <I18nProvider language="en">
        <DataPlatformWorkspaceTopbar
          availability={[]}
          city="Helsinki"
          date={null}
          isDemo={false}
          isAuthenticated={false}
          isCityPending={false}
          isDatePending={false}
          isDetailPage={false}
          isEventsExpanded={false}
          isHistorical={false}
          isRefreshing={false}
          language="en"
          notificationCount={0}
          notificationTone="neutral"
          onToggleTheme={onToggleTheme}
          onCityChange={vi.fn()}
          onDateChange={vi.fn()}
          onLanguageChange={vi.fn()}
          onNotificationsClick={vi.fn()}
          onRefresh={vi.fn()}
          onSelectNav={vi.fn()}
          renderAuthActionButton={() => null}
          restoreSideNavButton={null}
          selectedNavKey="overview"
          themeMode="light"
          workspaceMode="data"
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole("button", { name: "Switch to night theme" })).not.toBeInTheDocument();
    expect(screen.getByText("Live", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "City" })).toBeInTheDocument();
  });

  it("offers to change the city until one has been saved", () => {
    localStorage.clear();

    const { unmount } = render(
      <I18nProvider language="en">
        <DataPlatformWorkspaceTopbar
          availability={[]}
          city="Helsinki"
          date={null}
          isDemo={false}
          isAuthenticated={false}
          isCityPending={false}
          isDatePending={false}
          isDetailPage={false}
          isEventsExpanded={false}
          isHistorical={false}
          isRefreshing={false}
          language="en"
          notificationCount={0}
          notificationTone="neutral"
          onToggleTheme={vi.fn()}
          onCityChange={vi.fn()}
          onDateChange={vi.fn()}
          onLanguageChange={vi.fn()}
          onNotificationsClick={vi.fn()}
          onRefresh={vi.fn()}
          onSelectNav={vi.fn()}
          renderAuthActionButton={() => null}
          restoreSideNavButton={null}
          selectedNavKey="overview"
          themeMode="light"
          workspaceMode="data"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    unmount();
    localStorage.setItem("arkiwatch-city", "tampere");

    render(
      <I18nProvider language="en">
        <DataPlatformWorkspaceTopbar
          availability={[]}
          city="Tampere"
          date={null}
          isDemo={false}
          isAuthenticated={false}
          isCityPending={false}
          isDatePending={false}
          isDetailPage={false}
          isEventsExpanded={false}
          isHistorical={false}
          isRefreshing={false}
          language="en"
          notificationCount={0}
          notificationTone="neutral"
          onToggleTheme={vi.fn()}
          onCityChange={vi.fn()}
          onDateChange={vi.fn()}
          onLanguageChange={vi.fn()}
          onNotificationsClick={vi.fn()}
          onRefresh={vi.fn()}
          onSelectNav={vi.fn()}
          renderAuthActionButton={() => null}
          restoreSideNavButton={null}
          selectedNavKey="overview"
          themeMode="light"
          workspaceMode="data"
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
  });
});
