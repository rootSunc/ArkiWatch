"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  formatTimestamp,
} from "@/features/shared/format";
import { appEnv } from "@/lib/env";

import "./data-platform.css";

import {
  normalizeCityValue,
} from "./model/city-scope";
import type { NavItem, WorkspaceMode } from "./shell/data-platform-shell";
import {
  DataPlatformSideNav,
  DataPlatformSideNavBackdrop,
} from "./shell/data-platform-side-nav";
import {
  DataPlatformDesktopHeader,
  DataPlatformMobileHeader,
  DataPlatformWorkspaceTopbar,
  SideNavRestoreButton,
} from "./shell/data-platform-topbars";
import {
  I18nProvider,
  installMessageCatalog,
  translateMessageKey,
  type MessageCatalog,
} from "./i18n";
import type { LanguageMode } from "./language";
import { useBrowserSession } from "@/features/auth/use-browser-session";
import { usePlatformHome } from "./hooks/use-platform-home";
import { usePlatformNavPrefetch } from "./hooks/use-platform-prefetch";
import { usePersonalDashboard } from "./hooks/use-personal-dashboard";
import { PlatformSkeleton } from "./shell/platform-skeleton";
import { useClientPreferences } from "./hooks/use-client-preferences";
import {
  EVENT_QUERY_KEY,
  FALLBACK_NAV_KEY,
  NAV_QUERY_KEY,
  TODAY_NAV_KEY,
  buildNavigationQueryParams,
  currentSearchParams,
  categoryByKey,
  mobileNavigationItems,
  resolveNavKey,
} from "./shell/data-platform-nav-utils";
import { useEventAnchorScroll } from "./hooks/use-event-anchor-scroll";
import { useScopeRouting } from "./hooks/use-scope-routing";
import { useShellFocus } from "./hooks/use-shell-focus";
import { useTodayBrief } from "./hooks/use-today-brief";
import { useVisibleOverview } from "./hooks/use-visible-overview";
import { useRefreshPlatformData, useSignOut } from "./queries/platform-actions";
import type { PlatformCategory, PlatformEvent } from "./types";
import {
  eventNavigationId,
  eventTarget,
} from "./model/recent-events";
import type { MobilityTabKey } from "./workspaces/mobility/mobility-workspace";
import {
  resolveScenarioTarget,
} from "./shell/scenario-navigation";
import { PlanWorkspace } from "./personal/plan-workspace";
import { signalTrend } from "./overview/console-model";
import { useMediaQuery } from "@/features/shared/use-media-query";
import { Drawer } from "@/features/shared/ui/console";
import type { ScenarioLiveSignals } from "./overview/scenario-live-hints";
import { workspaceRouteForCategory } from "./shell/workspace-route";
import { SignalCard } from "./overview/signal-card";
import {
  dashboardShellClassName,
  dashboardSideNavClassName,
} from "./shell/data-platform-layout";
import { DataPlatformOverview } from "./overview/data-platform-overview";
import { MobileBottomNav } from "./shell/mobile-bottom-nav";
import { RecentEventsPanel } from "./overview/recent-events-panel";
import { DEMO_CITY } from "./demo/constants";
import { platformErrorMessage } from "./model/platform-error";
import {
  PlatformDataWarning,
  PlatformUnavailable,
  ShellNotices,
} from "./shell/shell-notices";
import { buildSignalView } from "./overview/signal-view";
import { useDocumentTitle } from "@/features/shared/use-document-title";
import {
  ENERGY_TAB_QUERY_KEY,
  MOBILITY_TAB_QUERY_KEY,
  resolveEnergyTabParam,
  resolveMobilityTabParam,
  type EnergyPanelKey,
} from "./shell/workspace-query-params";
import {
  MOBILITY_NAV_KEY,
  isMobilityCategoryKey,
} from "./model/data-platform-view-model";
const SourcesWorkspace = dynamic(
  () => import("./workspaces/sources/sources-workspace").then((module) => module.SourcesWorkspace),
  { loading: () => null },
);
const ConsoleEvents = dynamic(
  () => import("./overview/console-events").then((module) => module.ConsoleEvents),
  { loading: () => null },
);
const PersonalSettingsPage = dynamic(
  () => import("./personal/personal-settings").then((module) => module.PersonalSettingsPage),
  { ssr: false },
);
const CommandPalette = dynamic(
  () => import("./shell/command-palette").then((module) => module.CommandPalette),
  { ssr: false },
);
const DataPlatformWorkspaceRouter = dynamic(
  () => import("./shell/data-platform-workspace-router").then((module) => module.DataPlatformWorkspaceRouter),
  { loading: () => null },
);

// Floating overlay, never part of the first paint: keep it out of the route bundle.
const AssistantWidget = dynamic(
  () =>
    import("@/features/assistant-widget/assistant-widget").then(
      (module) => module.AssistantWidget,
    ),
  { ssr: false },
);

const OUTING_SIGNAL_ORDER = ["weather", "air", "mobility", "transit", "traffic", "energy"];

function outingSignalRank(key: string) {
  const index = OUTING_SIGNAL_ORDER.indexOf(key);
  return index === -1 ? OUTING_SIGNAL_ORDER.length : index;
}

type DataPlatformHomeProps = {
  hasSessionCookie: boolean;
  initialCity: string;
  initialDate: string | null;
  initialLanguage: LanguageMode;
  initialView: string | null;
  messages: MessageCatalog;
};

export function DataPlatformHome({
  hasSessionCookie,
  initialCity,
  initialDate,
  initialLanguage,
  initialView,
  messages,
}: DataPlatformHomeProps) {
  installMessageCatalog(initialLanguage, messages);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // useShellFocus is declared below because it needs the scope this hook
  // produces, so the date handler reaches it through a stable indirection.
  const restoreDateFocus = useRef<() => void>(() => {});
  const requestDateFocus = useCallback(() => restoreDateFocus.current(), []);

  const clearInspectedEvent = useCallback(() => setSelectedEventId(null), []);

  const {
    selectedCity,
    selectedDate,
    selectedNavKey,
    selectedMobilityTab,
    selectedEnergyTab,
    needsHistoryAvailability,
    isScopeTransitionPending,
    selectCity,
    selectDate,
    requestHistoryAvailability,
    updateNavQuery,
    setSelectedNavKey,
    setSelectedMobilityTab,
    setSelectedEnergyTab,
    selectMobilityTab,
    selectEnergyTab,
  } = useScopeRouting({
    initialCity,
    initialDate,
    initialView,
    onScopeChange: clearInspectedEvent,
    onDateChosen: requestDateFocus,
  });

  const demoCitySupported = normalizeCityValue(selectedCity) === DEMO_CITY;
  const session = useBrowserSession(hasSessionCookie);
  const currentUserLabel = session.label;
  const defaultUserId = session.userId;
  const isAuthenticated = session.isAuthenticated;

  const [contextOpen, setContextOpen] = useState(false);
  const [assistantOpenRequest, setAssistantOpenRequest] = useState(0);
  const [assistantOpenQuestion, setAssistantOpenQuestion] = useState<string | null>(null);
  const hasRenderedPlatformStateRef = useRef(false);
  const {
    airQuality,
    apiBaseUrl,
    defaultUserId: resolvedUserId,
    energy,
    error,
    history,
    historyAvailability,
    failedSignalKeys,
    staleSignalKeys,
    householdEnergy,
    isPending,
    isLoadingView,
    isPreviousScope,
    overview,
    publicDashboard,
    roadRail,
    retry,
    transit,
    weather,
  } = usePlatformHome({
    city: selectedCity,
    date: selectedDate,
    userId: defaultUserId,
    activeNavKey: selectedNavKey,
    isHistorical: selectedDate !== null,
    needsHistoryAvailability,
  });
  const prefetchNavView = usePlatformNavPrefetch({
    city: selectedCity,
    date: selectedDate,
    userId: defaultUserId,
  });
  const refreshMutation = useRefreshPlatformData();
  const signOutMutation = useSignOut();
  const {
    languageMode,
    markRecentEventRead,
    readRecentEventIds,
    selectLanguageMode,
    themeMode,
    toggleThemeMode,
  } = useClientPreferences(initialLanguage);
  const [searchValue, setSearchValue] = useState("");
  const [isEventsExpanded, setIsEventsExpanded] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const isDesktopDock = useMediaQuery("(min-width: 1280px)");
  const assistantIsModal = isAssistantOpen && !isDesktopDock;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);
  const [isSideNavHidden, setIsSideNavHidden] = useState(false);

  const isScopePending = isScopeTransitionPending || isPreviousScope;
  const tKey = (key: string) => translateMessageKey(languageMode, key);

  const {
    mainContentRef,
    dashboardAppRef,
    scopeContentRef,
    mobileNavigationRef,
    mobileNavigationButtonRef,
    eventDetailCloseRef,
    eventDetailTriggerRef,
    assistantTopbarButtonRef,
    assistantNavButtonRef,
    assistantFocusReturnRefs,
    requestDateFocusRestore,
    requestRetryFocus,
    restoreEventDetailTriggerFocus,
  } = useShellFocus({
    isMobileMenuOpen,
    onCloseMobileMenu: closeMobileMenu,
    isAssistantOpen: assistantIsModal,
    isScopePending,
    isPending,
    isLoadingView,
    selectedNavKey,
    selectedDate,
    selectedEventId,
    overviewRevision: overview,
  });

  useEffect(() => {
    restoreDateFocus.current = requestDateFocusRestore;
  }, [requestDateFocusRestore]);
  useDocumentTitle(tKey("shell.documentTitle"));

  useEffect(() => {
    if (!isPending) {
      hasRenderedPlatformStateRef.current = true;
    }
  }, [isPending]);

  const highlightedEventId = searchParams.get(EVENT_QUERY_KEY);
  const activeTimeScope =
    overview?.time_scope ??
    weather?.time_scope ??
    airQuality?.time_scope ??
    energy?.time_scope ??
    householdEnergy?.time_scope ??
    roadRail?.time_scope ??
    transit?.time_scope ??
    null;
  const platformTimezone =
    activeTimeScope?.timezone ?? overview?.timezone ?? "Europe/Helsinki";
  const historicalDate =
    activeTimeScope?.mode === "historical"
      ? activeTimeScope.date ?? selectedDate
      : selectedDate;
  const isHistorical = historicalDate !== null;
  const authActionLabel = isAuthenticated ? tKey("shell.signOut") : tKey("shell.adminSignIn");
  const authActionIcon = isAuthenticated ? "logout" : "login";

  const isRefreshing = refreshMutation.isPending;
  const refreshError = refreshMutation.error instanceof Error
    ? refreshMutation.error.message
    : refreshMutation.error
      ? String(refreshMutation.error)
      : null;
  const workspaceMode: WorkspaceMode =
    selectedNavKey === TODAY_NAV_KEY ? "today" : "data";
  const {
    dashboard: personalDashboard,
    error: personalDashboardError,
    retry: retryPersonalDashboard,
  } = usePersonalDashboard({
    enabled:
      isAuthenticated &&
      !appEnv.demoMode &&
      !isHistorical,
    userId: defaultUserId ?? resolvedUserId,
  });

  function requestAssistant(question?: string): void {
    if (isScopePending) {
      return;
    }

    setAssistantOpenQuestion(question?.trim() || null);
    setAssistantOpenRequest((current) => current + 1);
  }

  function triggerDataRefresh(): void {
    if (isRefreshing || refreshMutation.isPending) {
      return;
    }

    if (!isAuthenticated || appEnv.demoMode || isHistorical) { retryPlatformData(); return; }
    refreshMutation.mutate(undefined, {
      onError: (error) => {
        console.error("Error refreshing data sources:", error);
      },
    });
  }

  function retryPlatformData(): void {
    requestRetryFocus();
    void retry().catch((retryError) => {
      console.error("Error retrying platform queries:", retryError);
    });
  }

  function signOut(): void {
    signOutMutation.mutate();
  }

  function openAdminSignIn() {
    router.push("/login");
  }

  function renderAuthActionButton(className: string, showText = false) {
    return (
      <button
        className={className}
        aria-label={authActionLabel}
        onClick={isAuthenticated ? signOut : openAdminSignIn}
        title={authActionLabel}
        type="button"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {authActionIcon}
        </span>
        {showText ? <span>{authActionLabel}</span> : null}
      </button>
    );
  }

  const {
    categories,
    transitCategory,
    roadRailCategory,
    mobilityCategory,
    displayCategories,
    eventReferenceAt,
    recentEventCandidates,
    recentEvents,
    sources,
    visibleOverview,
  } = useVisibleOverview({
    decision: publicDashboard?.decision,
    overview,
    weather,
    airQuality,
    transit,
    roadRail,
    selectedCity,
    activeTimeScope,
  });

  const openNavigationTarget = useCallback(
    (target: { navKey: string; mobilityTab?: MobilityTabKey; energyTab?: EnergyPanelKey }): void => {
      const mobilityTab =
        target.mobilityTab ??
        (isMobilityCategoryKey(target.navKey) ? target.navKey : selectedMobilityTab);
      const energyTab = target.energyTab ?? selectedEnergyTab;
      const resolvedNavKey = resolveNavKey(target.navKey, categories);
      if (resolvedNavKey === MOBILITY_NAV_KEY) {
        setSelectedMobilityTab(mobilityTab);
      }
      if (resolvedNavKey === "energy") {
        setSelectedEnergyTab(energyTab);
      }
      setSelectedNavKey(resolvedNavKey);
      updateNavQuery(resolvedNavKey, { mobilityTab, energyTab });
      closeMobileMenu();
    },
    [
      categories,
      closeMobileMenu,
      selectedEnergyTab,
      selectedMobilityTab,
      setSelectedEnergyTab,
      setSelectedMobilityTab,
      setSelectedNavKey,
      updateNavQuery,
    ],
  );

  // The URL is authoritative for the workspace, so the back button and deep
  // links move the interface. Resolving the request needs the categories that
  // arrived with the data above.
  useEffect(() => {
    const nextRequestedKey = searchParams.get(NAV_QUERY_KEY) ?? (pathname === "/plan" ? TODAY_NAV_KEY : null);
    const nextMobilityTab = resolveMobilityTabParam(
      searchParams.get(MOBILITY_TAB_QUERY_KEY) ?? nextRequestedKey,
    );
    const nextEnergyTab = resolveEnergyTabParam(searchParams.get(ENERGY_TAB_QUERY_KEY));
    const nextNavKey = resolveNavKey(nextRequestedKey, categories);
    if (nextNavKey === MOBILITY_NAV_KEY) {
      setSelectedMobilityTab(nextMobilityTab);
    }
    if (nextNavKey === "energy") {
      setSelectedEnergyTab(nextEnergyTab);
    }
    setSelectedNavKey((current) => (current === nextNavKey ? current : nextNavKey));
  }, [categories, pathname, searchParams, setSelectedEnergyTab, setSelectedMobilityTab, setSelectedNavKey]);

  const scenarioLiveSignals = useMemo<ScenarioLiveSignals>(
    () => ({
      weather,
      airQuality,
      transit,
      roadRail,
      householdEnergy,
      systemEnergy: energy,
    }),
    [airQuality, energy, householdEnergy, roadRail, transit, weather],
  );

  const openAssistantView = useCallback(
    (view: string): void => {
      openNavigationTarget({ navKey: view });
      const highlight = () => {
        const target = document.querySelector<HTMLElement>(`[data-domain="${CSS.escape(view)}"] .workspace-kpis`) ?? (view === "overview" ? document.querySelector<HTMLElement>(".home-metrics") : null);
        if (!target) return false;
        target.setAttribute("data-citation-highlight", ""); target.scrollIntoView({ block: "nearest", behavior: "instant" });
        window.setTimeout(() => target.removeAttribute("data-citation-highlight"), 3000); return true;
      };
      if (!highlight()) { const observer = new MutationObserver(() => { if (highlight()) observer.disconnect(); }); observer.observe(document.body, { childList: true, subtree: true }); window.setTimeout(() => observer.disconnect(), 5000); }
    },
    [openNavigationTarget],
  );

  const selectNav = useCallback(
    (
      nextNavKey: string,
      options: { mobilityTab?: MobilityTabKey; energyTab?: EnergyPanelKey } = {},
    ): void => {
      openNavigationTarget({
        navKey: nextNavKey,
        mobilityTab: options.mobilityTab,
        energyTab: options.energyTab,
      });
    },
    [openNavigationTarget],
  );

  const openScenario = useCallback(
    (scenarioKey: string): void => {
      const target = resolveScenarioTarget(scenarioKey, scenarioLiveSignals);
      if (target) {
        openNavigationTarget(target);
      }
    },
    [openNavigationTarget, scenarioLiveSignals],
  );

  const rawSelectedCategory =
    selectedNavKey === FALLBACK_NAV_KEY || selectedNavKey === TODAY_NAV_KEY
      ? null
      : categoryByKey(displayCategories, selectedNavKey);
  const selectedCategory = rawSelectedCategory && (failedSignalKeys.includes(rawSelectedCategory.key) || staleSignalKeys.includes(rawSelectedCategory.key)) ? { ...rawSelectedCategory, status: failedSignalKeys.includes(rawSelectedCategory.key) ? "failed" : "stale" } : rawSelectedCategory;
  const demoSnapshotCheckedAt = publicDashboard?.checked_at
    ? formatTimestamp(publicDashboard.checked_at, "dateTime", languageMode, platformTimezone)
    : null;

  const {
    todayBrief,
    signalSystemTiles,
  } = useTodayBrief({
    publicDashboard,
    visibleOverview,
    displayCategories,
    sources,
    recentEvents,
    recentEventCandidates,
    weather,
    airQuality,
    transit,
    roadRail,
    householdEnergy,
    systemEnergy: energy,
    language: languageMode,
    selectedCity,
    eventReferenceAt,
    isHistorical,
    isDemo: appEnv.demoMode,
  });

  const {
    primaryVisibleCategories,
    catalogVisibleCategories,
    recentNotificationCount,
    recentNotificationTone,
  } = buildSignalView({
    categoryEvents: publicDashboard?.decision?.category_events,
    selectedCategory,
    displayCategories,
    categories,
    recentEvents,
    searchValue,
    language: languageMode,
    readRecentEventIds,
    selectedCity,
    eventReferenceAt,
    tKey,
  });

  const eventById = useMemo(() => {
    const events = [
      ...recentEvents,
      ...displayCategories.flatMap((category) => category.events),
    ];
    return new Map(events.map((event) => [event.id, event]));
  }, [displayCategories, recentEvents]);
  const selectedEvent = selectedEventId ? (eventById.get(selectedEventId) ?? null) : null;

  const workspaceRoute = workspaceRouteForCategory(selectedCategory?.key);
  const isDetailPage = workspaceRoute !== null;

  useEventAnchorScroll(highlightedEventId, isDetailPage);
  const showsWorkspaceTopbar =
    isDetailPage ||
    selectedNavKey === FALLBACK_NAV_KEY ||
    selectedNavKey === TODAY_NAV_KEY;
  const showInlineDataError = Boolean(
    error && (visibleOverview || selectedNavKey === TODAY_NAV_KEY),
  );
  const localizedPlatformError = platformErrorMessage(error, tKey);

  function selectNavItem(item: NavItem): void {
    selectNav(item.categoryKey ?? item.key);
    closeMobileMenu();
  }

  function prefetchNavItem(item: NavItem): void {
    prefetchNavView(item.categoryKey ?? item.key);
  }

  function openRecentEventsPanel(): void {
    setSelectedEventId(null);
    setIsEventsExpanded((expanded) => !expanded);
  }

  function restoreRecentEventsFocus(): void {
    window.requestAnimationFrame(() => {
      const trigger = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".notification-button"),
      ).find((element) => element.getClientRects().length > 0 && !element.disabled);
      trigger?.focus();
    });
  }

  function closeEventDetail(): void {
    setSelectedEventId(null);
    restoreEventDetailTriggerFocus();
  }

  function selectRecentEvent(event: PlatformEvent, trigger: HTMLButtonElement): void {
    if (selectedEventId === event.id) {
      closeEventDetail();
      return;
    }

    eventDetailTriggerRef.current = trigger;
    setSelectedEventId(event.id);
  }

  function openRecentEvent(event: PlatformEvent): void {
    const target = eventTarget(event);
    const resolvedNavKey = resolveNavKey(target.navKey, categories);
    markRecentEventRead(event.id);
    setSearchValue("");
    setIsEventsExpanded(false);
    setSelectedEventId(null);

    if (resolvedNavKey === MOBILITY_NAV_KEY) {
      setSelectedMobilityTab(target.mobilityTab ?? selectedMobilityTab);
    }
    setSelectedNavKey(resolvedNavKey);
    const nextParams = buildNavigationQueryParams(
      new URLSearchParams(searchParams.toString()),
      resolvedNavKey,
      {
        mobilityTab: target.mobilityTab,
        energyTab: selectedEnergyTab,
        eventId: eventNavigationId(event),
      },
      { mobilityTab: selectedMobilityTab, energyTab: selectedEnergyTab },
    );

    const nextPath = nextParams.toString();
    const currentPath = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    const destinationPath = nextPath ? `${pathname}?${nextPath}` : pathname;
    if (destinationPath === currentPath) {
      return;
    }

    router.push(destinationPath);
  }

  function renderSignalCard(rawCategory: PlatformCategory) {
    const category = failedSignalKeys.includes(rawCategory.key) || staleSignalKeys.includes(rawCategory.key) ? { ...rawCategory, status: failedSignalKeys.includes(rawCategory.key) ? "failed" : "stale" } : rawCategory;
    return (
      <SignalCard
        airQuality={airQuality}
        category={category}
        energy={energy}
        householdEnergy={householdEnergy}
        history={history}
        key={category.key}
        language={languageMode}
        date={historicalDate}
        onAsk={requestAssistant}
        onSelect={() => {
          if (["failed", "stale", "error"].includes(category.status)) {
            const params = buildNavigationQueryParams(currentSearchParams(searchParams), "sources", {}, { mobilityTab: selectedMobilityTab, energyTab: selectedEnergyTab });
            const source = category.sources.find((item) => ["failed", "failing", "stale"].includes(item.operational_status)) ?? category.sources[0];
            if (source) params.set("source", source.source_code);
            router.push(`/?${params}`);
          } else selectNav(category.key);
        }}
        platformTimezone={platformTimezone}
        regionalScopeLabel={tKey("shell.regionalScope")}
        roadRail={roadRail}
        selectedCity={selectedCity}
        transit={transit}
        weather={weather}
      />
    );
  }

  const shellClassName = dashboardShellClassName(
    workspaceMode,
    isSideNavHidden,
  );
  const sideNavClassName = dashboardSideNavClassName(
    isDetailPage,
    isMobileMenuOpen,
    isSideNavHidden,
  );
  const restoreSideNavButton = isSideNavHidden ? (
    <SideNavRestoreButton onShow={() => collapseSidebar(false)} />
  ) : null;
  const scopeControlProps = {
    availability: historyAvailability?.days ?? [],
    city: selectedCity,
    date: selectedDate,
    isAuthenticated,
    isDemo: appEnv.demoMode,
    // The router transition ends before the new scope's data arrives; keep the
    // control in its pending state until the placeholder is replaced.
    isCityPending: isScopePending,
    isDatePending: isScopePending,
    isEventsExpanded,
    isHistorical,
    isRefreshing,
    language: languageMode,
    notificationCount: recentNotificationCount,
    notificationTone: recentNotificationTone,
    onToggleTheme: toggleThemeMode,
    onCalendarOpen: requestHistoryAvailability,
    onCityChange: selectCity,
    onDateChange: selectDate,
    onLanguageChange: selectLanguageMode,
    onNotificationsClick: openRecentEventsPanel,
    onRefresh: triggerDataRefresh,
    themeMode,
    showExport: workspaceMode === "data" && !appEnv.demoMode,
    checkedAt: visibleOverview?.checked_at,
    sourceWarning: (visibleOverview?.source_health?.issues ?? 0) > 0 || failedSignalKeys.length > 0 || staleSignalKeys.length > 0,
    renderAuthActionButton,
  };
  useEffect(() => {
    try { setIsSideNavHidden(localStorage.getItem("arkiwatch-sidebar-collapsed") === "true"); } catch { /* Navigation works without storage. */ }
  }, []);
  const collapseSidebar = (hidden: boolean) => {
    setIsSideNavHidden(hidden);
    try { localStorage.setItem("arkiwatch-sidebar-collapsed", String(hidden)); } catch { /* Optional preference. */ }
  };
  const hasPersonalContext = Boolean(personalDashboard?.today?.cards.length || (personalDashboard?.onboarding_completion_percent ?? 0) > 0);
  const mobileNavItems = useMemo(() => mobileNavigationItems(categories, hasPersonalContext || selectedNavKey === TODAY_NAV_KEY), [categories, hasPersonalContext, selectedNavKey]);

  // The overview streams in after the shell, so the first paint shows a
  // skeleton rather than empty workspaces. Only the first paint: once anything
  // has rendered it stays mounted, which keeps a failed retry's own retry
  // button on screen and focused. Sits after every hook to fix hook order.
  if (isPending && !hasRenderedPlatformStateRef.current) {
    return (
      <I18nProvider language={languageMode} messages={languageMode === initialLanguage ? messages : undefined}>
        <PlatformSkeleton loadingLabel={tKey("shell.loadingDashboard")} />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={languageMode} messages={languageMode === initialLanguage ? messages : undefined}>
      <a className="skip-link" href="#main-content">
        {tKey("shell.skipToMainContent")}
      </a>
      <div
        className={shellClassName}
        data-workspace-mode={workspaceMode}
      >
        <DataPlatformSideNav
          categories={categories}
          className={sideNavClassName}
          city={selectedCity}
          currentUserLabel={currentUserLabel}
          date={selectedDate}
          isAuthenticated={isAuthenticated}
          isHistorical={isHistorical}
          isAssistantOpen={assistantIsModal}
          isMobileMenuOpen={isMobileMenuOpen}
          isRefreshing={isRefreshing}
          showPlan={Boolean(personalDashboard?.today?.cards.length || (personalDashboard?.onboarding_completion_percent ?? 0) > 0) || selectedNavKey === TODAY_NAV_KEY}
          navBadges={{
            today: todayBrief?.topActions.length ?? 0,
            mobility: mobilityCategory?.events.length ?? 0,
          }}
          navigationRef={mobileNavigationRef}
          onHide={() => {
            if (isMobileMenuOpen) {
              closeMobileMenu();
            } else {
              collapseSidebar(!isSideNavHidden);
            }
          }}
          onPrefetchNavItem={prefetchNavItem}
          onRefresh={triggerDataRefresh}
          onSelectNavItem={selectNavItem}
          renderAuthActionButton={renderAuthActionButton}
          showExport={workspaceMode === "data" && !appEnv.demoMode}
          selectedNavKey={selectedNavKey}
          themeMode={themeMode}
          onToggleTheme={toggleThemeMode}
          language={languageMode}
          onLanguageChange={selectLanguageMode}
        />
        {isMobileMenuOpen ? (
          <DataPlatformSideNavBackdrop onClose={() => closeMobileMenu()} />
        ) : null}

        <div
          aria-hidden={isMobileMenuOpen || assistantIsModal ? "true" : undefined}
          className="dashboard-app"
          ref={dashboardAppRef}
        >
          <DataPlatformMobileHeader
            {...scopeControlProps}
            isDetailPage={isDetailPage}
            isMobileMenuOpen={isMobileMenuOpen}
            selectedNavKey={selectedNavKey}
            onBackToOverview={() => selectNav(FALLBACK_NAV_KEY)}
            navigationButtonRef={mobileNavigationButtonRef}
            onSearchChange={setSearchValue}
            onOpenNavigation={() => setIsMobileMenuOpen(true)}
            searchValue={searchValue}
            workspaceMode={workspaceMode}
          />

          {showsWorkspaceTopbar ? (
            <DataPlatformWorkspaceTopbar
              {...scopeControlProps}
              assistantButtonRef={assistantTopbarButtonRef}
              isDetailPage={isDetailPage}
              onOpenAssistant={requestAssistant}
              onSelectNav={selectNav}
              restoreSideNavButton={restoreSideNavButton}
              selectedNavKey={selectedNavKey}
              workspaceMode={workspaceMode}
            />
          ) : null}

          <main
            id="main-content"
            ref={mainContentRef}
            tabIndex={0}
            className={
              isDetailPage
                ? "dashboard-content detail-content-shell"
                : "dashboard-content"
            }
          >
            <ShellNotices
              historicalDate={isHistorical ? historicalDate : null}
              timeScope={activeTimeScope}
              onReturnToLive={() => selectDate(null)}
              isDemo={appEnv.demoMode}
              isDetailPage={isDetailPage}
              demoCitySupported={demoCitySupported}
              demoSnapshotCheckedAt={demoSnapshotCheckedAt}
              selectedCity={selectedCity}
              isScopePending={isScopePending}
              refreshError={refreshError}
              onDismissRefreshError={() => refreshMutation.reset()}
            />

            <div
              aria-busy={isScopePending}
              className={`dashboard-scope-content${
                isScopePending ? " dashboard-scope-content-pending" : ""
              }`}
              key={selectedNavKey}
              ref={scopeContentRef}
            >
            {showInlineDataError ? (
              <PlatformDataWarning
                hasPartialData={Boolean(visibleOverview)}
                message={localizedPlatformError}
                isRetrying={isLoadingView}
                onRetry={retryPlatformData}
              />
            ) : null}
            {!showsWorkspaceTopbar ? (
              <DataPlatformDesktopHeader
                {...scopeControlProps}
                onSearchChange={setSearchValue}
                restoreSideNavButton={restoreSideNavButton}
                searchValue={searchValue}
                selectedCategory={selectedCategory}
                selectedNavKey={selectedNavKey}
              />
            ) : null}

            {selectedNavKey === TODAY_NAV_KEY ? (
              <PlanWorkspace onEditContext={() => setContextOpen(true)} brief={todayBrief} personal={personalDashboard} error={personalDashboardError} onRetry={retryPersonalDashboard} onOpenAssistant={requestAssistant} onOpenEvent={openRecentEvent} onOpenScenario={openScenario} />
            ) : visibleOverview ? (
              selectedNavKey === "sources" ? <SourcesWorkspace overview={visibleOverview} /> : selectedNavKey === "events" ? <ConsoleEvents timeScope={visibleOverview.time_scope} categories={displayCategories} events={recentEvents} checkedAt={visibleOverview.checked_at} timezone={platformTimezone} highlightedEventId={highlightedEventId} onOpenEvent={openRecentEvent} onAsk={requestAssistant} coverage={visibleOverview.coverage_area} /> : isDetailPage ? (
                <DataPlatformWorkspaceRouter
                  airQuality={airQuality}
                  city={selectedCity}
                  energy={energy}
                  highlightedEventId={highlightedEventId}
                  history={history}
                  householdEnergy={householdEnergy}
                  onAsk={requestAssistant}
                  onEnergyPanelChange={selectEnergyTab}
                  onMobilityTabChange={selectMobilityTab}
                  overview={visibleOverview}
                  roadRail={roadRail}
                  roadRailCategory={roadRailCategory}
                  route={workspaceRoute}
                  selectedCategory={selectedCategory}
                  selectedEnergyTab={selectedEnergyTab}
                  selectedMobilityTab={selectedMobilityTab}
                  transit={transit}
                  transitCategory={transitCategory}
                  weather={weather}
                />
              ) : (
                <DataPlatformOverview
                  catalogSignalCards={catalogVisibleCategories.map(renderSignalCard)}
                  catalogSignalCount={catalogVisibleCategories.length}
                  checkedAt={visibleOverview.checked_at}
                  coreSignalCards={
                    primaryVisibleCategories.length > 0
                      ? [...primaryVisibleCategories]
                          .sort((left, right) => outingSignalRank(left.key) - outingSignalRank(right.key))
                          .map(renderSignalCard)
                      : null
                  }
                  coreSignalCount={primaryVisibleCategories.length}
                  onOpenToday={() => selectNav(TODAY_NAV_KEY)}
                  onSearchChange={setSearchValue}
                  overview={visibleOverview}
                  platformTimezone={platformTimezone}
                  searchValue={searchValue}
                  signalSystemTiles={signalSystemTiles}
                  todayBrief={todayBrief}
                  events={recentEvents}
                  onOpenEvent={openRecentEvent}
                  onSelectNav={selectNav}
                  onOpenScenario={openScenario}
                  onOpenAssistant={requestAssistant}
                  personalDashboard={personalDashboard}
                  onEditContext={() => setContextOpen(true)}
                  trendSeries={displayCategories.filter((c) => ["weather", "air", "energy"].includes(c.key)).map((c) => ({ key: c.key, label: tKey(`shell.${c.key === "weather" ? "navWeather" : c.key === "air" ? "navAirQuality" : "navEnergy"}`), points: signalTrend(c, { weather, airQuality, energy, householdEnergy, history, referenceAt: visibleOverview.checked_at, timeScope: visibleOverview.time_scope }, languageMode, platformTimezone), unit: c.key === "weather" ? "°C" : null }))}

                />
              )
            ) : (
              <PlatformUnavailable
                message={localizedPlatformError}
                isRetrying={isLoadingView}
                onRetry={retryPlatformData}
                apiBaseUrl={apiBaseUrl}
                userId={defaultUserId ?? resolvedUserId ?? null}
              />
            )}
            </div>
          </main>

          <MobileBottomNav
            assistantButtonRef={assistantNavButtonRef}
            isScopePending={isScopePending}
            items={mobileNavItems}
            onOpenAssistant={requestAssistant}
            onSelectNavItem={selectNavItem}
            selectedNavKey={selectedNavKey}
            onOpenNavigation={() => setIsMobileMenuOpen(true)}
          />
        </div>
        {visibleOverview ? (
          <RecentEventsPanel
            categories={categories}
            checkedAt={visibleOverview.checked_at}
            city={selectedCity}
            eventDetailCloseRef={eventDetailCloseRef}
            eventReferenceAt={eventReferenceAt}
            isExpanded={isEventsExpanded}
            onCloseEventDetail={closeEventDetail}
            onMarkEventRead={markRecentEventRead}
            onOpenEvent={openRecentEvent}
            onSelectEvent={selectRecentEvent}
            onToggleExpanded={() => {
              setIsEventsExpanded(false);
              setSelectedEventId(null);
              restoreRecentEventsFocus();
            }}
            platformTimezone={platformTimezone}
            readRecentEventIds={readRecentEventIds}
            selectedEvent={selectedEvent}
            timeScope={visibleOverview.time_scope}
            visibleEvents={recentEvents}
          />
        ) : null}
        <Drawer open={contextOpen} title={tKey(hasPersonalContext || selectedNavKey === TODAY_NAV_KEY ? "shell.editContext" : "shell.addContext")} onClose={() => setContextOpen(false)}>{isAuthenticated ? <PersonalSettingsPage compact onSaved={() => { void retryPersonalDashboard(); }} /> : <a className="console-button console-button-primary" href="/login">{tKey("shell.adminSignIn")}</a>}</Drawer>
        <CommandPalette categories={displayCategories} events={recentEvents} onSelectNav={selectNav} onSelectCity={selectCity} onOpenEvent={openRecentEvent} onAsk={requestAssistant} />
        <AssistantWidget
          city={selectedCity}
          date={historicalDate}
          overview={overview}
          language={languageMode}
          mode={workspaceMode}
          scopeKey={selectedNavKey}
          focusReturnRefs={assistantFocusReturnRefs}
          onOpenChange={setIsAssistantOpen}
          openRequest={assistantOpenRequest}
          openQuestion={assistantOpenQuestion}
          scopePending={isScopePending}
          onOpenView={openAssistantView}
          userId={defaultUserId ?? resolvedUserId}
        />
      </div>
    </I18nProvider>
  );
}
