import type { WorkspaceMode } from "./data-platform-shell";

export function dashboardShellClassName(
  workspaceMode: WorkspaceMode,
  isSideNavHidden: boolean,
): string {
  return [
    "dashboard-shell",
    `dashboard-shell-mode-${workspaceMode}`,
    isSideNavHidden ? "dashboard-shell-nav-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function dashboardSideNavClassName(
  isDetailPage: boolean,
  isMobileMenuOpen: boolean,
  isSideNavHidden: boolean,
): string {
  return [
    isDetailPage
      ? "dashboard-side-nav detail-side-nav"
      : "dashboard-side-nav",
    isMobileMenuOpen ? "mobile-side-nav-open" : "",
    isSideNavHidden ? "dashboard-side-nav-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
