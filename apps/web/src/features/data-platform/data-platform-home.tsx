"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  formatTimestamp,
  severityTone,
} from "@/features/shared/format";

import { categoryVisibleToCurrentUser } from "./category-access";
import {
  categorySupportsCityScope,
  cityLabel,
  normalizeCityValue,
} from "./city-scope";
import { DataLabelWithHelp, dataHelpText } from "./data-help";
import {
  CityScopeSelector,
  DateScopeSelector,
  HistoricalWarningBanner,
  NotificationButton,
  CATALOG_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  RefreshDataButton,
  ThemeToggleButton,
  saveCityValue,
  storedCityValue,
} from "./data-platform-shell";
import type { DashboardTone, NavItem } from "./data-platform-shell";
import {
  I18nProvider,
  LanguageSwitchButton,
  translateMessageKey,
  translateText,
} from "./i18n";
import { usePlatformHome } from "./hooks/use-platform-home";
import { useClientPreferences } from "./hooks/use-client-preferences";
import {
  BRAND_LOGO_SRC,
  CATEGORY_ICONS,
  CROSS_TIMELINE_LIMIT,
  EVENT_QUERY_KEY,
  FALLBACK_NAV_KEY,
  NAV_QUERY_KEY,
  TODAY_NAV_KEY,
  categoryByKey,
  currentSearchParams,
  navItemAvailable,
  pathWithParams,
  profileInitials,
  resolveNavKey,
} from "./data-platform-nav-utils";
import { useRefreshPlatformData, useSignOut } from "./queries/platform-actions";
import {
  PlatformEvent,
} from "./types";
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
import {
  AirQualityWorkspace,
  CityServicesWorkspace,
  EnergyWorkspace,
  GeospatialWorkspace,
  LinkedEventsWorkspace,
  MobilityWorkspace,
  RegionalProfileWorkspace,
  WaterSnowWorkspace,
  WeatherDetailView,
} from "./workspace-panels";
import type { MobilityTabKey } from "./mobility-workspace";
import {
  resolveScenarioTarget,
  resolveSummaryTileTarget,
} from "./scenario-navigation";
import { buildCrossDomainTimeline } from "./cross-domain-timeline";
import { CrossDomainTimelinePanel } from "./cross-domain-timeline-panel";
import { ScenarioOverview } from "./scenario-overview";
import { ShareViewLinkButton } from "./share-view-link-button";
import type { ScenarioLiveSignals } from "./scenario-live-hints";
import {
  categorySignalAttribution,
  formatSignalAttributionLine,
} from "./signal-attribution";
import { buildSignalSystemTiles } from "./signals-console";
import { SourceHealthStrip } from "./source-health-strip";
import { buildTodayBrief } from "./today-brief";
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
import { AssistantWidget } from "@/features/assistant-widget/assistant-widget";

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
  const {
    airQuality,
    apiBaseUrl,
    defaultUserId: resolvedUserId,
    energy,
    error,
    history,
    historyAvailability,
    householdEnergy,
    overview,
    publicDashboard,
    roadRail,
    transit,
    weather,
  } = usePlatformHome({
    city: initialCity,
    date: initialDate,
    userId: defaultUserId,
  });
  const initialNavCategories = (overview?.categories ?? []).filter((category) =>
    categoryVisibleToCurrentUser(category.key),
  );
  const [selectedNavKey, setSelectedNavKey] = useState(() =>
    resolveNavKey(initialView ?? searchParams.get(NAV_QUERY_KEY), initialNavCategories),
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSideNavHidden, setIsSideNavHidden] = useState(false);
  const [selectedCity, setSelectedCity] = useState(() =>
    normalizeCityValue(initialCity),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialDate ?? null,
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const hasMountedRef = useRef(false);
  const [isCityRefreshPending, startCityRefresh] = useTransition();
  const [isDateRefreshPending, startDateRefresh] = useTransition();
  const t = (value: string) => translateText(languageMode, value);
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
  const userStateLabel = isAuthenticated ? tKey("shell.signedIn") : tKey("shell.demoView");
  const authActionLabel = isAuthenticated ? tKey("shell.signOut") : tKey("shell.adminSignIn");
  const authActionIcon = isAuthenticated ? "logout" : "login";
  const currentUserInitials = profileInitials(currentUserLabel);

  const isRefreshing = refreshMutation.isPending;

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
        summaryTiles: userSummaryTiles,
        timelineItems: crossDomainTimeline,
        language: languageMode,
      }),
    [crossDomainTimeline, languageMode, publicDashboard, userSummaryTiles],
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
    : t("Overall");
  const overallNotificationTitle =
    visibleNotificationEvents.length > 0
      ? `${overallScopeLabel} · ${activeEventLabel(
          visibleNotificationEvents.length,
          languageMode,
        )}`
      : `${overallScopeLabel} · ${t("No active notifications")}`;
  const overallNotificationBody = priorityVisibleEvent
    ? `${eventCategoryLabel(categories, priorityVisibleEvent, languageMode)} · ${priorityVisibleEvent.title}`
    : t("No active cross-signal notifications in this view.");
  const overallNotificationDetail =
    priorityVisibleEvent?.body ??
    t("Recent events remain available below for source-level inspection.");
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

  function selectNavItem(item: NavItem): void {
    selectNav(item.categoryKey ?? item.key);
    setIsMobileMenuOpen(false);
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
    setSelectedDate(nextDate);
    replaceDateParam(nextDate);
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
    <button
      className="icon-button side-nav-restore-button"
      aria-label={tKey("shell.showNavigation")}
      onClick={() => setIsSideNavHidden(false)}
      title={tKey("shell.showNavigation")}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        keyboard_double_arrow_right
      </span>
    </button>
  ) : null;
  const themeActionLabel = tKey(
    themeMode === "light" ? "shell.switchToNightTheme" : "shell.switchToDayTheme",
  );
  const mobileNavItems = useMemo(
    () => PRIMARY_NAV_ITEMS.filter((item) => navItemAvailable(item, categories)),
    [categories],
  );

  return (
    <I18nProvider language={languageMode}>
      <div className={dashboardShellClassName}>
        <aside
          className={sideNavClassName}
          aria-label={tKey("shell.primaryNavigation")}
        >
          <div className="brand-panel">
            <div className="brand-icon" aria-hidden="true">
              <Image
                alt=""
                className="brand-logo-image"
                height={96}
                priority
                src={BRAND_LOGO_SRC}
                width={96}
              />
            </div>
            <div className="brand-copy">
              <h1 className="brand-title-main">ArkiWatch</h1>
              <p className="brand-title-subtitle">{tKey("shell.dataPlatform")}</p>
            </div>
            <button
              className="icon-button side-nav-collapse-button"
              aria-label={tKey("shell.hideNavigation")}
              onClick={() => setIsSideNavHidden(true)}
              title={tKey("shell.hideNavigation")}
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                keyboard_double_arrow_left
              </span>
            </button>
          </div>

          <nav className="side-nav-list" aria-label={t("Signal navigation")}>
            {PRIMARY_NAV_ITEMS.filter((item) =>
              navItemAvailable(item, categories),
            ).map((item) => {
              const isActive =
                selectedNavKey === item.key ||
                (item.categoryKey != null &&
                  selectedNavKey === item.categoryKey);
              return (
                <button
                  className={isActive ? "nav-row nav-row-active" : "nav-row"}
                  key={item.key}
                  onClick={() => selectNavItem(item)}
                  title={t(item.label)}
                  type="button"
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span>{t(item.label)}</span>
                </button>
              );
            })}
          </nav>

          {CATALOG_NAV_ITEMS.some((item) => navItemAvailable(item, categories)) ? (
            <nav className="side-nav-catalog" aria-label={t("Data catalog navigation")}>
              <span className="side-nav-catalog-label">{t("Data catalog")}</span>
              {CATALOG_NAV_ITEMS.filter((item) => navItemAvailable(item, categories)).map(
                (item) => {
                  const isActive =
                    selectedNavKey === item.key ||
                    (item.categoryKey != null && selectedNavKey === item.categoryKey);
                  return (
                    <button
                      className={isActive ? "nav-row nav-row-active" : "nav-row"}
                      key={item.key}
                      onClick={() => selectNavItem(item)}
                      title={t(item.label)}
                      type="button"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span>{t(item.label)}</span>
                    </button>
                  );
                },
              )}
            </nav>
          ) : null}

          <nav className="side-nav-footer" aria-label={t("System controls")}>
            <div className="side-nav-utility-group">
              <button
                className="nav-row side-nav-utility-row"
                aria-label={t("Settings")}
                title={t("Settings")}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  settings
                </span>
                <span>{t("Settings")}</span>
              </button>
              <button
                className="nav-row side-nav-utility-row"
                aria-label={themeActionLabel}
                onClick={toggleThemeMode}
                title={themeActionLabel}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {themeMode === "light" ? "dark_mode" : "light_mode"}
                </span>
                <span>{t("Theme mode")}</span>
              </button>
              <div
                className="nav-row side-nav-utility-row side-nav-user-row"
                aria-label={userStateLabel}
                title={currentUserLabel}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {isAuthenticated ? "manage_accounts" : "visibility"}
                </span>
                <span>{currentUserLabel}</span>
              </div>
              {renderAuthActionButton("nav-row side-nav-utility-row", true)}
            </div>
          </nav>
        </aside>
        {isMobileMenuOpen ? (
          <div
            className="mobile-side-nav-backdrop"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
        ) : null}

        <div className="dashboard-app">
          <header className="mobile-dashboard-header">
            <div className="mobile-brand">
              <button
                className="icon-button"
                aria-label={t("Open navigation")}
                onClick={() => setIsMobileMenuOpen(true)}
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
              <strong>ArkiWatch</strong>
            </div>
            <div className="top-actions">
              <div className="mobile-scope-switchers">
                <CityScopeSelector
                  city={selectedCity}
                  isPending={isCityRefreshPending}
                  language={languageMode}
                  onCityChange={selectCity}
                />
                <DateScopeSelector
                  availability={historyAvailability?.days ?? []}
                  date={selectedDate}
                  isPending={isDateRefreshPending}
                  language={languageMode}
                  onDateChange={selectDate}
                />
              </div>
              <div className="mobile-utility-actions">
                <LanguageSwitchButton
                  language={languageMode}
                  onLanguageChange={selectLanguageMode}
                />
                <ThemeToggleButton
                  language={languageMode}
                  themeMode={themeMode}
                  onToggle={toggleThemeMode}
                />
                {isAuthenticated && !isDetailPage && !isHistorical ? (
                  <RefreshDataButton
                    isRefreshing={isRefreshing}
                    language={languageMode}
                    onRefresh={triggerDataRefresh}
                  />
                ) : null}
                <ShareViewLinkButton language={languageMode} />
                <NotificationButton
                  count={recentNotificationCount}
                  isActive={isEventsExpanded && !isDetailPage}
                  language={languageMode}
                  onClick={openRecentEventsPanel}
                  tone={recentNotificationTone}
                />
                <button
                  className="icon-button mobile-overflow-action"
                  aria-label={t("Settings")}
                  type="button"
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
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
          </header>

          {showsWorkspaceTopbar ? (
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
              {isDetailPage ? (
                <nav aria-label={t("Detail workspace navigation")}>
                  <button onClick={() => selectNav(TODAY_NAV_KEY)} type="button">
                    {t("Back to Today")}
                  </button>
                  <button onClick={() => selectNav(FALLBACK_NAV_KEY)} type="button">
                    {t("All signals")}
                  </button>
                </nav>
              ) : null}
              <div className="detail-topbar-actions">
                <CityScopeSelector
                  city={selectedCity}
                  isPending={isCityRefreshPending}
                  language={languageMode}
                  onCityChange={selectCity}
                />
                <DateScopeSelector
                  availability={historyAvailability?.days ?? []}
                  date={selectedDate}
                  isPending={isDateRefreshPending}
                  language={languageMode}
                  onDateChange={selectDate}
                />
                <LanguageSwitchButton
                  language={languageMode}
                  onLanguageChange={selectLanguageMode}
                />
                {isAuthenticated && !isHistorical ? (
                  <RefreshDataButton
                    isRefreshing={isRefreshing}
                    language={languageMode}
                    onRefresh={triggerDataRefresh}
                  />
                ) : null}
                <ShareViewLinkButton language={languageMode} />
                <NotificationButton
                  count={recentNotificationCount}
                  isActive={isEventsExpanded && !isDetailPage}
                  language={languageMode}
                  onClick={openRecentEventsPanel}
                  tone={recentNotificationTone}
                />
                {renderAuthActionButton("icon-button")}
              </div>
            </header>
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
            {!showsWorkspaceTopbar ? (
              <div className="desktop-dashboard-header">
                <div className="desktop-dashboard-heading">
                  {restoreSideNavButton}
                  <div className="desktop-dashboard-heading-copy">
                    <h2>
                      {selectedCategory
                        ? `${displayTitle(selectedCategory, languageMode)} ${t("Dashboard")}`
                        : selectedNavKey === FALLBACK_NAV_KEY
                          ? t("Signals")
                          : t("Today")}
                    </h2>
                    {selectedCategory ? (
                      <p>{selectedCategory.description}</p>
                    ) : null}
                  </div>
                </div>
                <div className="desktop-controls">
                  <label className="dashboard-search">
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      search
                    </span>
                    <input
                      onChange={(event) =>
                        setSearchValue(event.currentTarget.value)
                      }
                      placeholder={t("Search signals, events...")}
                      value={searchValue}
                    />
                  </label>
                  <CityScopeSelector
                    city={selectedCity}
                    isPending={isCityRefreshPending}
                    language={languageMode}
                    onCityChange={selectCity}
                  />
                  <DateScopeSelector
                    availability={historyAvailability?.days ?? []}
                    date={selectedDate}
                    isPending={isDateRefreshPending}
                    language={languageMode}
                    onDateChange={selectDate}
                  />
                  <LanguageSwitchButton
                    language={languageMode}
                    onLanguageChange={selectLanguageMode}
                  />
                  {isAuthenticated && !isHistorical ? (
                    <RefreshDataButton
                      isRefreshing={isRefreshing}
                      language={languageMode}
                      onRefresh={triggerDataRefresh}
                    />
                  ) : null}
                  <ShareViewLinkButton language={languageMode} />
                  <NotificationButton
                    count={recentNotificationCount}
                    isActive={isEventsExpanded && !isDetailPage}
                    language={languageMode}
                    onClick={openRecentEventsPanel}
                    tone={recentNotificationTone}
                  />
                  {renderAuthActionButton("icon-button")}
                </div>
              </div>
            ) : null}

            {selectedNavKey === TODAY_NAV_KEY ? (
              <>
                <ScenarioOverview
                  isHistorical={isHistorical}
                  language={languageMode}
                  liveSignals={scenarioLiveSignals}
                  planItems={todayBrief?.planItems ?? []}
                  todayBrief={todayBrief}
                  onOpenEvent={openRecentEvent}
                  onOpenSignals={() => selectNav(FALLBACK_NAV_KEY)}
                  onOpenScenario={openScenario}
                  onOpenSummaryTile={openSummaryTile}
                  onOpenTopAction={openScenario}
                />
              </>
            ) : visibleOverview ? (
              isWeatherDetail ? (
                <WeatherDetailView
                  category={selectedCategory}
                  highlightedEventId={highlightedEventId}
                  history={history.weather}
                  weather={weather}
                />
              ) : isAirDetail ? (
                <AirQualityWorkspace
                  airQuality={airQuality}
                  category={selectedCategory}
                  highlightedEventId={highlightedEventId}
                  history={history.airQuality}
                />
              ) : isEnergyDetail ? (
                <EnergyWorkspace
                  activePanel={selectedEnergyTab}
                  category={selectedCategory}
                  energy={energy}
                  highlightedEventId={highlightedEventId}
                  history={history.energy}
                  householdEnergy={householdEnergy}
                  householdHistory={history.householdEnergy}
                  onPanelChange={selectEnergyTab}
                />
              ) : isMobilityDetail ? (
                <MobilityWorkspace
                  activeTab={selectedMobilityTab}
                  highlightedEventId={highlightedEventId}
                  onTabChange={selectMobilityTab}
                  roadRail={roadRail}
                  roadRailCategory={roadRailCategory}
                  roadRailHistory={history.roadRail}
                  transit={transit}
                  transitCategory={transitCategory}
                  transitHistory={history.transit}
                />
              ) : isWaterDetail ? (
                <WaterSnowWorkspace category={selectedCategory} />
              ) : isCityServicesDetail ? (
                <CityServicesWorkspace category={selectedCategory} />
              ) : isLinkedEventsDetail ? (
                <LinkedEventsWorkspace
                  category={selectedCategory}
                  highlightedEventId={highlightedEventId}
                  checkedAt={visibleOverview.checked_at}
                  timeScope={visibleOverview.time_scope}
                />
              ) : isGeospatialDetail ? (
                <GeospatialWorkspace category={selectedCategory} />
              ) : isRegionalProfileDetail ? (
                <RegionalProfileWorkspace category={selectedCategory} />
              ) : (
                <>
                  <section className="signals-console-overview" aria-label={t("Signal observatory")}>
                    <header className="signals-console-header">
                      <div>
                        <h3>
                          <span className="material-symbols-outlined" aria-hidden="true">
                            monitoring
                          </span>
                          {t("Signal observatory")}
                        </h3>
                        <p>{t("Signal observatory lead")}</p>
                      </div>
                    </header>
                    <div
                      className="summary-grid summary-grid-system"
                      aria-label={t("Signal system summary")}
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
                    <section
                      className="signal-section"
                      aria-label={t("Signal status array")}
                    >
                      <h3>
                        <span
                          className="material-symbols-outlined"
                          aria-hidden="true"
                        >
                          sensors
                        </span>
                        {t("All signals")}
                      </h3>

                      <div className="signal-grid">
                        {visibleCategories.length > 0 ? (
                          visibleCategories.map((category) => {
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
                            const followsSelectedCity =
                              categorySupportsCityScope(category.key);
                            return (
                              <button
                                className={`signal-card signal-card-${tone}`}
                                key={category.key}
                                onClick={() => selectNav(category.key)}
                                type="button"
                              >
                                <span className="signal-card-top">
                                  <span className="signal-title">
                                    <span
                                      className="material-symbols-outlined"
                                      aria-hidden="true"
                                    >
                                      {CATEGORY_ICONS[category.key] ??
                                        "database"}
                                    </span>
                                    <strong>
                                      {displayTitle(category, languageMode)}
                                    </strong>
                                  </span>
                                  <span
                                    className={`status-badge status-badge-${tone}`}
                                  >
                                    {statusLabel(category, languageMode)}
                                  </span>
                                </span>
                                <span className="signal-card-bottom">
                                  <span className="signal-readout">
                                    <DataLabelWithHelp
                                      helpText={dataHelpText({
                                        key: readout.helpKey,
                                        label: readout.label,
                                        t,
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
                                    <span
                                      className="material-symbols-outlined"
                                      aria-hidden="true"
                                    >
                                      {followsSelectedCity
                                        ? "location_on"
                                        : "public"}
                                    </span>
                                    <span>
                                      {followsSelectedCity
                                        ? cityLabel(selectedCity)
                                        : t("Regional scope")}
                                    </span>
                                  </span>
                                  <span
                                    className="signal-meter"
                                    aria-hidden="true"
                                  >
                                    <span
                                      style={{ width: `${readout.progress}%` }}
                                    />
                                  </span>
                                  <span className="signal-card-attribution">
                                    {attribution}
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="dashboard-empty-state">
                            {t("No signal cards match the current search.")}
                          </div>
                        )}
                      </div>
                    </section>

                    {isEventsExpanded ? (
                      <aside
                        className="events-panel events-panel-expanded"
                        aria-label={t("Recent events")}
                      >
                        <header>
                          <button
                            aria-controls="recent-events-timeline"
                            aria-expanded={isEventsExpanded}
                            aria-label={t("Collapse recent events")}
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
                                  {t("Recent Events")}
                                </span>
                                <span className="events-count-badge">
                                  {unreadVisibleEvents.length}
                                </span>
                              </span>
                              <span className="events-panel-summary">
                                {latestUnreadEvent
                                  ? `${eventTimeLabel(categories, latestUnreadEvent, languageMode, t)} · ${latestUnreadEvent.title}`
                                  : t("No recent events match the current view.")}
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
                            aria-label={t("Overall notification")}
                            aria-live="polite"
                          >
                            <div className="overall-notification-main">
                              <span
                                className={`events-panel-icon events-panel-icon-${latestEventTone}`}
                                aria-hidden="true"
                              >
                                <span className="material-symbols-outlined">
                                  {visibleNotificationEvents.length > 0
                                    ? "notifications_active"
                                    : "notifications_off"}
                                </span>
                              </span>
                              <div className="overall-notification-copy">
                                <span className="overall-notification-kicker">
                                  {t("Overall notification")} ·{" "}
                                  {cityLabel(selectedCity)}
                                </span>
                                <strong>{overallNotificationTitle}</strong>
                                <p>{overallNotificationBody}</p>
                              </div>
                            </div>
                            <div className="overall-notification-meta">
                              <span>
                                {t("Updated")}{" "}
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
                                  ? t("Needs attention")
                                  : t("Nominal")}
                              </span>
                            </div>
                            <p className="overall-notification-detail">
                              {overallNotificationDetail}
                            </p>
                          </section>
                          {selectedEvent ? (
                            <section
                              className="event-detail-panel"
                              aria-label={t("Event detail")}
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
                                  <strong>{selectedEvent.title}</strong>
                                </div>
                                <button
                                  aria-label={t("Close event detail")}
                                  className="event-detail-close"
                                  onClick={() => setSelectedEventId(null)}
                                  title={t("Close event detail")}
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
                                  aria-label={t("Open workspace")}
                                  className="event-detail-close"
                                  onClick={() => openRecentEvent(selectedEvent)}
                                  title={t("Open workspace")}
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
                              <p>{selectedEvent.body}</p>
                              <div className="event-detail-meta">
                                <span>
                                  {t("Validity")}:{" "}
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
                                  {t("Sources")}:{" "}
                                  {selectedEvent.source_codes.join(", ") ||
                                    t("Derived")}
                                </span>
                              </div>
                              {selectedEvent.evidence.length > 0 ? (
                                <div className="event-detail-evidence">
                                  <span>{t("Evidence")}</span>
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
                                    <dt>{t("Details")}</dt>
                                    <dd>{t("No structured attributes")}</dd>
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
                                t,
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
                                    aria-label={`${t("Open event detail")}: ${event.title}`}
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
                                        t,
                                      )}
                                    </time>
                                    <span className="timeline-item-heading">
                                      <h4>{event.title}</h4>
                                      <span
                                        className={
                                          isRead
                                            ? "timeline-read-state timeline-read-state-read"
                                            : "timeline-read-state timeline-read-state-unread"
                                        }
                                      >
                                        {isRead ? t("Read") : t("Unread")}
                                      </span>
                                    </span>
                                    <p>{event.body}</p>
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
                              {t("No recent events match the current view.")}
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
                aria-label={t("Platform unavailable")}
              >
                <span>{t("Platform unavailable")}</span>
                <h1>{t("Data platform could not load")}</h1>
                <p>{error ?? t("Unknown platform error.")}</p>
                <small>
                  {t("API endpoint")}: {apiBaseUrl}
                  {defaultUserId || resolvedUserId
                    ? ` · ${t("User context")}: ${defaultUserId ?? resolvedUserId}`
                    : ""}
                </small>
              </section>
            )}
          </main>

          {isDetailPage ? (
            <footer className="detail-footer">
              <span>ArkiWatch designed by Chao</span>
              <div>
                <a href="/privacy">{t("Privacy Policy")}</a>
                <a href="/regional-settings">{t("Regional Settings")}</a>
                <a href="/api">{t("API Docs")}</a>
              </div>
            </footer>
          ) : null}
          <footer
            className="mobile-dashboard-footer"
            aria-label={t("Mobile navigation")}
          >
            <nav className="mobile-bottom-nav" aria-label={t("Signal navigation")}>
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
                    title={t(item.label)}
                    type="button"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{t(item.label)}</span>
                  </button>
                );
              })}
              <button
                className="mobile-bottom-nav-item"
                onClick={() => setIsMobileMenuOpen(true)}
                title={t("Open navigation")}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  menu
                </span>
                <span>{t("More")}</span>
              </button>
            </nav>
          </footer>
          <AssistantWidget
            city={selectedCity}
            date={historicalDate}
            overview={overview}
            language={languageMode}
            userId={defaultUserId ?? resolvedUserId}
          />
        </div>
      </div>
    </I18nProvider>
  );
}
