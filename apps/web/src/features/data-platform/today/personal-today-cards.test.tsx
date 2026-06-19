import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import type { PersonalDashboardRead } from "../personal-dashboard";
import { PersonalTodayCards } from "./personal-today-cards";

const dashboard: Pick<PersonalDashboardRead, "timezone" | "today"> = {
  timezone: "Europe/Helsinki",
  today: {
    date: "2026-08-11",
    location: "Espoo",
    notifications: [],
    cards: [
      {
        type: "COMMUTE",
        title: "Leave a little earlier",
        summary: "Transit alerts may slow the westbound route.",
        severity: "HIGH",
        valid_to: "2026-08-11T09:00:00+03:00",
      },
    ],
  },
};

describe("PersonalTodayCards", () => {
  it("surfaces personalized cards and connects them to the assistant", () => {
    const onOpenAssistant = vi.fn();

    render(
      <I18nProvider language="en">
        <PersonalTodayCards
          dashboard={dashboard}
          language="en"
          onOpenAssistant={onOpenAssistant}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("region", { name: "For you today" })).toBeInTheDocument();
    expect(screen.getByText("Leave a little earlier")).toBeInTheDocument();
    expect(screen.getByText(/Valid until/)).toBeInTheDocument();
    expect(document.querySelector(".today-personal-recommendations-action .assistant-glyph")).toBeInTheDocument();

    screen.getByRole("button", { name: "Ask about these recommendations" }).click();
    expect(onOpenAssistant).toHaveBeenCalledWith(
      "Explain my personal recommendations for today and tell me what I should do first.",
    );
  });

  it("does not add an empty panel when no personal cards are ready", () => {
    render(
      <I18nProvider language="zh">
        <PersonalTodayCards
          dashboard={{
            timezone: dashboard.timezone,
            today: {
              date: "2026-08-11",
              location: "Espoo",
              notifications: [],
              cards: [],
            },
          }}
          language="zh"
          onOpenAssistant={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole("region", { name: "今天为你准备" })).not.toBeInTheDocument();
  });

  it("uses the localized advice copy when Chinese is selected", () => {
    render(
      <I18nProvider language="zh">
        <PersonalTodayCards
          dashboard={{
            timezone: dashboard.timezone,
            today: {
              date: dashboard.today!.date,
              location: dashboard.today!.location,
              notifications: dashboard.today!.notifications,
              cards: [
                {
                  ...dashboard.today!.cards[0],
                  title_zh: "公共交通服务提醒",
                  summary_zh: "出发前查看路线，并预留缓冲时间。",
                },
              ],
            },
          }}
          language="zh"
          onOpenAssistant={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("公共交通服务提醒")).toBeInTheDocument();
    expect(screen.getByText("出发前查看路线，并预留缓冲时间。")).toBeInTheDocument();
    expect(screen.queryByText("Leave a little earlier")).not.toBeInTheDocument();
  });
});
