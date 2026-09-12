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
  cityLabel,
  normalizeCityValue,
} from "./city-scope";
import { localizedContent } from "./content-localization";
import {
  HistoricalWarningBanner,
  RefreshErrorBanner,
} from "./data-platform-shell";
import type { NavItem, WorkspaceMode } from "./data-platform-shell";
import {
  DataPlatformSideNav,
  DataPlatformSideNavBackdrop,
} from "./data-platform-side-nav";
import {
  DataPlatformDesktopHeader,
  DataPlatformMobileHeader,
  DataPlatformWorkspaceTopbar,
  SideNavRestoreButton,
} from "./data-platform-topbars";
import {
  I18nProvider,
  translateMessageKey,
} from "./i18n";
import { usePlatformHome } from "./hooks/use-platform-home";
import { usePlatformNavPrefetch } from "./hooks/use-platform-prefetch";
import { usePersonalDashboard } from "./hooks/use-personal-dashboard";
import { PlatformSkeleton } from "./platform-skeleton";
import { useClientPreferences } from "./hooks/use-client-preferences";
import {
  CROSS_TIMELINE_LIMIT,
  EVENT_QUERY_KEY,
  FALLBACK_NAV_KEY,
  NAV_QUERY_KEY,
  TODAY_NAV_KEY,
  buildNavigationQueryParams,
  categoryByKey,
  isCatalogCategoryKey,
  mobileNavigationItems,
  resolveNavKey,
} from "./data-platform-nav-utils";
import { useEventAnchorScroll } from "./hooks/use-event-anchor-scroll";
import { useScopeRouting } from "./hooks/use-scope-routing";
import { useShellFocus } from "./hooks/use-shell-focus";
import { useVisibleOverview } from "./hooks/use-visible-overview";
import { useRefreshPlatformData, useSignOut } from "./queries/platform-actions";
import type { PlatformCategory, PlatformEvent } from "./types";
import {
  curatedRecentEvents,
  eventNavigationId,
  eventTarget,
  RECENT_EVENT_LIMIT,
} from "./recent-events";
import type { MobilityTabKey } from "./mobility-workspace";
import {
  resolveScenarioTarget,
  resolveSummaryTileTarget,
} from "./scenario-navigation";
import { buildCrossDomainTimeline } from "./cross-domain-timeline";
import { TodayOverview } from "./today/today-overview";
import type { ScenarioLiveSignals } from "./scenario-live-hints";
import {
  DataPlatformWorkspaceRouter,
  workspaceRouteForCategory,
} from "./data-platform-workspace-router";
import { SignalCard } from "./signal-card";
import {
  dashboardShellClassName,
  dashboardSideNavClassName,
} from "./data-platform-layout";
import { buildSignalSystemTiles } from "./signals-console";
import { DataPlatformOverview } from "./data-platform-overview";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { RecentEventsPanel } from "./recent-events-panel";
import { DEMO_CITY } from "./demo/demo-data";
import { SourceHealthStrip } from "./source-health-strip";
import { sourceIssueCountForScope } from "./source-health";
import { platformErrorMessage } from "./platform-error";
import { isEmptyStatus } from "./platform-status";
import { buildTodayBrief, todayBriefEvaluationTime } from "./today/today-brief";
import { useDocumentTitle } from "@/features/shared/use-document-title";
import { buildUserSummaryTiles } from "./user-summary-stats";
import {
  ENERGY_TAB_QUERY_KEY,
  MOBILITY_TAB_QUERY_KEY,
  resolveEnergyTabParam,
  resolveMobilityTabParam,
  type EnergyPanelKey,
} from "./workspace-query-params";
import {
  MOBILITY_NAV_KEY,
  recentEventLabel,
  displayTitle,
  eventCategoryLabel,
  eventMatchesSearch,
  isMobilityCategoryKey,
  isNotificationEvent,
  matchesSearch,
  notificationToneForEvents,
  pickPriorityEvent,
} from "./data-platform-view-model";
// Floating overlay, never part of the first paint: keep it out of the route bundle.
const AssistantWidget = dynamic(
  () =>
    import("@/features/assistant-widget/assistant-widget").then(
      (module) => module.AssistantWidget,
    ),
  { ssr: false },
);

type DataPlatformHomeProps = {
  currentUserLabel: string;
  defaultUserId?: string;
  initialCity: string;
  initialDate: string | null;
  initialView: string | null;
  isAuthenticated: boolean;
};

export function DataPlatformHome({
  currentUserLabel,
  defaultUserId,
  initialCity,
  initialDate,
  initialView,
  isAuthenticated,
}: DataPlatformHomeProps) {
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
  } = useClientPreferences();
  const [searchValue, setSearchValue] = useState("");
  const [isEventsExpanded, setIsEventsExpanded] = useState(false);
  const [isCatalogExpanded, setIsCatalogExpanded] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
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
    isAssistantOpen,
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
      workspaceMode === "today" &&
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
    if (isRefreshing || !isAuthenticated || refreshMutation.isPending) {
      return;
    }

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
    const nextRequestedKey = searchParams.get(NAV_QUERY_KEY);
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
  }, [categories, searchParams, setSelectedEnergyTab, setSelectedMobilityTab, setSelectedNavKey]);

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

  const openSummaryTile = useCallback(
    (tileKey: string): void => {
      const target = resolveSummaryTileTarget(tileKey, scenarioLiveSignals);
      if (target) {
        openNavigationTarget(target);
      }
    },
    [openNavigationTarget, scenarioLiveSignals],
  );

  const selectedCategory =
    selectedNavKey === FALLBACK_NAV_KEY || selectedNavKey === TODAY_NAV_KEY
      ? null
      : categoryByKey(displayCategories, selectedNavKey);
  const userSummaryTiles = useMemo(
    () =>
      buildUserSummaryTiles(
        {
          weather,
          airQuality,
          transit,
          roadRail,
          householdEnergy,
          systemEnergy: energy,
        },
        languageMode,
      ),
    [airQuality, energy, householdEnergy, languageMode, roadRail, transit, weather],
  );
  const crossDomainTimeline = useMemo(
    () =>
      buildCrossDomainTimeline(
        curatedRecentEvents(recentEventCandidates, CROSS_TIMELINE_LIMIT, {
          city: selectedCity,
          referenceAt: eventReferenceAt,
        }),
        publicDashboard,
        CROSS_TIMELINE_LIMIT,
        eventReferenceAt,
      ),
    [eventReferenceAt, publicDashboard, recentEventCandidates, selectedCity],
  );
  const demoSnapshotCheckedAt = publicDashboard?.checked_at
    ? formatTimestamp(publicDashboard.checked_at, "dateTime", languageMode, platformTimezone)
    : null;
  const todayEvaluationTime = todayBriefEvaluationTime(appEnv.demoMode, eventReferenceAt);
  const todayBrief = useMemo(
    () =>
      buildTodayBrief({
        publicDashboard,
        overviewCoverageArea: visibleOverview?.coverage_area,
        isHistorical,
        summaryTiles: userSummaryTiles,
        timelineItems: crossDomainTimeline,
        language: languageMode,
        now: todayEvaluationTime,
      }),
    [
      crossDomainTimeline,
      isHistorical,
      languageMode,
      publicDashboard,
      todayEvaluationTime,
      userSummaryTiles,
      visibleOverview,
    ],
  );
  const todaySourceIssueCount = useMemo(
    () => sourceIssueCountForScope(visibleOverview?.sources ?? [], isHistorical),
    [isHistorical, visibleOverview],
  );
  const signalSystemTiles = useMemo(
    () =>
      buildSignalSystemTiles({
        overview: visibleOverview,
        categories: displayCategories,
        sources,
        recentEvents,
        language: languageMode,
      }),
    [displayCategories, languageMode, recentEvents, sources, visibleOverview],
  );
  const selectedCategories = selectedCategory ? [selectedCategory] : displayCategories;
  const visibleCategories = selectedCategories.filter((category) =>
    matchesSearch(category, searchValue, languageMode),
  );
  const primaryVisibleCategories = visibleCategories.filter(
    (category) =>
      !isCatalogCategoryKey(category.key) && !isEmptyStatus(category.status),
  );
  const catalogVisibleCategories = visibleCategories.filter((category) =>
    isCatalogCategoryKey(category.key),
  );
  const visibleEvents = (
    selectedCategory
      ? curatedRecentEvents(selectedCategory.events, RECENT_EVENT_LIMIT, {
          city: selectedCity,
          referenceAt: eventReferenceAt,
        })
      : recentEvents
  ).filter((event) => eventMatchesSearch(event, searchValue, languageMode));
  const unreadVisibleEvents = visibleEvents.filter(
    (event) => !readRecentEventIds.has(event.id),
  );
  const latestVisibleEvent = visibleEvents[0] ?? null;
  const latestUnreadEvent = unreadVisibleEvents[0] ?? latestVisibleEvent;
  const visibleNotificationEvents = visibleEvents.filter(isNotificationEvent);
  const latestEventTone = notificationToneForEvents(
    unreadVisibleEvents.length > 0 ? unreadVisibleEvents : visibleNotificationEvents,
  );
  const unreadRecentEvents = recentEvents.filter(
    (event) => !readRecentEventIds.has(event.id),
  );
  const recentNotificationCount = unreadRecentEvents.length;
  const recentNotificationTone = notificationToneForEvents(unreadRecentEvents);
  const eventById = useMemo(() => {
    const events = [
      ...recentEvents,
      ...displayCategories.flatMap((category) => category.events),
    ];
    return new Map(events.map((event) => [event.id, event]));
  }, [displayCategories, recentEvents]);
  const selectedEvent = selectedEventId
    ? (eventById.get(selectedEventId) ?? null)
    : null;
  const priorityVisibleEvent = pickPriorityEvent(visibleNotificationEvents);
  const overallScopeLabel = selectedCategory
    ? displayTitle(selectedCategory, languageMode)
    : tKey("shell.overall");
  const overallNotificationTitle =
    visibleNotificationEvents.length > 0
      ? `${overallScopeLabel} · ${recentEventLabel(
          visibleNotificationEvents.length,
          languageMode,
        )}`
      : `${overallScopeLabel} · ${tKey("shell.noActiveNotifications")}`;
  const overallNotificationBody = priorityVisibleEvent
    ? `${eventCategoryLabel(categories, priorityVisibleEvent, languageMode)} · ${localizedContent(
        languageMode,
        priorityVisibleEvent.title,
        priorityVisibleEvent.title_zh,
      )}`
    : tKey("shell.noActiveCrossSignalNotificationsInThisView");
  const overallNotificationDetail =
    (priorityVisibleEvent
      ? localizedContent(
          languageMode,
          priorityVisibleEvent.body,
          priorityVisibleEvent.body_zh,
        )
      : null) ??
    tKey("shell.recentEventsRemainAvailableBelowForSourceLevelInspection");
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
    if (selectedNavKey === FALLBACK_NAV_KEY && isEventsExpanded) {
      setIsEventsExpanded(false);
    } else {
      selectNav(FALLBACK_NAV_KEY);
      setSearchValue("");
      setIsEventsExpanded(true);
      if (window.matchMedia("(min-width: 1024px)").matches) {
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLElement>(".events-panel-expanded")?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
            block: "start",
            inline: "nearest",
          });
        });
      }
    }
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

  function renderSignalCard(category: PlatformCategory) {
    return (
      <SignalCard
        airQuality={airQuality}
        category={category}
        energy={energy}
        householdEnergy={householdEnergy}
        key={category.key}
        language={languageMode}
        onSelect={() => selectNav(category.key)}
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
    <SideNavRestoreButton onShow={() => setIsSideNavHidden(false)} />
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
    renderAuthActionButton,
  };
  const mobileNavItems = useMemo(() => mobileNavigationItems(categories), [categories]);

  // The overview streams in after the shell, so the first paint shows a
  // skeleton rather than empty workspaces. Only the first paint: once anything
  // has rendered it stays mounted, which keeps a failed retry's own retry
  // button on screen and focused. Sits after every hook to fix hook order.
  if (isPending && !hasRenderedPlatformStateRef.current) {
    return (
      <I18nProvider language={languageMode}>
        <PlatformSkeleton loadingLabel={tKey("shell.loadingDashboard")} />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={languageMode}>
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
          isAssistantOpen={isAssistantOpen}
          isMobileMenuOpen={isMobileMenuOpen}
          isRefreshing={isRefreshing}
          navBadges={{
            today: todayBrief?.topActions.length ?? 0,
            mobility: mobilityCategory?.events.length ?? 0,
          }}
          navigationRef={mobileNavigationRef}
          onHide={() => {
            if (isMobileMenuOpen) {
              closeMobileMenu();
            } else {
              setIsSideNavHidden(true);
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
          aria-hidden={isMobileMenuOpen || isAssistantOpen ? "true" : undefined}
          className="dashboard-app"
          ref={dashboardAppRef}
        >
          <DataPlatformMobileHeader
            {...scopeControlProps}
            isDetailPage={isDetailPage}
            isMobileMenuOpen={isMobileMenuOpen}
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
            {isHistorical && historicalDate ? (
              <HistoricalWarningBanner
                date={historicalDate}
                language={languageMode}
                onReturnToLive={() => selectDate(null)}
                timeScope={activeTimeScope}
              />
            ) : null}
            {appEnv.demoMode && !isDetailPage ? (
              <div className="demo-mode-banner" role="status">
                <span className="material-symbols-outlined" aria-hidden="true">
                  database
                </span>
                <span className="demo-mode-banner-copy">
                  <span>
                    {tKey(demoCitySupported ? "shell.demoModeNotice" : "shell.demoModeCityLimited").replace(
                      "{city}",
                      cityLabel(selectedCity),
                    )}
                  </span>
                  {demoSnapshotCheckedAt ? (
                    <time>
                      {tKey("shell.demoSnapshotCheckedAt").replace(
                        "{checkedAt}",
                        demoSnapshotCheckedAt,
                      )}
                    </time>
                  ) : null}
                </span>
                <a className="demo-mode-banner-link" href="/about">
                  {tKey("shell.aboutArkiWatch")}
                  <span aria-hidden="true"> →</span>
                </a>
              </div>
            ) : null}
            {isScopePending ? (
              <div className="scope-pending-banner" role="status" aria-live="polite">
                <span className="material-symbols-outlined" aria-hidden="true">
                  sync
                </span>
                <span className="scope-pending-banner-copy">
                  <strong>{tKey("shell.scopeUpdating")}</strong>
                  <span>
                    {tKey("shell.scopeUpdatingDetail").replace(
                      "{scope}",
                      cityLabel(selectedCity),
                    )}
                  </span>
                </span>
              </div>
            ) : null}
            {refreshError ? (
              <RefreshErrorBanner
                error={refreshError}
                language={languageMode}
                onDismiss={() => refreshMutation.reset()}
              />
            ) : null}
            <div
              aria-busy={isScopePending}
              className={`dashboard-scope-content${
                isScopePending ? " dashboard-scope-content-pending" : ""
              }`}
              ref={scopeContentRef}
            >
            {showInlineDataError ? (
              <div className="platform-inline-warning" role="alert">
                <span className="material-symbols-outlined" aria-hidden="true">
                  warning
                </span>
                <span className="platform-inline-warning-copy">
                  <strong>
                    {visibleOverview
                      ? tKey("shell.partialDataWarning")
                      : tKey("shell.dataUnavailableWarning")}
                  </strong>
                  <span>{localizedPlatformError}</span>
                </span>
                <button
                  className="platform-inline-warning-action"
                  disabled={isLoadingView}
                  onClick={retryPlatformData}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    refresh
                  </span>
                  {isLoadingView ? tKey("shell.retrying") : tKey("shell.retryData")}
                </button>
              </div>
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
              <TodayOverview
                isHistorical={isHistorical}
                isScopePending={isScopePending}
                language={languageMode}
                liveSignals={scenarioLiveSignals}
                now={todayEvaluationTime}
                planItems={todayBrief?.planItems ?? []}
                personalDashboard={personalDashboard}
                personalDashboardError={personalDashboardError}
                sourceIssueCount={todaySourceIssueCount}
                todayBrief={todayBrief}
                onOpenAssistant={requestAssistant}
                onOpenSettings={() => router.push("/settings")}
                onOpenEvent={openRecentEvent}
                onOpenSignals={() => selectNav(FALLBACK_NAV_KEY)}
                onOpenScenario={openScenario}
                onOpenSummaryTile={openSummaryTile}
                onRetryPersonalDashboard={retryPersonalDashboard}
              />
            ) : visibleOverview ? (
              isDetailPage ? (
                <DataPlatformWorkspaceRouter
                  airQuality={airQuality}
                  energy={energy}
                  highlightedEventId={highlightedEventId}
                  history={history}
                  householdEnergy={householdEnergy}
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
                      ? primaryVisibleCategories.map(renderSignalCard)
                      : null
                  }
                  coreSignalCount={primaryVisibleCategories.length}
                  isCatalogExpanded={isCatalogExpanded}
                  isHistorical={isHistorical}
                  onCatalogToggle={setIsCatalogExpanded}
                  onOpenToday={() => selectNav(TODAY_NAV_KEY)}
                  onSearchChange={setSearchValue}
                  overview={visibleOverview}
                  platformTimezone={platformTimezone}
                  searchValue={searchValue}
                  signalSystemTiles={signalSystemTiles}
                  todayBrief={todayBrief}
                  sourceHealth={
                    !isHistorical ? (
                      <SourceHealthStrip overview={visibleOverview} />
                    ) : null
                  }
                  secondaryContent={
                    <RecentEventsPanel
                      categories={categories}
                      checkedAt={visibleOverview.checked_at}
                      city={selectedCity}
                      eventDetailCloseRef={eventDetailCloseRef}
                      eventReferenceAt={eventReferenceAt}
                      isExpanded={isEventsExpanded}
                      latestEventTone={latestEventTone}
                      latestUnreadEvent={latestUnreadEvent}
                      onCloseEventDetail={closeEventDetail}
                      onMarkEventRead={markRecentEventRead}
                      onOpenEvent={openRecentEvent}
                      onSelectEvent={selectRecentEvent}
                      onToggleExpanded={() => {
                        if (isEventsExpanded) {
                          restoreRecentEventsFocus();
                        }
                        setIsEventsExpanded(!isEventsExpanded);
                      }}
                      platformTimezone={platformTimezone}
                      readRecentEventIds={readRecentEventIds}
                      selectedEvent={selectedEvent}
                      selectedEventId={selectedEventId}
                      timeScope={visibleOverview.time_scope}
                      unreadVisibleEvents={unreadVisibleEvents}
                      visibleEvents={visibleEvents}
                      visibleNotificationEvents={visibleNotificationEvents}
                      overallNotification={{
                        body: overallNotificationBody,
                        detail: overallNotificationDetail,
                        title: overallNotificationTitle,
                      }}
                    />
                  }
                />
              )
            ) : (
              <section
                className="platform-error"
                aria-label={tKey("shell.platformUnavailable")}
              >
                <span>{tKey("shell.platformUnavailable")}</span>
                <h1>{tKey("shell.dataPlatformCouldNotLoad")}</h1>
                <p>{localizedPlatformError}</p>
                <div className="platform-error-actions">
                  <button
                    className="platform-error-retry"
                    disabled={isLoadingView}
                    onClick={retryPlatformData}
                    type="button"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      refresh
                    </span>
                    {isLoadingView ? tKey("shell.retrying") : tKey("shell.retryData")}
                  </button>
                </div>
                <small>
                  {tKey("shell.apiEndpoint")}: {apiBaseUrl}
                  {defaultUserId || resolvedUserId
                    ? ` · ${tKey("shell.userContext")}: ${defaultUserId ?? resolvedUserId}`
                    : ""}
                </small>
              </section>
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
          />
        </div>
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
