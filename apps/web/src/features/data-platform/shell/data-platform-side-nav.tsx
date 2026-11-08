"use client";

import type { ReactNode, RefObject } from "react";
import Image from "next/image";
import Link from "next/link";

import { MaterialIcon } from "@/features/shared/material-icon";

import {
  CATALOG_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  ThemeToggleButton,
  type NavItem,
  type ThemeMode,
} from "./data-platform-shell";
import { ExportSnapshotButton } from "../workspaces/export-snapshot-button";
import {
  BRAND_LOGO_SRC,
  FALLBACK_NAV_KEY,
  TODAY_NAV_KEY,
  navItemAvailable,
} from "./data-platform-nav-utils";
import { LanguageSwitchButton, type LanguageMode, useI18n } from "../i18n";
import type { PlatformCategory } from "../types";

type DataPlatformSideNavProps = {
  categories: PlatformCategory[];
  showPlan?: boolean;
  className: string;
  currentUserLabel: string;
  city?: string;
  date?: string | null;
  isAuthenticated: boolean;
  isHistorical?: boolean;
  isAssistantOpen?: boolean;
  isMobileMenuOpen: boolean;
  isRefreshing?: boolean;
  navBadges?: Record<string, number>;
  navigationRef: RefObject<HTMLElement>;
  onHide: () => void;
  onPrefetchNavItem?: (item: NavItem) => void;
  onRefresh?: () => void;
  onSelectNavItem: (item: NavItem) => void;
  renderAuthActionButton: (className: string, showText?: boolean) => ReactNode;
  selectedNavKey: string;
  showExport?: boolean;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  language?: LanguageMode;
  onLanguageChange?: (language: LanguageMode) => void;
};

function navRowLabelKey(item: NavItem): string {
  if (item.key === FALLBACK_NAV_KEY) {
    return "shell.navHome";
  }
  return `shell.${item.labelKey}`;
}

export function DataPlatformSideNav({
  categories,
  showPlan = false,
  className,
  city,
  date = null,
  isAuthenticated,
  isHistorical = false,
  isAssistantOpen = false,
  isMobileMenuOpen,
  isRefreshing = false,
  navBadges,
  navigationRef,
  onHide,
  onPrefetchNavItem,
  onRefresh,
  onSelectNavItem,
  renderAuthActionButton,
  selectedNavKey,
  showExport = false,
  themeMode,
  onToggleTheme,
  language,
  onLanguageChange,
}: DataPlatformSideNavProps) {
  const { tKey } = useI18n();
  const navigationActionLabel = tKey(
    isMobileMenuOpen ? "shell.closeNavigation" : "shell.hideNavigation",
  );
  const NavigationContainer = isMobileMenuOpen ? "div" : "aside";

  function renderNavRow(item: NavItem): ReactNode {
    const isActive =
      selectedNavKey === item.key ||
      (item.categoryKey != null && selectedNavKey === item.categoryKey);
    const navLabel = tKey(navRowLabelKey(item));
    const badge = navBadges?.[item.key] ?? 0;
    const displayBadge = badge > 99 ? "99+" : String(badge);
    const accessibleNavLabel = badge > 0 ? `${navLabel} (${displayBadge})` : navLabel;

    return (
      <button
        aria-label={accessibleNavLabel}
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
    navItemAvailable(item, categories) && (item.key !== TODAY_NAV_KEY || showPlan),
  );
  const topItems = workspaceItems.filter((item) => [FALLBACK_NAV_KEY, TODAY_NAV_KEY, "events"].includes(item.key));
  const domainItems = workspaceItems.filter((item) => ![FALLBACK_NAV_KEY, TODAY_NAV_KEY, "events"].includes(item.key));
  const catalogItems = CATALOG_NAV_ITEMS.filter((item) =>
    navItemAvailable(item, categories),
  );

  return (
    <NavigationContainer
      aria-label={tKey("shell.primaryNavigation")}
      aria-hidden={isAssistantOpen ? "true" : undefined}
      aria-modal={isMobileMenuOpen ? true : undefined}
      className={className}
      id="arkiwatch-mobile-navigation"
      ref={navigationRef as RefObject<HTMLDivElement>}
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
          <div className="brand-title-main">
            <span aria-hidden={isMobileMenuOpen || undefined} className="brand-title-desktop">
              ArkiWatch
            </span>
            <span aria-hidden={!isMobileMenuOpen || undefined} className="brand-title-mobile-nav">
              {tKey("shell.navigation")}
            </span>
          </div>
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
        <button className="nav-row side-nav-search" type="button" onClick={() => { if (isMobileMenuOpen) onHide(); window.setTimeout(() => window.dispatchEvent(new Event("arkiwatch:search")), 0); }}><MaterialIcon name="search" /><span>{tKey("shell.search")}</span><kbd>⌘K</kbd></button>
        {topItems.map(renderNavRow)}
        <span className="side-nav-catalog-label">{tKey("shell.domains")}</span>
        {domainItems.map(renderNavRow)}
      </nav>

      {catalogItems.length > 0 ? (
        <nav className="side-nav-catalog" aria-label={tKey("shell.dataCatalogNavigation")}>
          <span className="side-nav-catalog-label">{tKey("shell.reference")}</span>
          {catalogItems.map(renderNavRow)}
          {renderNavRow({ key: "sources", labelKey: "navSources", icon: "monitor_heart" })}
        </nav>
      ) : null}

      <nav className="side-nav-footer" aria-label={tKey("shell.systemControls")}>
        <div className="side-nav-utility-group">
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
          {true ? (
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
          {renderAuthActionButton("nav-row side-nav-utility-row", true)}
        </div>
        {isMobileMenuOpen && isAuthenticated && !isHistorical && (onRefresh || showExport) ? (
          <div className="side-nav-mobile-actions">
            {onRefresh ? (
              <button
                aria-busy={isRefreshing}
                aria-label={tKey("shell.refreshData")}
                className="nav-row side-nav-utility-row"
                disabled={isRefreshing}
                onClick={() => {
                  onHide();
                  onRefresh();
                }}
                title={tKey("shell.refreshData")}
                type="button"
              >
                <MaterialIcon
                  className={isRefreshing ? "spin-animation" : undefined}
                  name="refresh"
                />
                <span>{tKey("shell.refreshData")}</span>
              </button>
            ) : null}
            {showExport && city ? (
              <ExportSnapshotButton
                city={city}
                date={date}
                language={language ?? "en"}
                variant="nav"
              />
            ) : null}
          </div>
        ) : null}
        {language && onLanguageChange ? (
          <div className="side-nav-mobile-preferences">
            <LanguageSwitchButton language={language} onLanguageChange={onLanguageChange} />
            <ThemeToggleButton language={language} themeMode={themeMode} onToggle={onToggleTheme} />
          </div>
        ) : null}
      </nav>
    </NavigationContainer>
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
