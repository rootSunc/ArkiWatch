"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  CityScopeSelector,
  DateScopeSelector,
  NotificationButton,
  RefreshDataButton,
  storedCityValue,
  type DashboardTone,
  type ThemeMode,
  type WorkspaceMode,
} from "./data-platform-shell";
import { breadcrumbForNav } from "./data-platform-nav-utils";
import { AssistantGlyph } from "@/features/assistant-widget/assistant-glyph";
import { ModePill } from "@/features/shared/ui/console";
import { MaterialIcon } from "@/features/shared/material-icon";
import { SideNavRestoreButton } from "./data-platform-side-nav";
import { type LanguageMode, useI18n } from "../i18n";
import type { PlatformCategory, PlatformHistoryAvailabilityDay } from "../types";

export type ScopeControlProps = {
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
  checkedAt?: string;
  sourceWarning?: boolean;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
};

type WorkspaceTopbarProps = ScopeControlProps & {
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

function useDefaultCityHint(city: string): boolean {
  const initialCity = useRef(city);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(storedCityValue() === null);
  }, []);

  useEffect(() => {
    if (city !== initialCity.current || storedCityValue() !== null) {
      setVisible(false);
    }
  }, [city]);

  return visible;
}

function CityDefaultHint({ onChange }: { onChange: () => void }) {
  const { tKey } = useI18n();

  return (
    <span className="city-default-hint">
      <span>{tKey("shell.notYourCity")}</span>
      <button type="button" onClick={onChange}>
        {tKey("shell.changeCity")}
      </button>
    </span>
  );
}

function ScopeSelectors(props: ScopeControlProps) {
  return (
    <>
      <CityScopeSelector
        city={props.city}
        isPending={props.isCityPending}
        language={props.language}
        onCityChange={props.onCityChange}
      />
      <DateScopeSelector
        availability={props.availability}
        date={props.date}
        isDemo={props.isDemo}
        isPending={props.isDatePending}
        language={props.language}
        onCalendarOpen={props.onCalendarOpen}
        onDateChange={props.onDateChange}
      />
    </>
  );
}

export function DataPlatformWorkspaceTopbar(props: WorkspaceTopbarProps) {
  const { tKey } = useI18n();
  const crumb = breadcrumbForNav(props.selectedNavKey);
  const pending = props.isCityPending || props.isDatePending;
  const suggestCityChange = useDefaultCityHint(props.city);
  return (
    <header className="detail-topbar" aria-busy={pending}>
      {props.restoreSideNavButton}
      <nav className="topbar-crumb" aria-label={tKey("shell.breadcrumb")}>
        {props.selectedNavKey !== "overview" ? (
          <>
            <button
              className="topbar-crumb-root"
              type="button"
              onClick={() => props.onSelectNav("overview")}
            >
              {tKey("shell.navHome")}
            </button>
            <span aria-hidden="true">/</span>
          </>
        ) : null}
        <span aria-current="page">{tKey(crumb.leafKey)}</span>
      </nav>
      <div className="context-scope">
        <ScopeSelectors {...props} />
        {suggestCityChange ? (
          <CityDefaultHint
            onChange={() => {
              document
                .querySelector<HTMLSelectElement>(".detail-topbar .city-scope-control select")
                ?.focus();
            }}
          />
        ) : null}
        <ModePill
          demo={props.isDemo}
          date={props.date}
          warning={props.sourceWarning}
        />
        {props.checkedAt ? (
          <time className="context-checked" dateTime={props.checkedAt}>
            {new Intl.DateTimeFormat(
              props.language === "zh" ? "zh-CN" : "en-GB",
              {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Helsinki",
              },
            ).format(new Date(props.checkedAt))}
          </time>
        ) : null}
      </div>
      <div className="detail-topbar-actions">
        <RefreshDataButton
          isRefreshing={props.isRefreshing}
          language={props.language}
          onRefresh={props.onRefresh}
        />
        <NotificationButton
          count={props.notificationCount}
          isActive={props.isEventsExpanded}
          language={props.language}
          onClick={props.onNotificationsClick}
          tone={props.notificationTone}
        />
        {props.onOpenAssistant ? (
          <button
            aria-label={tKey("assistant.openAssistant")}
            className="topbar-assistant"
            disabled={pending}
            onClick={() => props.onOpenAssistant?.()}
            ref={props.assistantButtonRef}
            type="button"
          >
            <AssistantGlyph />
            <span>{tKey("shell.ask")}</span>
          </button>
        ) : null}
      </div>
      {pending ? (
        <span
          className="context-progress"
          role="status"
          aria-label={tKey("shell.scopeUpdating")}
        />
      ) : null}
    </header>
  );
}

type MobileHeaderProps = ScopeControlProps & {
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

export function DataPlatformMobileHeader(props: MobileHeaderProps) {
  const { tKey } = useI18n();
  const [scopeOpen, setScopeOpen] = useState(false);
  const suggestCityChange = useDefaultCityHint(props.city);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (scopeOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [scopeOpen]);
  return (
    <header className="mobile-dashboard-header">
      <div className="mobile-brand">
        <button
          aria-label={tKey("shell.openNavigation")}
          aria-controls="arkiwatch-mobile-navigation"
          aria-expanded={props.isMobileMenuOpen}
          className="icon-button"
          onClick={props.onOpenNavigation}
          ref={props.navigationButtonRef}
          type="button"
        >
          <MaterialIcon name="menu" />
        </button>
        <strong>ArkiWatch</strong>
        <button
          className="mobile-scope-trigger"
          aria-label={tKey("shell.scope")}
          onClick={() => setScopeOpen(true)}
          type="button"
        >
          {props.city.split("_")[0]}
          <MaterialIcon name="expand_more" />
        </button>
        <NotificationButton
          count={props.notificationCount}
          isActive={props.isEventsExpanded}
          language={props.language}
          onClick={props.onNotificationsClick}
          tone={props.notificationTone}
        />
      </div>
      <div className="mobile-mode-strip">
        <ModePill
          demo={props.isDemo}
          date={props.date}
          warning={props.sourceWarning}
        />
        {suggestCityChange ? (
          <CityDefaultHint onChange={() => setScopeOpen(true)} />
        ) : null}
        <span>{tKey(breadcrumbForNav(props.selectedNavKey).leafKey)}</span>
        {props.checkedAt ? (
          <time
            className="mobile-checked"
            dateTime={props.checkedAt}
            title={tKey("shell.snapshotChecked")}
          >
            {new Intl.DateTimeFormat(
              props.language === "zh" ? "zh-CN" : "en-GB",
              {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Helsinki",
              },
            ).format(new Date(props.checkedAt))}
          </time>
        ) : null}
      </div>
      <dialog
        className="scope-sheet"
        ref={dialogRef}
        onCancel={() => setScopeOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setScopeOpen(false);
        }}
        aria-labelledby="scope-sheet-title"
      >
        <div className="scope-sheet-header">
          <h2 id="scope-sheet-title">{tKey("shell.scope")}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label={tKey("shell.close")}
            onClick={() => setScopeOpen(false)}
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        <ScopeSelectors {...props} />
      </dialog>
    </header>
  );
}

export function DataPlatformDesktopHeader(
  props: ScopeControlProps & {
    onSearchChange: (value: string) => void;
    restoreSideNavButton: ReactNode;
    searchValue: string;
    selectedCategory: PlatformCategory | null;
    selectedNavKey: string;
  },
) {
  return (
    <DataPlatformWorkspaceTopbar
      {...props}
      isDetailPage={false}
      onSelectNav={() => {}}
      workspaceMode="data"
    />
  );
}
export { SideNavRestoreButton };
