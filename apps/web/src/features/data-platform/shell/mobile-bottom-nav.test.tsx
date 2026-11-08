import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import { MobileBottomNav } from "./mobile-bottom-nav";

const items = [
  { key: "today", labelKey: "navToday", icon: "calendar_today" },
  { key: "overview", labelKey: "navSignals", icon: "hub" },
  { key: "weather", labelKey: "navWeather", icon: "cloud", categoryKey: "weather" },
  { key: "mobility", labelKey: "navMobility", icon: "commute" },
];

describe("MobileBottomNav", () => {
  it("renders the compact destinations and marks the active category", () => {
    render(
      <I18nProvider language="en">
        <MobileBottomNav
          assistantButtonRef={{ current: null }}
          isScopePending={false}
          items={items}
          onOpenAssistant={vi.fn()}
          onSelectNavItem={vi.fn()}
          selectedNavKey="weather"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Weather" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });

  it("keeps assistant unavailable while the scope is updating", () => {
    const onOpenAssistant = vi.fn();

    render(
      <I18nProvider language="en">
        <MobileBottomNav
          assistantButtonRef={{ current: null }}
          isScopePending
          items={items}
          onOpenAssistant={onOpenAssistant}
          onSelectNavItem={vi.fn()}
          selectedNavKey="today"
        />
      </I18nProvider>,
    );

    const assistant = screen.getByRole("button", { name: "Ask" });
    expect(assistant).toBeDisabled();
    fireEvent.click(assistant);
    expect(onOpenAssistant).not.toHaveBeenCalled();
  });

  it("does not forward the click event to the assistant opener", () => {
    const onOpenAssistant = vi.fn();

    render(
      <I18nProvider language="en">
        <MobileBottomNav
          assistantButtonRef={{ current: null }}
          isScopePending={false}
          items={items}
          onOpenAssistant={onOpenAssistant}
          onSelectNavItem={vi.fn()}
          selectedNavKey="today"
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(onOpenAssistant).toHaveBeenCalledWith();
  });
});
