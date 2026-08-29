"use client";

import type { ReactNode } from "react";

import {
  CityScopeSelector,
  DateScopeSelector,
  NotificationButton,
  RefreshDataButton,
  type DashboardTone,
} from "./data-platform-shell";
import { LanguageSwitchButton, type LanguageMode } from "./i18n";
import { ExportSnapshotButton } from "./export-snapshot-button";
import { ShareViewLinkButton } from "./share-view-link-button";
import type { PlatformHistoryAvailabilityDay } from "./types";

type PlatformScopeControlsProps = {
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
  showNotifications?: boolean;
  showRefresh?: boolean;
  showShare?: boolean;
  showAuth?: boolean;
};

export function PlatformScopeControls({
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
  renderAuthActionButton,
  showExport = false,
  showNotifications = true,
  showRefresh = true,
  showShare = true,
  showAuth = true,
}: PlatformScopeControlsProps) {
  return (
    <>
      <div className="scope-control-cluster">
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
      <span aria-hidden="true" className="scope-control-divider" />
      <div className="scope-control-cluster">
        <LanguageSwitchButton language={language} onLanguageChange={onLanguageChange} />
        {showRefresh && isAuthenticated && !isHistorical ? (
          <RefreshDataButton
            isRefreshing={isRefreshing}
            language={language}
            onRefresh={onRefresh}
          />
        ) : null}
        {showExport ? (
          <ExportSnapshotButton city={city} date={date} language={language} />
        ) : null}
        {showShare ? (
          <ShareViewLinkButton
            language={language}
            scopeKey={`${city}:${date ?? "live"}`}
          />
        ) : null}
        {showNotifications ? (
          <NotificationButton
            count={notificationCount}
            isActive={isEventsExpanded}
            language={language}
            onClick={onNotificationsClick}
            tone={notificationTone}
          />
        ) : null}
        {showAuth ? renderAuthActionButton("icon-button") : null}
      </div>
    </>
  );
}
