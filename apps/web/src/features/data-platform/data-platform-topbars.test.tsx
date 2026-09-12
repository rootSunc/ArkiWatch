import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "./i18n";
import {
  DataPlatformDesktopHeader,
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

  it("keeps the theme switch available in the desktop scope controls", () => {
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

    screen.getByRole("button", { name: "Switch to night theme" }).click();
    expect(onToggleTheme).toHaveBeenCalledOnce();
  });
});

describe("DataPlatformDesktopHeader", () => {
  it("returns focus to the search field after clearing a query", () => {
    render(
      <I18nProvider language="en">
        <DataPlatformDesktopHeader
          availability={[]}
          city="Helsinki"
          date={null}
          isDemo={false}
          isAuthenticated={false}
          isCityPending={false}
          isDatePending={false}
          isEventsExpanded={false}
          isHistorical={false}
          isRefreshing={false}
          language="en"
          notificationCount={0}
          notificationTone="neutral"
          onCalendarOpen={vi.fn()}
          onCityChange={vi.fn()}
          onDateChange={vi.fn()}
          onLanguageChange={vi.fn()}
          onNotificationsClick={vi.fn()}
          onRefresh={vi.fn()}
          onSearchChange={vi.fn()}
          onToggleTheme={vi.fn()}
          renderAuthActionButton={() => null}
          restoreSideNavButton={null}
          searchValue="weather"
          selectedCategory={null}
          selectedNavKey="overview"
          showExport={false}
          themeMode="light"
        />
      </I18nProvider>,
    );

    const input = screen.getByRole("textbox", { name: "Search signals, events..." });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input).toHaveFocus();
  });
});
