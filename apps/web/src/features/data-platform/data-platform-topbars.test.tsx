import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "./i18n";
import { DataPlatformWorkspaceTopbar } from "./data-platform-topbars";

describe("DataPlatformWorkspaceTopbar", () => {
  it("opens the assistant without forwarding the click event as a question", () => {
    const onOpenAssistant = vi.fn();

    render(
      <I18nProvider language="en">
        <DataPlatformWorkspaceTopbar
          availability={[]}
          city="Helsinki"
          date={null}
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
          workspaceMode="data"
        />
      </I18nProvider>,
    );

    screen.getByRole("button", { name: "Open ArkiWatch assistant" }).click();

    expect(onOpenAssistant).toHaveBeenCalledOnce();
    expect(onOpenAssistant).toHaveBeenCalledWith();
  });
});
