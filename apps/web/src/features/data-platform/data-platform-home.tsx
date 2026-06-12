"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  formatTimestamp,
  severityTone,
} from "@/features/shared/format";
import { appEnv } from "@/lib/env";

import "./data-platform.css";

import { categoryVisibleToCurrentUser } from "./category-access";
import {
  categorySupportsCityScope,
  cityLabel,
  normalizeCityValue,
} from "./city-scope";
import { localizedContent } from "./content-localization";
import { DataLabelWithHelp, dataHelpText } from "./data-help";
import {
  HistoricalWarningBanner,
  PRIMARY_NAV_ITEMS,
  saveCityValue,
  storedCityValue,
} from "./data-platform-shell";
import type { DashboardTone, NavItem, WorkspaceMode } from "./data-platform-shell";
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
import { PlatformSkeleton } from "./platform-skeleton";
import { useClientPreferences } from "./hooks/use-client-preferences";
import {
  CATEGORY_ICONS,
  CROSS_TIMELINE_LIMIT,
  EVENT_QUERY_KEY,
  FALLBACK_NAV_KEY,
  NAV_QUERY_KEY,
  TODAY_NAV_KEY,
  categoryByKey,
  currentSearchParams,
  isCatalogCategoryKey,
  navItemAvailable,
  pathWithParams,
  profileInitials,
  resolveNavKey,
} from "./data-platform-nav-utils";
import { useRefreshPlatformData, useSignOut } from "./queries/platform-actions";
import type { PlatformCategory, PlatformEvent } from "./types";
import {
  buildAirQualityRecentEvents,
  buildWeatherRecentEvents,
  curatedRecentEvents,
  eventAnchorId,
  eventNavigationId,
  eventTarget,
  recentEventDetails,
  RECENT_EVENT_LIMIT,
} from "./recent-events";
import type { MobilityTabKey } from "./mobility-workspace";
import {
  resolveScenarioTarget,
  resolveSummaryTileTarget,
} from "./scenario-navigation";
import { buildCrossDomainTimeline } from "./cross-domain-timeline";
import { CrossDomainTimelinePanel } from "./cross-domain-timeline-panel";
import { TodayOverview } from "./today/today-overview";
import type { ScenarioLiveSignals } from "./scenario-live-hints";
import { DataPlatformWorkspaceRouter } from "./data-platform-workspace-router";
import {
  categorySignalAttribution,
  formatSignalAttributionLine,
} from "./signal-attribution";
import { buildSignalSystemTiles } from "./signals-console";
import { SourceHealthStrip } from "./source-health-strip";
import { buildTodayBrief } from "./today/today-brief";
import { buildUserSummaryTiles } from "./user-summary-stats";
import { viewerStateLabel } from "./viewer-state";
import {
  ENERGY_TAB_QUERY_KEY,
  MOBILITY_TAB_QUERY_KEY,
  resolveEnergyTabParam,
  resolveMobilityTabParam,
  type EnergyPanelKey,
} from "./workspace-query-params";
import {
  MOBILITY_NAV_KEY,
  activeEventLabel,
  attributeLabel,
  buildMobilityCategory,
  displayTitle,
  eventAttributeRows,
  eventCategoryLabel,
  eventTimeLabel,
  eventMatchesSearch,
  isMobilityCategoryKey,
  isNotificationEvent,
  matchesSearch,
  mergeMobilityCategories,
  notificationToneForEvents,
  pickPriorityEvent,
  signalReadout,
  statusLabel,
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
  const [selectedCity, setSelectedCity] = useState(() =>
    normalizeCityValue(initialCity),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialDate ?? null,
  );
  const [assistantOpenRequest, setAssistantOpenRequest] = useState(0);
  const assistantNavButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedNavKey, setSelectedNavKey] = useState(() =>
    resolveNavKey(initialView ?? searchParams.get(NAV_QUERY_KEY), []),
  );
  const [needsHistoryAvailability, setNeedsHistoryAvailability] = useState(
    () => Boolean(initialDate),
  );
  const [selectedMobilityTab, setSelectedMobilityTab] = useState<MobilityTabKey>(
    () =>
      resolveMobilityTabParam(
        searchParams.get(MOBILITY_TAB_QUERY_KEY) ??
          searchParams.get(NAV_QUERY_KEY),
      ),
  );
  const [selectedEnergyTab, setSelectedEnergyTab] = useState<EnergyPanelKey>(() =>
    resolveEnergyTabParam(searchParams.get(ENERGY_TAB_QUERY_KEY)),
  );
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSideNavHidden, setIsSideNavHidden] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const hasMountedRef = useRef(false);
  const [isCityRefreshPending, startCityRefresh] = useTransition();
  const [isDateRefreshPending, startDateRefresh] = useTransition();
  const tKey = (key: string) => translateMessageKey(languageMode, key);
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
  const historicalDate =
    activeTimeScope?.mode === "historical"
      ? activeTimeScope.date ?? selectedDate
      : selectedDate;
  const isHistorical = historicalDate !== null;
  const userStateLabel = viewerStateLabel(
    isAuthenticated,
    appEnv.demoMode,
    languageMode,
  );
  const authActionLabel = isAuthenticated ? tKey("shell.signOut") : tKey("shell.adminSignIn");
  const authActionIcon = isAuthenticated ? "logout" : "login";
  const currentUserInitials = profileInitials(currentUserLabel);

  const isRefreshing = refreshMutation.isPending;
  const workspaceMode: WorkspaceMode =
    selectedNavKey === TODAY_NAV_KEY ? "today" : "data";

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

  const categories = useMemo(
    () =>
      (overview?.categories ?? []).filter((category) =>
        categoryVisibleToCurrentUser(category.key),
      ),
    [overview],
  );
  const transitCategory = useMemo(
    () => categoryByKey(categories, "transit"),
    [categories],
  );
  const roadRailCategory = useMemo(
    () => categoryByKey(categories, "traffic"),
    [categories],
  );
  const mobilityCategory = useMemo(
    () => buildMobilityCategory(categories, transit, roadRail),
    [categories, roadRail, transit],
  );
  const displayCategories = useMemo(
    () => mergeMobilityCategories(categories, mobilityCategory),
    [categories, mobilityCategory],
  );
  const recentEventCandidates = useMemo(
    () =>
      [
        ...buildWeatherRecentEvents(weather, { city: selectedCity }),
        ...buildAirQualityRecentEvents(airQuality),
        ...categories.flatMap((category) => category.events),
        ...(overview?.recent_events ?? []),
      ].filter((event) => categoryVisibleToCurrentUser(event.category_key)),
    [airQuality, categories, overview, selectedCity, weather],
  );
  const recentEvents = useMemo(
    () =>
      curatedRecentEvents(recentEventCandidates, RECENT_EVENT_LIMIT, {
        city: selectedCity,
      }),
    [recentEventCandidates, selectedCity],
  );
  const sources = useMemo(
    () =>
      (overview?.sources ?? []).filter((source) => {
        const sourceCategories = source.categories ?? [];
        return (
          sourceCategories.length === 0 ||
          sourceCategories.some(categoryVisibleToCurrentUser)
        );
      }),
    [overview],
  );
  const visibleOverview = useMemo(
    () =>
      overview
        ? {
            ...overview,
            categories: displayCategories,
            recent_events: recentEvents,
            sources,
          }
        : null,
    [displayCategories, overview, recentEvents, sources],
  );
  const updateNavQuery = useCallback(
    (
      nextNavKey: string,
      options: { mobilityTab?: MobilityTabKey; energyTab?: EnergyPanelKey } = {},
    ): void => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (nextNavKey === TODAY_NAV_KEY) {
        nextParams.delete(NAV_QUERY_KEY);
        nextParams.delete(MOBILITY_TAB_QUERY_KEY);
        nextParams.delete(ENERGY_TAB_QUERY_KEY);
      } else if (nextNavKey === FALLBACK_NAV_KEY) {
        nextParams.set(NAV_QUERY_KEY, FALLBACK_NAV_KEY);
        nextParams.delete(MOBILITY_TAB_QUERY_KEY);
        nextParams.delete(ENERGY_TAB_QUERY_KEY);
      } else if (nextNavKey === MOBILITY_NAV_KEY) {
        nextParams.set(NAV_QUERY_KEY, MOBILITY_NAV_KEY);
        nextParams.set(
          MOBILITY_TAB_QUERY_KEY,
          options.mobilityTab ?? selectedMobilityTab,
        );
        nextParams.delete(ENERGY_TAB_QUERY_KEY);
      } else if (nextNavKey === "energy") {
        nextParams.set(NAV_QUERY_KEY, "energy");
        nextParams.delete(MOBILITY_TAB_QUERY_KEY);
        nextParams.set(ENERGY_TAB_QUERY_KEY, options.energyTab ?? selectedEnergyTab);
      } else {
        nextParams.set(NAV_QUERY_KEY, nextNavKey);
        nextParams.delete(MOBILITY_TAB_QUERY_KEY);
        nextParams.delete(ENERGY_TAB_QUERY_KEY);
      }
      nextParams.delete(EVENT_QUERY_KEY);

      const nextPath = nextParams.toString();
      router.replace(nextPath ? `${pathname}?${nextPath}` : pathname);
    },
    [pathname, router, searchParams, selectedEnergyTab, selectedMobilityTab],
  );
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

  const openNavigationTarget = useCallback(
    (target: {
      navKey: string;
      mobilityTab?: MobilityTabKey;
      energyTab?: EnergyPanelKey;
    }): void => {
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
      setIsMobileMenuOpen(false);
    },
    [categories, selectedEnergyTab, selectedMobilityTab, updateNavQuery],
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

  const selectMobilityTab = useCallback(
    (nextMobilityTab: MobilityTabKey): void => {
      setSelectedMobilityTab(nextMobilityTab);
      setSelectedNavKey(MOBILITY_NAV_KEY);
      updateNavQuery(MOBILITY_NAV_KEY, { mobilityTab: nextMobilityTab });
    },
    [updateNavQuery],
  );

  const selectEnergyTab = useCallback(
    (nextEnergyTab: EnergyPanelKey): void => {
      setSelectedEnergyTab(nextEnergyTab);
      setSelectedNavKey("energy");
      updateNavQuery("energy", { energyTab: nextEnergyTab });
    },
    [updateNavQuery],
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
        }),
        publicDashboard,
        CROSS_TIMELINE_LIMIT,
      ),
    [publicDashboard, recentEventCandidates, selectedCity],
  );
  const signalEventTimeline = useMemo(
    () =>
      buildCrossDomainTimeline(
        curatedRecentEvents(recentEventCandidates, CROSS_TIMELINE_LIMIT, {
          city: selectedCity,
        }),
        null,
        CROSS_TIMELINE_LIMIT,
      ),
    [recentEventCandidates, selectedCity],
  );
  const todayBrief = useMemo(
    () =>
      buildTodayBrief({
        publicDashboard,
        overviewCoverageArea: visibleOverview?.coverage_area,
        isHistorical,
        summaryTiles: userSummaryTiles,
        timelineItems: crossDomainTimeline,
        language: languageMode,
      }),
    [crossDomainTimeline, isHistorical, languageMode, publicDashboard, userSummaryTiles, visibleOverview],
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
    (category) => !isCatalogCategoryKey(category.key),
  );
  const catalogVisibleCategories = visibleCategories.filter((category) =>
    isCatalogCategoryKey(category.key),
  );
  const visibleEvents = (
    selectedCategory
      ? curatedRecentEvents(selectedCategory.events, RECENT_EVENT_LIMIT, {
          city: selectedCity,
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
  const selectedEventRows = selectedEvent ? eventAttributeRows(selectedEvent) : [];
  const priorityVisibleEvent = pickPriorityEvent(visibleNotificationEvents);
  const overallScopeLabel = selectedCategory
    ? displayTitle(selectedCategory, languageMode)
    : tKey("shell.overall");
  const overallNotificationTitle =
    visibleNotificationEvents.length > 0
      ? `${overallScopeLabel} · ${activeEventLabel(
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
  const isWeatherDetail = selectedCategory?.key === "weather";
  const isAirDetail = selectedCategory?.key === "air";
  const isEnergyDetail = selectedCategory?.key === "energy";
  const isMobilityDetail = selectedCategory?.key === MOBILITY_NAV_KEY;
  const isWaterDetail = selectedCategory?.key === "water";
  const isCityServicesDetail = selectedCategory?.key === "city_services";
  const isLinkedEventsDetail = selectedCategory?.key === "events";
  const isGeospatialDetail = selectedCategory?.key === "geospatial";
  const isRegionalProfileDetail = selectedCategory?.key === "regional_profile";
  const isDetailPage =
    isWeatherDetail ||
    isAirDetail ||
    isEnergyDetail ||
    isMobilityDetail ||
    isWaterDetail ||
    isCityServicesDetail ||
    isLinkedEventsDetail ||
    isGeospatialDetail ||
    isRegionalProfileDetail;
  const showsWorkspaceTopbar =
    isDetailPage ||
    selectedNavKey === FALLBACK_NAV_KEY ||
    selectedNavKey === TODAY_NAV_KEY;
  const showInlineDataError = Boolean(
    error && (visibleOverview || selectedNavKey === TODAY_NAV_KEY),
  );

  function selectNavItem(item: NavItem): void {
    selectNav(item.categoryKey ?? item.key);
    setIsMobileMenuOpen(false);
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
    }
  }

  function openRecentEvent(event: PlatformEvent): void {
    const target = eventTarget(event);
    const nextParams = new URLSearchParams(searchParams.toString());
    markRecentEventRead(event.id);
    setSearchValue("");
    setIsEventsExpanded(false);

    if (target.navKey === FALLBACK_NAV_KEY) {
      nextParams.set(NAV_QUERY_KEY, FALLBACK_NAV_KEY);
      nextParams.delete(MOBILITY_TAB_QUERY_KEY);
    } else {
      nextParams.set(NAV_QUERY_KEY, target.navKey);
      if (target.mobilityTab) {
        nextParams.set(MOBILITY_TAB_QUERY_KEY, target.mobilityTab);
        setSelectedMobilityTab(target.mobilityTab);
      } else {
        nextParams.delete(MOBILITY_TAB_QUERY_KEY);
      }
    }
    nextParams.set(EVENT_QUERY_KEY, eventNavigationId(event));
    setSelectedNavKey(target.navKey);

    const nextPath = nextParams.toString();
    router.replace(nextPath ? `${pathname}?${nextPath}` : pathname);
  }

  const replaceCityParam = useCallback(
    (nextCity: string): void => {
      const nextParams = currentSearchParams(searchParams);
      nextParams.set("city", nextCity);
      nextParams.delete(EVENT_QUERY_KEY);
      startCityRefresh(() => {
        router.replace(pathWithParams(pathname, nextParams));
      });
    },
    [pathname, router, searchParams, startCityRefresh],
  );

  const replaceDateParam = useCallback(
    (nextDate: string | null): void => {
      const nextParams = currentSearchParams(searchParams);
      if (nextDate) {
        nextParams.set("date", nextDate);
      } else {
        nextParams.delete("date");
      }
      nextParams.delete(EVENT_QUERY_KEY);
      startDateRefresh(() => {
        router.replace(pathWithParams(pathname, nextParams));
      });
    },
    [pathname, router, searchParams, startDateRefresh],
  );

  useEffect(() => {
    setSelectedCity(normalizeCityValue(initialCity));
  }, [initialCity]);

  useEffect(() => {
    setSelectedDate(initialDate ?? null);
  }, [initialDate]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

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
    setSelectedNavKey((currentNavKey) =>
      currentNavKey === nextNavKey ? currentNavKey : nextNavKey,
    );
  }, [categories, searchParams]);

  useEffect(() => {
    const desktopNavQuery = window.matchMedia("(min-width: 1024px)");

    function closeMobileMenuOnDesktop(): void {
      if (desktopNavQuery.matches) {
        setIsMobileMenuOpen(false);
      }
    }

    closeMobileMenuOnDesktop();
    desktopNavQuery.addEventListener("change", closeMobileMenuOnDesktop);

    return () => {
      desktopNavQuery.removeEventListener("change", closeMobileMenuOnDesktop);
    };
  }, []);

  useEffect(() => {
    if (searchParams.has("date") && selectedDate === null) {
      replaceDateParam(null);
    }
  }, [replaceDateParam, searchParams, selectedDate]);

  useEffect(() => {
    if (searchParams.has("city")) {
      saveCityValue(selectedCity);
      return;
    }

    const storedCity = storedCityValue();
    if (storedCity && storedCity !== selectedCity) {
      setSelectedCity(storedCity);
      replaceCityParam(storedCity);
    }
  }, [replaceCityParam, searchParams, selectedCity]);

  useEffect(() => {
    if (!highlightedEventId || !isDetailPage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const element = document.getElementById(eventAnchorId(highlightedEventId));
      if (!element) {
        return;
      }

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("event-anchor-active");
      window.setTimeout(() => {
        element.classList.remove("event-anchor-active");
      }, 1800);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [highlightedEventId, isDetailPage, selectedMobilityTab, selectedNavKey]);

  function selectCity(nextCityValue: string): void {
    const nextCity = normalizeCityValue(nextCityValue);
    setSelectedCity(nextCity);
    saveCityValue(nextCity);
    replaceCityParam(nextCity);
  }

  function selectDate(nextDate: string | null): void {
    if (nextDate !== null) {
      setNeedsHistoryAvailability(true);
    }
    setSelectedDate(nextDate);
    replaceDateParam(nextDate);
  }

  function requestHistoryAvailability(): void {
    setNeedsHistoryAvailability(true);
  }

  function renderSignalCard(category: PlatformCategory) {
    const readout = signalReadout(
      category,
      weather,
      airQuality,
      energy,
      roadRail,
      transit,
      languageMode,
    );
    const attribution = formatSignalAttributionLine(
      categorySignalAttribution(
        category,
        weather,
        airQuality,
        energy,
        householdEnergy,
        roadRail,
        transit,
      ),
      languageMode,
    );
    const tone = readout.tone;
    const followsSelectedCity = categorySupportsCityScope(category.key);

    return (
      <button
        className={`signal-card signal-card-${tone}`}
        key={category.key}
        onClick={() => selectNav(category.key)}
        type="button"
      >
        <span className="signal-card-top">
          <span className="signal-title">
            <span className="material-symbols-outlined" aria-hidden="true">
              {CATEGORY_ICONS[category.key] ?? "database"}
            </span>
            <strong>{displayTitle(category, languageMode)}</strong>
          </span>
          <span className={`status-badge status-badge-${tone}`}>
            {statusLabel(category, languageMode)}
          </span>
        </span>
        <span className="signal-card-bottom">
          <span className="signal-readout">
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: readout.helpKey,
                label: readout.label,
                language: languageMode,
              })}
            >
              {readout.label}
            </DataLabelWithHelp>
            <strong>{readout.value}</strong>
          </span>
          <span
            className={
              followsSelectedCity
                ? "signal-scope-chip signal-scope-chip-city"
                : "signal-scope-chip"
            }
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {followsSelectedCity ? "location_on" : "public"}
            </span>
            <span>
              {followsSelectedCity
                ? cityLabel(selectedCity)
                : tKey("shell.regionalScope")}
            </span>
          </span>
          <span className="signal-card-attribution" title={attribution}>
            {attribution}
          </span>
        </span>
      </button>
    );
  }

  const dashboardShellClassName = isSideNavHidden
    ? "dashboard-shell dashboard-shell-nav-hidden"
    : "dashboard-shell";
  const sideNavClassName = [
    isDetailPage
      ? "dashboard-side-nav detail-side-nav"
      : "dashboard-side-nav",
    isMobileMenuOpen ? "mobile-side-nav-open" : "",
    isSideNavHidden ? "dashboard-side-nav-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const restoreSideNavButton = isSideNavHidden ? (
    <SideNavRestoreButton onShow={() => setIsSideNavHidden(false)} />
  ) : null;
  const scopeControlProps = {
    availability: historyAvailability?.days ?? [],
    city: selectedCity,
    date: selectedDate,
    isAuthenticated,
    // The router transition ends before the new scope's data arrives; keep the
    // control in its pending state until the placeholder is replaced.
    isCityPending: isCityRefreshPending || isPreviousScope,
    isDatePending: isDateRefreshPending || isPreviousScope,
    isEventsExpanded,
    isHistorical,
    isRefreshing,
    language: languageMode,
    notificationCount: recentNotificationCount,
    notificationTone: recentNotificationTone,
    onCalendarOpen: requestHistoryAvailability,
    onCityChange: selectCity,
    onDateChange: selectDate,
    onLanguageChange: selectLanguageMode,
    onNotificationsClick: openRecentEventsPanel,
    onRefresh: triggerDataRefresh,
    showExport: workspaceMode === "data" && !appEnv.demoMode,
    renderAuthActionButton,
  };
  const mobileNavItems = useMemo(
    () => {
      const mobilePriority = new Set(["today", "overview", "weather", "mobility"]);
      return PRIMARY_NAV_ITEMS.filter(
        (item) => mobilePriority.has(item.key) && navItemAvailable(item, categories),
      );
    },
    [categories],
  );

  // Streamed first paint: the overview arrives after the shell, and without the
  // overview the nav and workspaces would render as empty states rather than as
  // "still loading". Placed after every hook so hook order stays stable.
  if (isPending) {
    return <PlatformSkeleton />;
  }

  return (
    <I18nProvider language={languageMode}>
      <div className={dashboardShellClassName}>
        <DataPlatformSideNav
          categories={categories}
          className={sideNavClassName}
          currentUserLabel={currentUserLabel}
          isAuthenticated={isAuthenticated}
          onHide={() => setIsSideNavHidden(true)}
          onPrefetchNavItem={prefetchNavItem}
          onSelectNavItem={selectNavItem}
          renderAuthActionButton={renderAuthActionButton}
          selectedNavKey={selectedNavKey}
          themeMode={themeMode}
          onToggleTheme={toggleThemeMode}
        />
        {isMobileMenuOpen ? (
          <DataPlatformSideNavBackdrop onClose={() => setIsMobileMenuOpen(false)} />
        ) : null}

        <div className="dashboard-app">
          <DataPlatformMobileHeader
            {...scopeControlProps}
            currentUserInitials={currentUserInitials}
            currentUserLabel={currentUserLabel}
            isDetailPage={isDetailPage}
            onSearchChange={setSearchValue}
            onOpenNavigation={() => setIsMobileMenuOpen(true)}
            searchValue={searchValue}
            themeMode={themeMode}
            onToggleTheme={toggleThemeMode}
            userStateLabel={userStateLabel}
            workspaceMode={workspaceMode}
          />

          {showsWorkspaceTopbar ? (
            <DataPlatformWorkspaceTopbar
              {...scopeControlProps}
              isDetailPage={isDetailPage}
              onSearchChange={setSearchValue}
              onSelectNav={selectNav}
              restoreSideNavButton={restoreSideNavButton}
              searchValue={searchValue}
              workspaceMode={workspaceMode}
            />
          ) : null}

          <main
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
            {appEnv.demoMode ? (
              <div className="demo-mode-banner" role="status">
                <span className="material-symbols-outlined" aria-hidden="true">
                  database
                </span>
                <span>{tKey("shell.demoModeNotice")}</span>
              </div>
            ) : null}
            {isPreviousScope ? (
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
                  <span>{error}</span>
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
                isScopePending={isPreviousScope}
                language={languageMode}
                liveSignals={scenarioLiveSignals}
                planItems={todayBrief?.planItems ?? []}
                todayBrief={todayBrief}
                onOpenEvent={openRecentEvent}
                onOpenSignals={() => selectNav(FALLBACK_NAV_KEY)}
                onOpenScenario={openScenario}
                onOpenSummaryTile={openSummaryTile}
              />
            ) : visibleOverview ? (
              isDetailPage ? (
                <DataPlatformWorkspaceRouter
                  airQuality={airQuality}
                  energy={energy}
                  highlightedEventId={highlightedEventId}
                  history={history}
                  householdEnergy={householdEnergy}
                  isAirDetail={isAirDetail}
                  isCityServicesDetail={isCityServicesDetail}
                  isEnergyDetail={isEnergyDetail}
                  isGeospatialDetail={isGeospatialDetail}
                  isLinkedEventsDetail={isLinkedEventsDetail}
                  isMobilityDetail={isMobilityDetail}
                  isRegionalProfileDetail={isRegionalProfileDetail}
                  isWaterDetail={isWaterDetail}
                  isWeatherDetail={isWeatherDetail}
                  onEnergyPanelChange={selectEnergyTab}
                  onMobilityTabChange={selectMobilityTab}
                  overview={visibleOverview}
                  roadRail={roadRail}
                  roadRailCategory={roadRailCategory}
                  selectedCategory={selectedCategory}
                  selectedEnergyTab={selectedEnergyTab}
                  selectedMobilityTab={selectedMobilityTab}
                  transit={transit}
                  transitCategory={transitCategory}
                  weather={weather}
                />
              ) : (
                <>
                  <section className="signals-console-overview" aria-label={tKey("shell.signalObservatory")}>
                    <header className="signals-console-header">
                      <div>
                        <h3>
                          <span className="material-symbols-outlined" aria-hidden="true">
                            monitoring
                          </span>
                          {tKey("shell.signalObservatory")}
                        </h3>
                        <p>{tKey("shell.signalObservatoryLead")}</p>
                      </div>
                    </header>
                    <div
                      className="summary-grid summary-grid-system"
                      aria-label={tKey("shell.signalSystemSummary")}
                    >
                      {signalSystemTiles.map((tile) => (
                        <article
                          className={`metric-tile metric-tile-${tile.tone} signal-system-tile`}
                          key={tile.key}
                        >
                          <div>
                            <span>{tile.label}</span>
                            <span className="material-symbols-outlined" aria-hidden="true">
                              {tile.icon}
                            </span>
                          </div>
                          <strong
                            className={
                              tile.valueStyle === "emphasis"
                                ? "metric-tile-value-emphasis"
                                : "metric-tile-value-body"
                            }
                          >
                            {tile.value}
                          </strong>
                          <small className="metric-tile-detail">{tile.detail}</small>
                        </article>
                      ))}
                    </div>
                  </section>

                  <CrossDomainTimelinePanel
                    collapsible
                    items={signalEventTimeline}
                    language={languageMode}
                    onOpenEvent={openRecentEvent}
                    onOpenScenario={openScenario}
                  />

                  <div
                    className={
                      isEventsExpanded
                        ? "dashboard-main-grid"
                        : "dashboard-main-grid dashboard-main-grid-events-collapsed"
                    }
                  >
                    {primaryVisibleCategories.length > 0 || catalogVisibleCategories.length === 0 ? (
                      <section
                        className="signal-section"
                        aria-label={tKey("shell.signalStatusArray")}
                      >
                        <header className="signal-section-header">
                          <div>
                            <h3>
                              <span
                                className="material-symbols-outlined"
                                aria-hidden="true"
                              >
                                sensors
                              </span>
                              {tKey("shell.coreSignals")}
                            </h3>
                            <p>{tKey("shell.coreSignalsLead")}</p>
                          </div>
                        </header>

                        <div className="signal-grid">
                          {primaryVisibleCategories.length > 0 ? (
                            primaryVisibleCategories.map(renderSignalCard)
                          ) : (
                            <div className="dashboard-empty-state">
                              {tKey("shell.noSignalCardsMatchTheCurrentSearch")}
                            </div>
                          )}
                        </div>
                      </section>
                    ) : null}

                    {catalogVisibleCategories.length > 0 ? (
                      <details
                        className="signal-section signal-catalog-disclosure"
                        open={isCatalogExpanded || Boolean(searchValue.trim())}
                        onToggle={(event) =>
                          setIsCatalogExpanded(event.currentTarget.open)
                        }
                      >
                        <summary
                          aria-label={tKey("shell.toggleCatalogSignals")}
                          className="signal-section-summary"
                        >
                          <span>
                            <span className="material-symbols-outlined" aria-hidden="true">
                              database
                            </span>
                            <span>
                              <strong>{tKey("shell.catalogSignals")}</strong>
                              <small>{tKey("shell.catalogSignalsLead")}</small>
                            </span>
                          </span>
                          <span className="signal-section-summary-meta">
                            <span>{catalogVisibleCategories.length}</span>
                            <span className="material-symbols-outlined" aria-hidden="true">
                              expand_more
                            </span>
                          </span>
                        </summary>
                        <div className="signal-grid signal-grid-catalog">
                          {catalogVisibleCategories.map(renderSignalCard)}
                        </div>
                      </details>
                    ) : null}

                    {isEventsExpanded ? (
                      <aside
                        className="events-panel events-panel-expanded"
                        aria-label={tKey("shell.recentEvents")}
                      >
                        <header>
                          <button
                            aria-controls="recent-events-timeline"
                            aria-expanded={isEventsExpanded}
                            aria-label={tKey("shell.collapseRecentEvents")}
                            className="events-panel-toggle"
                            onClick={() =>
                              setIsEventsExpanded((isExpanded) => !isExpanded)
                            }
                            type="button"
                          >
                            <span
                              className={`events-panel-icon events-panel-icon-${latestEventTone}`}
                              aria-hidden="true"
                            >
                              <span className="material-symbols-outlined">
                                notifications
                              </span>
                            </span>
                            <span className="events-panel-copy">
                              <span className="events-panel-title">
                                <span className="events-panel-heading">
                                  {tKey("shell.recentEvents2")}
                                </span>
                                <span className="events-count-badge">
                                  {unreadVisibleEvents.length}
                                </span>
                              </span>
                              <span className="events-panel-summary">
                                {latestUnreadEvent
                                  ? `${eventTimeLabel(categories, latestUnreadEvent, languageMode)} · ${localizedContent(
                                      languageMode,
                                      latestUnreadEvent.title,
                                      latestUnreadEvent.title_zh,
                                    )}`
                                  : tKey("shell.noRecentEventsMatchTheCurrentView")}
                              </span>
                            </span>
                            <span
                              className="material-symbols-outlined events-panel-chevron"
                              aria-hidden="true"
                            >
                              expand_less
                            </span>
                          </button>
                        </header>
                        <div
                          className="event-timeline"
                          hidden={!isEventsExpanded}
                          id="recent-events-timeline"
                        >
                          <section
                            className={`overall-notification overall-notification-${latestEventTone}`}
                            aria-label={tKey("shell.overallNotification")}
                            aria-live="polite"
                          >
                            <div className="overall-notification-main">
                              <span
                                className={`events-panel-icon events-panel-icon-${latestEventTone}`}
                                aria-hidden="true"
                              >
                                <span className="material-symbols-outlined">
                                  notifications
                                </span>
                              </span>
                              <div className="overall-notification-copy">
                                <span className="overall-notification-kicker">
                                  {tKey("shell.overallNotification")} ·{" "}
                                  {cityLabel(selectedCity)}
                                </span>
                                <strong>{overallNotificationTitle}</strong>
                                <p>{overallNotificationBody}</p>
                              </div>
                            </div>
                            <div className="overall-notification-meta">
                              <span>
                                {tKey("shell.updated")}{" "}
                                {formatTimestamp(
                                  visibleOverview.checked_at,
                                  "dateTime",
                                  languageMode,
                                )}
                              </span>
                              <span
                                className={`status-badge status-badge-${latestEventTone}`}
                              >
                                {visibleNotificationEvents.length > 0
                                  ? tKey("shell.needsAttention")
                                  : tKey("shell.nominal")}
                              </span>
                            </div>
                            <p className="overall-notification-detail">
                              {overallNotificationDetail}
                            </p>
                          </section>
                          {selectedEvent ? (
                            <section
                              className="event-detail-panel"
                              aria-label={tKey("shell.eventDetail")}
                            >
                              <header className="event-detail-header">
                                <div>
                                  <span className="event-detail-kicker">
                                    {eventCategoryLabel(
                                      categories,
                                      selectedEvent,
                                      languageMode,
                                    )}{" "}
                                    · {attributeLabel(selectedEvent.event_type)}
                                  </span>
                                  <strong>
                                    {localizedContent(
                                      languageMode,
                                      selectedEvent.title,
                                      selectedEvent.title_zh,
                                    )}
                                  </strong>
                                </div>
                                <button
                                  aria-label={tKey("shell.closeEventDetail")}
                                  className="event-detail-close"
                                  onClick={() => setSelectedEventId(null)}
                                  title={tKey("shell.closeEventDetail")}
                                  type="button"
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    aria-hidden="true"
                                  >
                                    close
                                  </span>
                                </button>
                                <button
                                  aria-label={tKey("shell.openWorkspace")}
                                  className="event-detail-close"
                                  onClick={() => openRecentEvent(selectedEvent)}
                                  title={tKey("shell.openWorkspace")}
                                  type="button"
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    aria-hidden="true"
                                  >
                                    open_in_new
                                  </span>
                                </button>
                              </header>
                              <p>
                                {localizedContent(
                                  languageMode,
                                  selectedEvent.body,
                                  selectedEvent.body_zh,
                                )}
                              </p>
                              <div className="event-detail-meta">
                                <span>
                                  {tKey("shell.validity")}:{" "}
                                  {formatTimestamp(
                                    selectedEvent.starts_at,
                                    "dateTime",
                                    languageMode,
                                  )}{" "}
                                  -{" "}
                                  {formatTimestamp(
                                    selectedEvent.ends_at,
                                    "dateTime",
                                    languageMode,
                                  )}
                                </span>
                                <span>
                                  {tKey("shell.sources")}:{" "}
                                  {selectedEvent.source_codes.join(", ") ||
                                    tKey("shell.derived")}
                                </span>
                              </div>
                              {selectedEvent.evidence.length > 0 ? (
                                <div className="event-detail-evidence">
                                  <span>{tKey("shell.evidence")}</span>
                                  <div className="event-tags">
                                    {selectedEvent.evidence.map((item) => (
                                      <span key={item}>{item}</span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              <dl className="event-detail-attributes">
                                {selectedEventRows.length > 0 ? (
                                  selectedEventRows.map((row) => (
                                    <div key={row.label}>
                                      <dt>{row.label}</dt>
                                      <dd>{row.value}</dd>
                                    </div>
                                  ))
                                ) : (
                                  <div>
                                    <dt>{tKey("shell.details")}</dt>
                                    <dd>{tKey("shell.noStructuredAttributes")}</dd>
                                  </div>
                                )}
                              </dl>
                            </section>
                          ) : null}
                          {visibleEvents.length > 0 ? (
                            visibleEvents.map((event) => {
                              const tone = severityTone(
                                event.severity,
                              ) as DashboardTone;
                              const isRead = readRecentEventIds.has(event.id);
                              const isSelected = selectedEventId === event.id;
                              const details = recentEventDetails(
                                event,
                                languageMode,
                                tKey,
                              );
                              return (
                                <article
                                  className={[
                                    "timeline-item",
                                    `timeline-item-${tone}`,
                                    isSelected ? "timeline-item-selected" : null,
                                    isRead
                                      ? "timeline-item-read"
                                      : "timeline-item-unread",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  key={event.id}
                                >
                                  <span
                                    className={`timeline-dot timeline-dot-${tone}`}
                                    aria-hidden="true"
                                  />
                                  <button
                                    aria-expanded={isSelected}
                                    aria-label={`${tKey("shell.openEventDetail")}: ${localizedContent(
                                      languageMode,
                                      event.title,
                                      event.title_zh,
                                    )}`}
                                    className="timeline-item-content"
                                    onClick={() => {
                                      markRecentEventRead(event.id);
                                      setSelectedEventId(
                                        isSelected ? null : event.id,
                                      );
                                    }}
                                    type="button"
                                  >
                                    <time>
                                      {eventTimeLabel(
                                        categories,
                                        event,
                                        languageMode,
                                      )}
                                    </time>
                                    <span className="timeline-item-heading">
                                      <h4>
                                        {localizedContent(
                                          languageMode,
                                          event.title,
                                          event.title_zh,
                                        )}
                                      </h4>
                                      <span
                                        className={
                                          isRead
                                            ? "timeline-read-state timeline-read-state-read"
                                            : "timeline-read-state timeline-read-state-unread"
                                        }
                                      >
                                        {isRead ? tKey("shell.read") : tKey("shell.unread")}
                                      </span>
                                    </span>
                                    <p>
                                      {localizedContent(
                                        languageMode,
                                        event.body,
                                        event.body_zh,
                                      )}
                                    </p>
                                    {details.length > 0 ? (
                                      <div className="event-detail-chips">
                                        {details.map((detail) => (
                                          <span key={detail.key}>
                                            <strong>{detail.label}</strong>
                                            {detail.value}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                    <div className="event-tags">
                                      <span>{attributeLabel(event.event_type)}</span>
                                      {event.evidence[0] ? (
                                        <span>{event.evidence[0]}</span>
                                      ) : null}
                                    </div>
                                  </button>
                                </article>
                              );
                            })
                          ) : (
                            <div className="dashboard-empty-state">
                              {tKey("shell.noRecentEventsMatchTheCurrentView")}
                            </div>
                          )}
                        </div>
                      </aside>
                    ) : null}

                    <SourceHealthStrip overview={visibleOverview} />
                  </div>
                </>
              )
            ) : (
              <section
                className="platform-error"
                aria-label={tKey("shell.platformUnavailable")}
              >
                <span>{tKey("shell.platformUnavailable")}</span>
                <h1>{tKey("shell.dataPlatformCouldNotLoad")}</h1>
                <p>{error ?? tKey("shell.unknownPlatformError")}</p>
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
          </main>

          {isDetailPage ? (
            <footer className="detail-footer">
              <span>ArkiWatch designed by Chao</span>
              <div>
                <a href="/privacy">{tKey("shell.privacyPolicy")}</a>
                <a href="/regional-settings">{tKey("shell.regionalSettings")}</a>
                <a href="/api">{tKey("shell.apiDocs")}</a>
              </div>
            </footer>
          ) : null}
          <footer
            className="mobile-dashboard-footer"
            aria-label={tKey("shell.mobileNavigation")}
          >
            <nav className="mobile-bottom-nav" aria-label={tKey("shell.signalNavigation")}>
              {mobileNavItems.map((item) => {
                const isActive =
                  selectedNavKey === item.key ||
                  (item.categoryKey != null &&
                    selectedNavKey === item.categoryKey);
                return (
                  <button
                    aria-current={isActive ? "page" : undefined}
                    className={
                      isActive
                        ? "mobile-bottom-nav-item mobile-bottom-nav-item-active"
                        : "mobile-bottom-nav-item"
                    }
                    key={item.key}
                    onClick={() => selectNavItem(item)}
                    title={tKey(`shell.${item.labelKey}`)}
                    type="button"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{tKey(`shell.${item.labelKey}`)}</span>
                  </button>
                );
              })}
              <button
                className="mobile-bottom-nav-item"
                onClick={() => setIsMobileMenuOpen(true)}
                title={tKey("shell.openNavigation")}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  menu
                </span>
                <span>{tKey("shell.more")}</span>
              </button>
              <button
                className="mobile-bottom-nav-item mobile-bottom-nav-assistant"
                onClick={() => setAssistantOpenRequest((current) => current + 1)}
                ref={assistantNavButtonRef}
                title={tKey("assistant.openAssistant")}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  hub
                </span>
                <span>{tKey("shell.assistant")}</span>
              </button>
            </nav>
          </footer>
          <AssistantWidget
            city={selectedCity}
            date={historicalDate}
            overview={overview}
            language={languageMode}
            mode={workspaceMode}
            focusReturnRef={assistantNavButtonRef}
            openRequest={assistantOpenRequest}
            onOpenView={openAssistantView}
            userId={defaultUserId ?? resolvedUserId}
          />
        </div>
      </div>
    </I18nProvider>
  );
}
