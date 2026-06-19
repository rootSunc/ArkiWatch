import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  buildWeekdayLabels,
  DateScopeSelector,
  RefreshErrorBanner,
} from "./data-platform-shell";
import { I18nProvider } from "./i18n";

describe("RefreshErrorBanner", () => {
  it("explains the failed refresh and lets the user dismiss it", () => {
    const onDismiss = vi.fn();

    render(
      <I18nProvider language="en">
        <RefreshErrorBanner
          error="Platform refresh job is not configured on the scheduler"
          language="en"
          onDismiss={onDismiss}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Refresh failed");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The refresh scheduler is not ready yet",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Platform refresh job");

    screen.getByRole("button", { name: "Dismiss refresh error" }).click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("uses the selected language for the operational copy", () => {
    render(
      <I18nProvider language="zh">
        <RefreshErrorBanner
          error="刷新任务未配置"
          language="zh"
          onDismiss={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("刷新失败");
    expect(
      screen.getByRole("button", { name: "关闭刷新错误提示" }),
    ).toBeInTheDocument();
  });
});

describe("buildWeekdayLabels", () => {
  it("keeps the Monday-first order in English", () => {
    expect(buildWeekdayLabels("en")).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
  });

  it("uses localized narrow weekday labels in Chinese", () => {
    expect(buildWeekdayLabels("zh")).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
  });
});

describe("DateScopeSelector", () => {
  it("requests history availability when the calendar opens", () => {
    const onCalendarOpen = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <StrictMode>
        <DateScopeSelector
          date={null}
          isPending={false}
          language="en"
          onCalendarOpen={onCalendarOpen}
          onDateChange={vi.fn()}
        />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Selected date/ }));

    expect(onCalendarOpen).toHaveBeenCalledOnce();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("marks the active calendar date for assistive technology", () => {
    render(
      <DateScopeSelector
        date={null}
        isPending={false}
        language="en"
        onDateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Selected date/ }));

    expect(document.querySelectorAll(".date-calendar-day[aria-current='date']")).toHaveLength(1);
  });
});
