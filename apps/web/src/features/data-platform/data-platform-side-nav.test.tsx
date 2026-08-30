import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "./i18n";
import { DataPlatformSideNav } from "./data-platform-side-nav";

function renderNavigation(isAuthenticated: boolean) {
  return render(
    <I18nProvider language="en">
      <DataPlatformSideNav
        categories={[]}
        className="dashboard-side-nav"
        currentUserLabel="Test User"
        isAuthenticated={isAuthenticated}
        isMobileMenuOpen={false}
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

  it("does not expose private setup controls in the public view", () => {
    renderNavigation(false);

    expect(screen.queryByRole("link", { name: "Personal context" })).not.toBeInTheDocument();
  });
});
