"use client";

import type { ReactNode, RefObject } from "react";
import Image from "next/image";
import Link from "next/link";

import { appEnv } from "@/lib/env";

import {
  CATALOG_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  WORKSPACE_MODE_ITEMS,
  type NavItem,
  type ThemeMode,
} from "./data-platform-shell";
import { BRAND_LOGO_SRC, navItemAvailable } from "./data-platform-nav-utils";
import { useI18n } from "./i18n";
import type { PlatformCategory } from "./types";
import { viewerStateLabel } from "./viewer-state";

type DataPlatformSideNavProps = {
  categories: PlatformCategory[];
  className: string;
  currentUserLabel: string;
  isAuthenticated: boolean;
  isMobileMenuOpen: boolean;
  navigationRef: RefObject<HTMLElement>;
  onHide: () => void;
  onPrefetchNavItem?: (item: NavItem) => void;
  onSelectNavItem: (item: NavItem) => void;
  renderAuthActionButton: (className: string, showText?: boolean) => ReactNode;
  selectedNavKey: string;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
};

export function DataPlatformSideNav({
  categories,
  className,
  currentUserLabel,
  isAuthenticated,
  isMobileMenuOpen,
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
  const activeWorkspaceMode = selectedNavKey === "today" ? "today" : "data";
  const navigationActionLabel = tKey(
    isMobileMenuOpen ? "shell.closeNavigation" : "shell.hideNavigation",
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
          <p className="brand-title-subtitle">{tKey("shell.dataPlatform")}</p>
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

      <nav
        className="workspace-mode-switcher"
        aria-label={tKey("shell.workspaceMode")}
      >
        {WORKSPACE_MODE_ITEMS.map((item) => {
          const isActive = activeWorkspaceMode === item.mode;
          const modeLabel = tKey(
            `shell.${item.mode === "today" ? "lifeAssistant" : "dataPlatformMode"}`,
          );
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "workspace-mode-option workspace-mode-option-active"
                  : "workspace-mode-option"
              }
              key={item.mode}
              onClick={() => onSelectNavItem(item)}
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.icon}
              </span>
              <span>
                <strong>{modeLabel}</strong>
                <small>
                  {tKey(
                    item.mode === "today"
                      ? "shell.lifeAssistantLead"
                      : "shell.dataPlatformLead",
                  )}
                </small>
              </span>
            </button>
          );
        })}
      </nav>

      <nav className="side-nav-list" aria-label={tKey("shell.signalNavigation")}>
        {PRIMARY_NAV_ITEMS.filter(
          (item) =>
            item.key !== "today" &&
            item.key !== "overview" &&
            navItemAvailable(item, categories),
        ).map((item) => {
          const isActive =
            selectedNavKey === item.key ||
            (item.categoryKey != null && selectedNavKey === item.categoryKey);
          const navLabel = tKey(`shell.${item.labelKey}`);
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "nav-row nav-row-active" : "nav-row"}
              key={item.key}
              onClick={() => onSelectNavItem(item)}
              onFocus={() => onPrefetchNavItem?.(item)}
              onMouseEnter={() => onPrefetchNavItem?.(item)}
              title={navLabel}
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.icon}
              </span>
              <span>{navLabel}</span>
            </button>
          );
        })}
      </nav>

      {CATALOG_NAV_ITEMS.some((item) => navItemAvailable(item, categories)) ? (
        <nav className="side-nav-catalog" aria-label={tKey("shell.dataCatalogNavigation")}>
          <span className="side-nav-catalog-label">{tKey("shell.dataCatalog")}</span>
          {CATALOG_NAV_ITEMS.filter((item) => navItemAvailable(item, categories)).map((item) => {
            const isActive =
              selectedNavKey === item.key ||
              (item.categoryKey != null && selectedNavKey === item.categoryKey);
            const navLabel = tKey(`shell.${item.labelKey}`);
            return (
              <button
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "nav-row nav-row-active" : "nav-row"}
                key={item.key}
                onClick={() => onSelectNavItem(item)}
                onFocus={() => onPrefetchNavItem?.(item)}
                onMouseEnter={() => onPrefetchNavItem?.(item)}
                title={navLabel}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{navLabel}</span>
              </button>
            );
          })}
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
            <span className="material-symbols-outlined" aria-hidden="true">
              {themeMode === "light" ? "dark_mode" : "light_mode"}
            </span>
            <span>{tKey("shell.themeMode")}</span>
          </button>
          <div
            className="nav-row side-nav-utility-row side-nav-user-row"
            aria-label={userStateLabel}
            title={displayUserLabel}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {isAuthenticated ? "manage_accounts" : "visibility"}
            </span>
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
                tune
              </span>
              <span>{tKey("shell.personalSettingsTitle")}</span>
            </Link>
          ) : null}
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
