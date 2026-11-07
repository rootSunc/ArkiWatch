"use client";

import { useRef, type ChangeEvent, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";

import {
  CityScopeSelector,
  DateScopeSelector,
  NotificationButton,
  type DashboardTone,
  type ThemeMode,
  type WorkspaceMode,
} from "./data-platform-shell";
import {
  BRAND_LOGO_SRC,
  FALLBACK_NAV_KEY,
  breadcrumbForNav,
} from "./data-platform-nav-utils";

import { AssistantGlyph } from "@/features/assistant-widget/assistant-glyph";
import { SideNavRestoreButton } from "./data-platform-side-nav";
import { type LanguageMode, useI18n } from "./i18n";
import { PlatformScopeControls } from "./platform-scope-controls";
import { ShareViewLinkButton } from "./share-view-link-button";
import type { PlatformCategory, PlatformHistoryAvailabilityDay } from "./types";
import { displayTitle } from "./data-platform-view-model";

type ScopeControlProps = {
  availability: PlatformHistoryAvailabilityDay[];
  city: string;
  date: string | null;
  isDemo: boolean;
  isAuthenticated: boolean;
  isCityPending: boolean;
  isDatePending: boolean;
  isEventsExpanded: boolean;
  isHistorical: boolean;
  isRefreshing: boolean;
  language: LanguageMode;
  notificationCount: number;
  notificationTone: DashboardTone;
  onCalendarOpen?: () => void;
  onCityChange: (city: string) => void;
  onDateChange: (date: string | null) => void;
  onLanguageChange: (language: LanguageMode) => void;
  onNotificationsClick: () => void;
  onRefresh: () => void;
  renderAuthActionButton: (className: string) => ReactNode;
  showExport?: boolean;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
};

type DashboardSearchProps = {
  className?: string;
  clearLabel: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

function DashboardSearch({
  className,
  clearLabel,
  label,
  onChange,
  placeholder,
  value,
}: DashboardSearchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.currentTarget.value);
  }

  return (
    <div className={`dashboard-search${className ? ` ${className}` : ""}`}>
      <span className="material-symbols-outlined" aria-hidden="true">
        search
      </span>
      <input
        aria-label={label}
        onChange={handleChange}
        placeholder={placeholder}
        ref={inputRef}
        value={value}
      />
      {value ? (
        <button
          aria-label={clearLabel}
          className="dashboard-search-clear"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          title={clearLabel}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      ) : null}
    </div>
  );
}

type DataPlatformMobileHeaderProps = ScopeControlProps & {
  isDetailPage: boolean;
  isMobileMenuOpen: boolean;
  selectedNavKey: string;
  onBackToOverview: () => void;
  navigationButtonRef: RefObject<HTMLButtonElement>;
  onSearchChange: (value: string) => void;
  workspaceMode: WorkspaceMode;
  onOpenNavigation: () => void;
  searchValue: string;
};

export function DataPlatformMobileHeader({
  availability,
  city,
  date,
  isDemo,
  isCityPending,
  isDatePending,
  isDetailPage,
  isMobileMenuOpen,
  selectedNavKey,
  onBackToOverview,
  navigationButtonRef,
  isEventsExpanded,
  language,
  notificationCount,
  notificationTone,
  onCalendarOpen,
  onCityChange,
  onDateChange,
  onNotificationsClick,
  onOpenNavigation,
}: DataPlatformMobileHeaderProps) {
  const { tKey } = useI18n();

  return (
    <header className="mobile-dashboard-header">
      <div className="mobile-brand">
        {isDetailPage ? (
          <button className="icon-button" type="button" aria-label={tKey("shell.backToSignals")} onClick={onBackToOverview}>
            <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
        ) : null}
        <button
          aria-controls="arkiwatch-mobile-navigation"
          aria-expanded={isMobileMenuOpen}
          className={`icon-button${isDetailPage ? " mobile-workspace-menu" : ""}`}
          aria-label={tKey("shell.openNavigation")}
          onClick={onOpenNavigation}
          ref={navigationButtonRef}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">menu</span>
        </button>
        {!isDetailPage ? <span className="mobile-brand-mark" aria-hidden="true">
          <Image alt="" className="brand-logo-image" height={96} src={BRAND_LOGO_SRC} width={96} />
        </span> : null}
        <strong>{isDetailPage ? tKey(breadcrumbForNav(selectedNavKey).leafKey) : "ArkiWatch"}</strong>
        <NotificationButton
          count={notificationCount}
          isActive={isEventsExpanded}
          language={language}
          onClick={onNotificationsClick}
          tone={notificationTone}
        />
      </div>
      <div className="mobile-context-row">
        <CityScopeSelector
          city={city}
          isPending={isCityPending}
          language={language}
          onCityChange={onCityChange}
        />
        <span className="mobile-context-sep" aria-hidden="true">
          ·
        </span>
        <DateScopeSelector
          availability={availability}
          date={date}
          isDemo={isDemo}
          isPending={isDatePending}
          language={language}
          onCalendarOpen={onCalendarOpen}
          onDateChange={onDateChange}
        />
        <Link
          aria-label={tKey("shell.personalSettingsTitle")}
          className="icon-button mobile-context-settings"
          href="/settings"
          title={tKey("shell.personalSettingsTitle")}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            settings
          </span>
        </Link>
        <ShareViewLinkButton
          language={language}
          scopeKey={`${city}:${date ?? "live"}`}
        />
      </div>
    </header>
  );
}

type DataPlatformWorkspaceTopbarProps = ScopeControlProps & {
  assistantButtonRef?: RefObject<HTMLButtonElement>;
  isDetailPage: boolean;
  onOpenAssistant?: () => void;
  workspaceMode: WorkspaceMode;
  onSearchChange?: (value: string) => void;
  onSelectNav: (navKey: string) => void;
  restoreSideNavButton: ReactNode;
  searchValue?: string;
  selectedNavKey: string;
};

export function DataPlatformWorkspaceTopbar({
  availability,
  assistantButtonRef,
  city,
  date,
  isDemo,
  isAuthenticated,
  isCityPending,
  isDatePending,
  onOpenAssistant,
  isEventsExpanded,
  isHistorical,
  isRefreshing,
  language,
  notificationCount,
  notificationTone,
  onCalendarOpen,
  onCityChange,
  onDateChange,
  onLanguageChange,
  onNotificationsClick,
  onRefresh,
  onSelectNav,
  onToggleTheme,
  renderAuthActionButton,
  restoreSideNavButton,
  selectedNavKey,
  showExport,
  themeMode,
}: DataPlatformWorkspaceTopbarProps) {
  const { tKey } = useI18n();
  const crumb = breadcrumbForNav(selectedNavKey);
  const scopeUpdating = isCityPending || isDatePending;

  return (
    <header className="detail-topbar">
      {restoreSideNavButton}
      <nav className="topbar-crumb" aria-label={tKey("shell.breadcrumb")}>
        <button
          className="topbar-crumb-root"
          onClick={() => onSelectNav(crumb.rootTarget)}
          type="button"
        >
          {tKey(crumb.rootKey)}
        </button>
        <span className="topbar-crumb-sep" aria-hidden="true">
          /
        </span>
        <span className="topbar-crumb-leaf" aria-current="page">
          {tKey(crumb.leafKey)}
        </span>
      </nav>

      <span className="topbar-spacer" />

      <div className="detail-topbar-actions">
        <PlatformScopeControls
          availability={availability}
          city={city}
          date={date}
          isDemo={isDemo}
          isAuthenticated={isAuthenticated}
          isCityPending={isCityPending}
          isDatePending={isDatePending}
          isEventsExpanded={isEventsExpanded}
          isHistorical={isHistorical}
          isRefreshing={isRefreshing}
          language={language}
          notificationCount={notificationCount}
          notificationTone={notificationTone}
          onCalendarOpen={onCalendarOpen}
          onCityChange={onCityChange}
          onDateChange={onDateChange}
          onLanguageChange={onLanguageChange}
          onNotificationsClick={onNotificationsClick}
          onRefresh={onRefresh}
          onToggleTheme={onToggleTheme}
          renderAuthActionButton={renderAuthActionButton}
          showAuth={false}
          showExport={showExport}
          themeMode={themeMode}
        />
        {onOpenAssistant ? (
          <button
            aria-label={tKey("assistant.openAssistant")}
            aria-disabled={scopeUpdating || undefined}
            className="topbar-assistant"
            disabled={scopeUpdating}
            onClick={() => onOpenAssistant()}
            ref={assistantButtonRef}
            title={
              scopeUpdating
                ? tKey("shell.scopeUpdating")
                : tKey("assistant.openAssistant")
            }
            type="button"
          >
            <AssistantGlyph className="topbar-assistant-mark" />
            <span>{tKey("shell.assistant")}</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}

type DataPlatformDesktopHeaderProps = ScopeControlProps & {
  onSearchChange: (value: string) => void;
  restoreSideNavButton: ReactNode;
  searchValue: string;
  selectedCategory: PlatformCategory | null;
  selectedNavKey: string;
};

export function DataPlatformDesktopHeader({
  availability,
  city,
  date,
  isDemo,
  isAuthenticated,
  isCityPending,
  isDatePending,
  isEventsExpanded,
  isHistorical,
  isRefreshing,
  language,
  notificationCount,
  notificationTone,
  onCalendarOpen,
  onCityChange,
  onDateChange,
  onLanguageChange,
  onNotificationsClick,
  onRefresh,
  onSearchChange,
  onToggleTheme,
  renderAuthActionButton,
  restoreSideNavButton,
  searchValue,
  selectedCategory,
  selectedNavKey,
  showExport,
  themeMode,
}: DataPlatformDesktopHeaderProps) {
  const { tKey } = useI18n();

  return (
    <div className="desktop-dashboard-header">
      <div className="desktop-dashboard-heading">
        {restoreSideNavButton}
        <div className="desktop-dashboard-heading-copy">
          <span className="desktop-dashboard-kicker">
            {tKey(
              selectedNavKey === FALLBACK_NAV_KEY
                ? "shell.dataPlatformMode"
                : "shell.lifeAssistant",
            )}
          </span>
          <h2>
            {selectedCategory
              ? `${displayTitle(selectedCategory, language)} ${tKey("shell.dashboardSuffix")}`
              : selectedNavKey === FALLBACK_NAV_KEY
                ? tKey("shell.navSignals")
                : tKey("shell.navToday")}
          </h2>
          <p>
            {selectedCategory?.description ??
              (selectedNavKey === FALLBACK_NAV_KEY
                ? tKey("shell.dataPlatformLead")
                : tKey("shell.lifeAssistantLead"))}
          </p>
        </div>
      </div>
      <div className="desktop-controls">
        <DashboardSearch
          clearLabel={tKey("shell.clearSearch")}
          label={tKey("shell.searchSignalsPlaceholder")}
          onChange={onSearchChange}
          placeholder={tKey("shell.searchSignalsPlaceholder")}
          value={searchValue}
        />
        <PlatformScopeControls
          availability={availability}
          city={city}
          date={date}
          isDemo={isDemo}
          isAuthenticated={isAuthenticated}
          isCityPending={isCityPending}
          isDatePending={isDatePending}
          isEventsExpanded={isEventsExpanded}
          isHistorical={isHistorical}
          isRefreshing={isRefreshing}
          language={language}
          notificationCount={notificationCount}
          notificationTone={notificationTone}
          onCalendarOpen={onCalendarOpen}
          onCityChange={onCityChange}
          onDateChange={onDateChange}
          onLanguageChange={onLanguageChange}
          onNotificationsClick={onNotificationsClick}
          onRefresh={onRefresh}
          onToggleTheme={onToggleTheme}
          renderAuthActionButton={renderAuthActionButton}
          showExport={showExport}
          themeMode={themeMode}
        />
      </div>
    </div>
  );
}

export { SideNavRestoreButton };
