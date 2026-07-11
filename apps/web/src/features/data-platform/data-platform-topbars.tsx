"use client";

import type { ChangeEvent, ReactNode, RefObject } from "react";
import Image from "next/image";

import { AssistantGlyph } from "@/features/assistant-widget/assistant-glyph";

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
      {workspaceMode === "data" && !isDetailPage ? (
        <DashboardSearch
          className="mobile-dashboard-search"
          clearLabel={tKey("shell.clearSearch")}
          label={tKey("shell.searchSignalsPlaceholder")}
          onChange={onSearchChange}
          placeholder={tKey("shell.searchSignalsPlaceholder")}
          value={searchValue}
        />
      ) : null}
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
  workspaceMode,
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
        {workspaceMode === "data" && onOpenAssistant ? (
          <button
            aria-label={tKey("assistant.openAssistant")}
            aria-disabled={isCityPending || isDatePending || undefined}
            className="icon-button workspace-topbar-assistant"
            disabled={isCityPending || isDatePending}
            onClick={() => onOpenAssistant()}
            ref={assistantButtonRef}
            title={
              isCityPending || isDatePending
                ? tKey("shell.scopeUpdating")
                : tKey("assistant.openAssistant")
            }
            type="button"
          >
            <AssistantGlyph />
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
