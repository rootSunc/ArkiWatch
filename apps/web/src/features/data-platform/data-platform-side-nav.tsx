"use client";

import type { ReactNode } from "react";
import Image from "next/image";

import {
  CATALOG_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  type NavItem,
  type ThemeMode,
} from "./data-platform-shell";
import { BRAND_LOGO_SRC, navItemAvailable } from "./data-platform-nav-utils";
import { useI18n } from "./i18n";
import type { PlatformCategory } from "./types";

type DataPlatformSideNavProps = {
  categories: PlatformCategory[];
  className: string;
  currentUserLabel: string;
  isAuthenticated: boolean;
  onHide: () => void;
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
  onHide,
  onSelectNavItem,
  renderAuthActionButton,
  selectedNavKey,
  themeMode,
  onToggleTheme,
}: DataPlatformSideNavProps) {
  const { tKey } = useI18n();
  const themeActionLabel = tKey(
    themeMode === "light" ? "shell.switchToNightTheme" : "shell.switchToDayTheme",
  );
  const userStateLabel = isAuthenticated ? tKey("shell.signedIn") : tKey("shell.demoView");

  return (
    <aside className={className} aria-label={tKey("shell.primaryNavigation")}>
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
          aria-label={tKey("shell.hideNavigation")}
          onClick={onHide}
          title={tKey("shell.hideNavigation")}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            keyboard_double_arrow_left
          </span>
        </button>
      </div>

      <nav className="side-nav-list" aria-label={tKey("shell.signalNavigation")}>
        {PRIMARY_NAV_ITEMS.filter((item) => navItemAvailable(item, categories)).map((item) => {
          const isActive =
            selectedNavKey === item.key ||
            (item.categoryKey != null && selectedNavKey === item.categoryKey);
          const navLabel = tKey(`shell.${item.labelKey}`);
          return (
            <button
              className={isActive ? "nav-row nav-row-active" : "nav-row"}
              key={item.key}
              onClick={() => onSelectNavItem(item)}
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
                className={isActive ? "nav-row nav-row-active" : "nav-row"}
                key={item.key}
                onClick={() => onSelectNavItem(item)}
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
            aria-label={tKey("shell.settings")}
            title={tKey("shell.settings")}
            type="button"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              settings
            </span>
            <span>{tKey("shell.settings")}</span>
          </button>
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
            title={currentUserLabel}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {isAuthenticated ? "manage_accounts" : "visibility"}
            </span>
            <span>{currentUserLabel}</span>
          </div>
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
