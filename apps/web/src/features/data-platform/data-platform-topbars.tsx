"use client";

import type { ChangeEvent, ReactNode, RefObject } from "react";
import Image from "next/image";

import {
  CityScopeSelector,
  DateScopeSelector,
  NotificationButton,
  RefreshDataButton,
  ThemeToggleButton,
  type DashboardTone,
  type ThemeMode,
  type WorkspaceMode,
} from "./data-platform-shell";
import {
  BRAND_LOGO_SRC,
  FALLBACK_NAV_KEY,
  breadcrumbForNav,
} from "./data-platform-nav-utils";

const ASSISTANT_MASCOT_SRC = "/brand/zoro_mascot_launcher.png";
import { SideNavRestoreButton } from "./data-platform-side-nav";
import { LanguageSwitchButton, type LanguageMode, useI18n } from "./i18n";
import { PlatformScopeControls } from "./platform-scope-controls";
import { ExportSnapshotButton } from "./export-snapshot-button";
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
        value={value}
      />
      {value ? (
        <button
          aria-label={clearLabel}
          className="dashboard-search-clear"
          onClick={() => onChange("")}
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
  currentUserInitials: string;
  currentUserLabel: string;
  isDetailPage: boolean;
  isMobileMenuOpen: boolean;
  navigationButtonRef: RefObject<HTMLButtonElement>;
  onSearchChange: (value: string) => void;
  workspaceMode: WorkspaceMode;
  onOpenNavigation: () => void;
  searchValue: string;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  userStateLabel: string;
};

export function DataPlatformMobileHeader({
  availability,
  city,
  currentUserInitials,
  currentUserLabel,
  date,
  isDemo,
  isAuthenticated,
  isCityPending,
  isDatePending,
  isDetailPage,
  isMobileMenuOpen,
  navigationButtonRef,
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
  onOpenNavigation,
  onRefresh,
  onToggleTheme,
  renderAuthActionButton,
  showExport,
  themeMode,
  userStateLabel,
  workspaceMode,
}: DataPlatformMobileHeaderProps) {
  const { tKey } = useI18n();

  return (
    <header className="mobile-dashboard-header">
      <div className="mobile-brand">
        <button
          aria-controls="arkiwatch-mobile-navigation"
          aria-expanded={isMobileMenuOpen}
          className="icon-button"
          aria-label={tKey("shell.openNavigation")}
          onClick={onOpenNavigation}
          ref={navigationButtonRef}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            menu
          </span>
        </button>
        <span className="mobile-brand-mark" aria-hidden="true">
          <Image
            alt=""
            className="brand-logo-image"
            height={96}
            src={BRAND_LOGO_SRC}
            width={96}
          />
        </span>
        <span className="mobile-brand-copy">
          <strong>ArkiWatch</strong>
          <small>
            {tKey(
              workspaceMode === "today"
                ? "shell.lifeAssistant"
                : "shell.dataPlatformMode",
            )}
          </small>
        </span>
      </div>
      <div className="top-actions">
        <div className="mobile-scope-switchers">
          <CityScopeSelector
            city={city}
            isPending={isCityPending}
            language={language}
            onCityChange={onCityChange}
          />
          <DateScopeSelector
            availability={availability}
            date={date}
            isDemo={isDemo}
            isPending={isDatePending}
            language={language}
            onCalendarOpen={onCalendarOpen}
            onDateChange={onDateChange}
          />
        </div>
        <div className="mobile-utility-actions">
          <LanguageSwitchButton language={language} onLanguageChange={onLanguageChange} />
          <ThemeToggleButton language={language} themeMode={themeMode} onToggle={onToggleTheme} />
          {isAuthenticated && !isDetailPage && !isHistorical ? (
            <RefreshDataButton
              isRefreshing={isRefreshing}
              language={language}
              onRefresh={onRefresh}
            />
          ) : null}
          {showExport ? (
            <ExportSnapshotButton city={city} date={date} language={language} />
          ) : null}
          <ShareViewLinkButton
            language={language}
            scopeKey={`${city}:${date ?? "live"}`}
          />
          <NotificationButton
            count={notificationCount}
            isActive={isEventsExpanded && !isDetailPage}
            language={language}
            onClick={onNotificationsClick}
            tone={notificationTone}
          />
          <span
            className="profile-avatar mobile-overflow-action"
            aria-label={userStateLabel}
            title={currentUserLabel}
          >
            {currentUserInitials}
          </span>
          {renderAuthActionButton("icon-button mobile-overflow-action")}
        </div>
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
  isDetailPage,
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
  renderAuthActionButton,
  restoreSideNavButton,
  selectedNavKey,
  showExport,
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
          isEventsExpanded={isEventsExpanded && !isDetailPage}
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
          renderAuthActionButton={renderAuthActionButton}
          showExport={showExport}
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
            <Image
              alt=""
              aria-hidden="true"
              className="topbar-assistant-mark"
              height={36}
              src={ASSISTANT_MASCOT_SRC}
              width={36}
            />
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
  renderAuthActionButton,
  restoreSideNavButton,
  searchValue,
  selectedCategory,
  selectedNavKey,
  showExport,
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
          renderAuthActionButton={renderAuthActionButton}
          showExport={showExport}
        />
      </div>
    </div>
  );
}

export { SideNavRestoreButton };
