"use client";

import type { ReactNode, RefObject } from "react";
import Image from "next/image";
import Link from "next/link";

import { PROJECT_GITHUB_ISSUES_URL } from "@/features/shared/project-links";
import { MaterialIcon } from "@/features/shared/material-icon";

import { appEnv } from "@/lib/env";

import {
  CATALOG_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  type NavItem,
  type ThemeMode,
} from "./data-platform-shell";
import {
  BRAND_LOGO_SRC,
  FALLBACK_NAV_KEY,
  navItemAvailable,
} from "./data-platform-nav-utils";
import { useI18n } from "./i18n";
import type { PlatformCategory } from "./types";
import { viewerStateLabel } from "./viewer-state";

type DataPlatformSideNavProps = {
  categories: PlatformCategory[];
  className: string;
  currentUserLabel: string;
  isAuthenticated: boolean;
  isMobileMenuOpen: boolean;
  navBadges?: Record<string, number>;
  navigationRef: RefObject<HTMLElement>;
  onHide: () => void;
  onPrefetchNavItem?: (item: NavItem) => void;
  onSelectNavItem: (item: NavItem) => void;
  renderAuthActionButton: (className: string, showText?: boolean) => ReactNode;
  selectedNavKey: string;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
};

function navRowLabelKey(item: NavItem): string {
  if (item.key === FALLBACK_NAV_KEY) {
    return "shell.signalObservatory";
  }
  return `shell.${item.labelKey}`;
}

export function DataPlatformSideNav({
  categories,
  className,
  currentUserLabel,
  isAuthenticated,
  isMobileMenuOpen,
  navBadges,
  navigationRef,
  onHide,
  onPrefetchNavItem,
  onSelectNavItem,
  renderAuthActionButton,
  selectedNavKey,
  themeMode,
  onToggleTheme,
}: DataPlatformSideNavProps) {
  const { language, tKey } = useI18n();
  const themeActionLabel = tKey(
    themeMode === "light" ? "shell.switchToNightTheme" : "shell.switchToDayTheme",
  );
  const userStateLabel = viewerStateLabel(isAuthenticated, appEnv.demoMode, language);
  const displayUserLabel = isAuthenticated ? currentUserLabel : userStateLabel;
  const navigationActionLabel = tKey(
    isMobileMenuOpen ? "shell.closeNavigation" : "shell.hideNavigation",
  );

  function renderNavRow(item: NavItem): ReactNode {
    const isActive =
      selectedNavKey === item.key ||
      (item.categoryKey != null && selectedNavKey === item.categoryKey);
    const navLabel = tKey(navRowLabelKey(item));
    const badge = navBadges?.[item.key] ?? 0;

    return (
      <button
        aria-current={isActive ? "page" : undefined}
        className={isActive ? "nav-row nav-row-active" : "nav-row"}
        data-nav-key={item.key}
        key={item.key}
        onClick={() => onSelectNavItem(item)}
        onFocus={() => onPrefetchNavItem?.(item)}
        onMouseEnter={() => onPrefetchNavItem?.(item)}
        title={navLabel}
        type="button"
      >
        <MaterialIcon name={item.icon} />
        <span>{navLabel}</span>
        {badge > 0 ? (
          <span className="side-nav-count-badge" aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </button>
    );
  }

  const workspaceItems = PRIMARY_NAV_ITEMS.filter((item) =>
    navItemAvailable(item, categories),
  );
  const catalogItems = CATALOG_NAV_ITEMS.filter((item) =>
    navItemAvailable(item, categories),
  );

  return (
    <aside
      aria-label={tKey("shell.primaryNavigation")}
      aria-modal={isMobileMenuOpen ? true : undefined}
      className={className}
      id="arkiwatch-mobile-navigation"
      ref={navigationRef}
      role={isMobileMenuOpen ? "dialog" : undefined}
    >
      <div className="brand-panel">
        <div className="brand-icon" aria-hidden="true">
          <Image
            alt=""
            className="brand-logo-image"
            height={96}
            priority
            src={BRAND_LOGO_SRC}
            width={96}
          />
        </div>
        <div className="brand-copy">
          <h1 className="brand-title-main">ArkiWatch</h1>
          <p className="brand-title-subtitle">{tKey("shell.publicData")}</p>
        </div>
        <button
          className="icon-button side-nav-collapse-button"
          aria-label={navigationActionLabel}
          onClick={onHide}
          title={navigationActionLabel}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {isMobileMenuOpen ? "close" : "keyboard_double_arrow_left"}
          </span>
        </button>
      </div>

      <nav className="side-nav-list" aria-label={tKey("shell.signalNavigation")}>
        <span className="side-nav-group-label">{tKey("shell.workspaceMode")}</span>
        {workspaceItems.map(renderNavRow)}
      </nav>

      {catalogItems.length > 0 ? (
        <nav className="side-nav-catalog" aria-label={tKey("shell.dataCatalogNavigation")}>
          <span className="side-nav-catalog-label">{tKey("shell.dataCatalog")}</span>
          {catalogItems.map(renderNavRow)}
        </nav>
      ) : null}

      <nav className="side-nav-footer" aria-label={tKey("shell.systemControls")}>
        <div className="side-nav-utility-group">
          <button
            className="nav-row side-nav-utility-row"
            aria-label={themeActionLabel}
            onClick={onToggleTheme}
            title={themeActionLabel}
            type="button"
          >
            <MaterialIcon name={themeMode === "light" ? "dark_mode" : "light_mode"} />
            <span>{tKey("shell.themeMode")}</span>
          </button>
          <div
            className="nav-row side-nav-utility-row side-nav-user-row"
            aria-label={userStateLabel}
            title={displayUserLabel}
          >
            <MaterialIcon name={isAuthenticated ? "manage_accounts" : "visibility"} />
            <span>{displayUserLabel}</span>
          </div>
          {isAuthenticated ? (
            <Link
              aria-label={tKey("shell.personalSettingsTitle")}
              className="nav-row side-nav-utility-row"
              href="/settings"
              title={tKey("shell.personalSettingsTitle")}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                settings
              </span>
              <span>{tKey("shell.personalSettingsTitle")}</span>
            </Link>
          ) : null}
          <Link
            aria-label={tKey("shell.aboutArkiWatch")}
            className="nav-row side-nav-utility-row"
            href="/about"
            title={tKey("shell.aboutArkiWatch")}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              info
            </span>
            <span>{tKey("shell.aboutArkiWatch")}</span>
          </Link>
          <a
            aria-label={tKey("shell.reportDataIssue")}
            className="nav-row side-nav-utility-row"
            href={PROJECT_GITHUB_ISSUES_URL}
            rel="noreferrer"
            target="_blank"
            title={tKey("shell.reportDataIssue")}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              public
            </span>
            <span>{tKey("shell.reportDataIssue")}</span>
          </a>
          {renderAuthActionButton("nav-row side-nav-utility-row", true)}
        </div>
      </nav>
    </aside>
  );
}

export function DataPlatformSideNavBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="mobile-side-nav-backdrop"
      onClick={onClose}
      aria-hidden="true"
    />
  );
}

export function SideNavRestoreButton({ onShow }: { onShow: () => void }) {
  const { tKey } = useI18n();

  return (
    <button
      className="icon-button side-nav-restore-button"
      aria-label={tKey("shell.showNavigation")}
      onClick={onShow}
      title={tKey("shell.showNavigation")}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        keyboard_double_arrow_right
      </span>
    </button>
  );
}
