import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import { DataPlatformSideNav } from "./data-platform-side-nav";

function renderNavigation(isAuthenticated: boolean, navBadges?: Record<string, number>) {
  return render(
    <I18nProvider language="en">
      <DataPlatformSideNav
        categories={[]}
        className="dashboard-side-nav"
        currentUserLabel="Test User"
        isAuthenticated={isAuthenticated}
        isMobileMenuOpen={false}
        navBadges={navBadges}
        showPlan={Boolean(navBadges?.today)}
        navigationRef={{ current: null }}
        onHide={vi.fn()}
        onSelectNavItem={vi.fn()}
        renderAuthActionButton={() => <button type="button">Sign out</button>}
        selectedNavKey="today"
        themeMode="light"
        onToggleTheme={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("DataPlatformSideNav", () => {
  it("keeps personal setup reachable from the authenticated utility area", () => {
    renderNavigation(true);

    expect(screen.getByRole("link", { name: "Personal context" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("keeps the optional setup entry reachable from the public view", () => {
    renderNavigation(false);

    expect(screen.getByRole("link", { name: "Personal context" })).toHaveAttribute("href", "/settings");
  });

  it("includes a visible navigation badge count in the accessible name", () => {
    renderNavigation(true, { today: 4 });

    const button = screen.getByRole("button", { name: "Your day (4)" });
    expect(button.querySelector(".side-nav-count-badge")).toHaveAttribute("aria-hidden", "true");
  });

  it("exposes language and theme preferences in the mobile drawer", () => {
    const onToggleTheme = vi.fn();

    render(
      <I18nProvider language="en">
        <DataPlatformSideNav
          categories={[]}
          className="dashboard-side-nav mobile-side-nav-open"
          currentUserLabel="Test User"
          isAuthenticated={false}
          isMobileMenuOpen
          navigationRef={{ current: null }}
          onHide={vi.fn()}
          onLanguageChange={vi.fn()}
          onSelectNavItem={vi.fn()}
          onToggleTheme={onToggleTheme}
          language="en"
          renderAuthActionButton={() => <button type="button">Sign in</button>}
          selectedNavKey="today"
          themeMode="light"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "中文" })).toBeVisible();
    screen.getByRole("button", { name: "Switch to night theme" }).click();

    expect(onToggleTheme).toHaveBeenCalledOnce();
  });

  it("keeps the authenticated refresh action reachable in the mobile drawer", () => {
    const onHide = vi.fn();
    const onRefresh = vi.fn();

    render(
      <I18nProvider language="en">
        <DataPlatformSideNav
          categories={[]}
          className="dashboard-side-nav mobile-side-nav-open"
          currentUserLabel="Test User"
          isAuthenticated
          isMobileMenuOpen
          navigationRef={{ current: null }}
          onHide={onHide}
          onRefresh={onRefresh}
          onSelectNavItem={vi.fn()}
          renderAuthActionButton={() => <button type="button">Sign out</button>}
          selectedNavKey="today"
          themeMode="light"
          onToggleTheme={vi.fn()}
        />
      </I18nProvider>,
    );

    screen.getByRole("button", { name: "Refresh data" }).click();

    expect(onHide).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("keeps the public snapshot export reachable in the live mobile drawer", () => {
    render(
      <I18nProvider language="en">
        <DataPlatformSideNav
          categories={[]}
          city="Helsinki"
          className="dashboard-side-nav mobile-side-nav-open"
          currentUserLabel="Test User"
          date={null}
          isAuthenticated
          isMobileMenuOpen
          navigationRef={{ current: null }}
          onHide={vi.fn()}
          onSelectNavItem={vi.fn()}
          renderAuthActionButton={() => <button type="button">Sign out</button>}
          selectedNavKey="overview"
          showExport
          themeMode="light"
          onToggleTheme={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Download public snapshot" }),
    ).toBeInTheDocument();
  });
});
