import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  buildWeekdayLabels,
  DateScopeSelector,
  HistoricalWarningBanner,
  NotificationButton,
  RefreshErrorBanner,
  RefreshDataButton,
} from "./data-platform-shell";
import { I18nProvider } from "../i18n";
import type { PlatformHistoryAvailabilityDay } from "../types";

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
    const detail = screen.getByRole("alert").querySelector("small");
    expect(detail).toHaveTextContent("The refresh scheduler is not ready yet");
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

describe("RefreshDataButton", () => {
  it("exposes the in-progress refresh state to assistive technology", () => {
    render(
      <RefreshDataButton
        isRefreshing
        language="en"
        onRefresh={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Refresh data" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });
});

describe("NotificationButton", () => {
  it("includes the visible notification count in its accessible name", () => {
    render(
      <NotificationButton
        count={3}
        isActive={false}
        language="en"
        onClick={vi.fn()}
        tone="warn"
      />,
    );

    const button = screen.getByRole("button", { name: "Open recent events (3)" });
    expect(button.querySelector(".notification-badge")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("HistoricalWarningBanner", () => {
  it("formats the selected date for the active language", () => {
    const { rerender } = render(
      <HistoricalWarningBanner
        date="2026-08-08"
        language="zh"
        onReturnToLive={vi.fn()}
        timeScope={null}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("2026年8月8日");
    expect(screen.getByRole("alert")).not.toHaveTextContent("2026-08-08");

    rerender(
      <HistoricalWarningBanner
        date="2026-08-08"
        language="en"
        onReturnToLive={vi.fn()}
        timeScope={null}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("08 Aug 2026");
    expect(screen.getByRole("alert")).not.toHaveTextContent("2026-08-08");
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

  it("moves focus into the calendar and restores it after Escape", async () => {
    render(
      <DateScopeSelector
        date={null}
        isPending={false}
        language="en"
        onDateChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Selected date/ });
    fireEvent.click(trigger);

    const calendar = screen.getByRole("dialog");
    await waitFor(() => {
      const currentDate = calendar.querySelector<HTMLElement>(
        ".date-calendar-day[aria-current='date']",
      );
      expect(currentDate).toHaveFocus();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps focus inside the calendar when availability changes its month", async () => {
    const { rerender } = render(
      <DateScopeSelector
        availability={[]}
        date={null}
        isPending={false}
        language="en"
        onDateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Selected date/ }));

    rerender(
      <DateScopeSelector
        availability={[
          {
            date: "2026-08-08",
            has_data: true,
            record_count: 42,
            source_codes: ["fmi"],
            categories: ["weather"],
            datasets: ["demo_snapshot"],
          },
        ]}
        date={null}
        isPending={false}
        language="en"
        onDateChange={vi.fn()}
      />,
    );

    const calendar = screen.getByRole("dialog");
    await waitFor(() => {
      expect(calendar).toHaveTextContent("August 2026");
      expect(calendar.contains(document.activeElement)).toBe(true);
    });
  });

  it("keeps focus on the month button so a keyboard user can page twice", async () => {
    render(
      <DateScopeSelector
        availability={[]}
        date={null}
        isPending={false}
        language="en"
        onDateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Selected date/ }));

    const calendar = screen.getByRole("dialog");
    const previousMonth = screen.getByRole("button", { name: "Previous month" });
    await waitFor(() => expect(calendar.contains(document.activeElement)).toBe(true));

    const visibleMonth = calendar.querySelector("strong")?.textContent;
    previousMonth.focus();
    fireEvent.click(previousMonth);

    // Let the open-focus frame run before asserting, so a refocus triggered by
    // the month change would actually have taken effect by now.
    await waitFor(() =>
      expect(calendar.querySelector("strong")?.textContent).not.toBe(visibleMonth),
    );
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(previousMonth).toHaveFocus();
  });

  it("opens on the latest month with historical data", () => {
    const availability: PlatformHistoryAvailabilityDay[] = [
      {
        date: "2026-08-08",
        has_data: true,
        record_count: 42,
        source_codes: ["fmi"],
        categories: ["weather"],
        datasets: ["demo_snapshot"],
      },
    ];

    render(
      <DateScopeSelector
        availability={availability}
        date={null}
        isPending={false}
        language="en"
        onDateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Selected date/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent("August 2026");
  });

  it("announces when a historical calendar date has no data", () => {
    render(
      <DateScopeSelector
        availability={[
          {
            date: "2026-08-08",
            has_data: true,
            record_count: 42,
            source_codes: ["fmi"],
            categories: ["weather"],
            datasets: ["demo_snapshot"],
          },
        ]}
        date={null}
        isPending={false}
        language="en"
        onDateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Selected date/ }));

    expect(screen.getAllByRole("button", { name: /No historical data/ }).length).toBeGreaterThan(0);
  });

  it("bounds previous-month navigation by the earliest data day", () => {
    const availability: PlatformHistoryAvailabilityDay[] = [
      {
        date: "2026-09-05",
        has_data: false,
        record_count: 0,
        source_codes: [],
        categories: [],
        datasets: [],
      },
      {
        date: "2026-07-20",
        has_data: true,
        record_count: 12,
        source_codes: ["fmi"],
        categories: ["weather"],
        datasets: ["demo_snapshot"],
      },
      {
        date: "2026-08-08",
        has_data: true,
        record_count: 42,
        source_codes: ["fmi"],
        categories: ["weather"],
        datasets: ["demo_snapshot"],
      },
    ];

    render(
      <DateScopeSelector
        availability={availability}
        date={null}
        isPending={false}
        language="en"
        onDateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Selected date/ }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("July 2026");
  });

  it("reopens on the selected historical month", () => {
    const availability: PlatformHistoryAvailabilityDay[] = [
      {
        date: "2026-07-20",
        has_data: true,
        record_count: 12,
        source_codes: ["fmi"],
        categories: ["weather"],
        datasets: ["demo_snapshot"],
      },
      {
        date: "2026-08-08",
        has_data: true,
        record_count: 42,
        source_codes: ["fmi"],
        categories: ["weather"],
        datasets: ["demo_snapshot"],
      },
    ];

    render(
      <DateScopeSelector
        availability={availability}
        date="2026-07-20"
        isPending={false}
        language="en"
        onDateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Selected date/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent("July 2026");
    expect(
      screen.getByRole("button", { name: /20 Jul 2026: 12 records/ }),
    ).toHaveAttribute("aria-current", "date");
  });
});
