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
import { ShareViewLinkButton } from "./share-view-link-button";
import type { PlatformHistoryAvailabilityDay } from "./types";

type PlatformScopeControlsProps = {
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
  onCityChange: (city: string) => void;
  onDateChange: (date: string | null) => void;
  onLanguageChange: (language: LanguageMode) => void;
  onNotificationsClick: () => void;
  onRefresh: () => void;
  renderAuthActionButton: (className: string) => ReactNode;
  showNotifications?: boolean;
  showRefresh?: boolean;
};

export function PlatformScopeControls({
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
  onCityChange,
  onDateChange,
  onLanguageChange,
  onNotificationsClick,
  onRefresh,
  renderAuthActionButton,
  showNotifications = true,
  showRefresh = true,
}: PlatformScopeControlsProps) {
  return (
    <>
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
        onDateChange={onDateChange}
      />
      <LanguageSwitchButton language={language} onLanguageChange={onLanguageChange} />
      {showRefresh && isAuthenticated && !isHistorical ? (
        <RefreshDataButton
          isRefreshing={isRefreshing}
          language={language}
          onRefresh={onRefresh}
        />
      ) : null}
      <ShareViewLinkButton language={language} />
      {showNotifications ? (
        <NotificationButton
          count={notificationCount}
          isActive={isEventsExpanded}
          language={language}
          onClick={onNotificationsClick}
          tone={notificationTone}
        />
      ) : null}
      {renderAuthActionButton("icon-button")}
    </>
  );
}
