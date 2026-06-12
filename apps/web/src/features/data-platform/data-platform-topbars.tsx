"use client";

import type { ReactNode } from "react";
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
import { BRAND_LOGO_SRC, FALLBACK_NAV_KEY, TODAY_NAV_KEY } from "./data-platform-nav-utils";
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

type DataPlatformMobileHeaderProps = ScopeControlProps & {
  currentUserInitials: string;
  currentUserLabel: string;
  isDetailPage: boolean;
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
  isAuthenticated,
  isCityPending,
  isDatePending,
  isDetailPage,
  onSearchChange,
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
  searchValue,
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
          className="icon-button"
          aria-label={tKey("shell.openNavigation")}
          onClick={onOpenNavigation}
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
          <ShareViewLinkButton language={language} />
          <NotificationButton
            count={notificationCount}
            isActive={isEventsExpanded && !isDetailPage}
            language={language}
            onClick={onNotificationsClick}
            tone={notificationTone}
          />
          <button
            className="icon-button mobile-overflow-action"
            aria-label={tKey("shell.settings")}
            type="button"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              settings
            </span>
          </button>
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
      {workspaceMode === "data" ? (
        <label className="dashboard-search mobile-dashboard-search">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            aria-label={tKey("shell.searchSignalsPlaceholder")}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder={tKey("shell.searchSignalsPlaceholder")}
            value={searchValue}
          />
        </label>
      ) : null}
    </header>
  );
}

type DataPlatformWorkspaceTopbarProps = ScopeControlProps & {
  isDetailPage: boolean;
  workspaceMode: WorkspaceMode;
  onSearchChange: (value: string) => void;
  onSelectNav: (navKey: string) => void;
  restoreSideNavButton: ReactNode;
  searchValue: string;
};

export function DataPlatformWorkspaceTopbar({
  availability,
  city,
  date,
  isAuthenticated,
  isCityPending,
  isDatePending,
  isDetailPage,
  workspaceMode,
  onSearchChange,
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
  searchValue,
  showExport,
}: DataPlatformWorkspaceTopbarProps) {
  const { tKey } = useI18n();

  return (
    <header className="detail-topbar">
      <div className="detail-topbar-brand">
        {restoreSideNavButton}
        <span className="detail-topbar-mark" aria-hidden="true">
          <Image
            alt=""
            className="brand-logo-image"
            height={96}
            src={BRAND_LOGO_SRC}
            width={96}
          />
        </span>
        <strong>ArkiWatch</strong>
      </div>
      <div className="workspace-context-badge">
        <span className="material-symbols-outlined" aria-hidden="true">
          {workspaceMode === "data" ? "hub" : "calendar_today"}
        </span>
        <span>
          {tKey(
            workspaceMode === "data"
              ? "shell.dataPlatformMode"
              : "shell.lifeAssistant",
          )}
        </span>
      </div>
      {isDetailPage ? (
        <nav aria-label={tKey("shell.detailWorkspaceNavigation")}>
          <button onClick={() => onSelectNav(TODAY_NAV_KEY)} type="button">
            {tKey("shell.backToToday")}
          </button>
          <button onClick={() => onSelectNav(FALLBACK_NAV_KEY)} type="button">
            {tKey("shell.allSignals")}
          </button>
        </nav>
      ) : null}
      <div className="detail-topbar-actions">
        {workspaceMode === "data" && !isDetailPage ? (
          <label className="dashboard-search workspace-search">
            <span className="material-symbols-outlined" aria-hidden="true">
              search
            </span>
            <input
              aria-label={tKey("shell.searchSignalsPlaceholder")}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              placeholder={tKey("shell.searchSignalsPlaceholder")}
              value={searchValue}
            />
          </label>
        ) : null}
        <PlatformScopeControls
          availability={availability}
          city={city}
          date={date}
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
        <label className="dashboard-search">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder={tKey("shell.searchSignalsPlaceholder")}
            value={searchValue}
          />
        </label>
        <PlatformScopeControls
          availability={availability}
          city={city}
          date={date}
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
