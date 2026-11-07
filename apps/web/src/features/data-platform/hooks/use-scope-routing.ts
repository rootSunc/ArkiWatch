"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { normalizeCityValue } from "../city-scope";
import { saveCityValue, storedCityValue } from "../data-platform-shell";
import {
  buildNavigationQueryParams,
  currentSearchParams,
  EVENT_QUERY_KEY,
  NAV_QUERY_KEY,
  pathWithParams,
  resolveNavKey,
} from "../data-platform-nav-utils";
import { MOBILITY_NAV_KEY } from "../data-platform-view-model";
import type { MobilityTabKey } from "../mobility-workspace";
import {
  ENERGY_TAB_QUERY_KEY,
  MOBILITY_TAB_QUERY_KEY,
  resolveEnergyTabParam,
  resolveMobilityTabParam,
  type EnergyPanelKey,
} from "../workspace-query-params";

type ScopeRoutingOptions = {
  initialCity: string;
  initialDate: string | null;
  initialView: string | null;
  /** The scope moved, so anything pinned to the old one is no longer valid. */
  onScopeChange: () => void;
  /** A date was chosen from the calendar, which has to reclaim focus. */
  onDateChosen: () => void;
};

/**
 * Where the viewer is — city, date, workspace, tab — and the URL that says so.
 *
 * The URL is the record: a scope or workspace change writes it, and the stored
 * city is reconciled against it. No caller has to remember that changing a tab
 * also means rewriting three query parameters.
 *
 * Resolving a requested workspace against the categories that exist stays with
 * the component, because those categories are loaded with the data this hook's
 * own output is used to fetch.
 */
export function useScopeRouting({
  initialCity,
  initialDate,
  initialView,
  onScopeChange,
  onDateChosen,
}: ScopeRoutingOptions) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedCity, setSelectedCity] = useState(() => normalizeCityValue(initialCity));
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ?? null);
  const [needsHistoryAvailability, setNeedsHistoryAvailability] = useState(() =>
    Boolean(initialDate),
  );
  const [selectedNavKey, setSelectedNavKey] = useState(() =>
    resolveNavKey(initialView ?? searchParams.get(NAV_QUERY_KEY), []),
  );
  const [selectedMobilityTab, setSelectedMobilityTab] = useState<MobilityTabKey>(() =>
    resolveMobilityTabParam(
      searchParams.get(MOBILITY_TAB_QUERY_KEY) ?? searchParams.get(NAV_QUERY_KEY),
    ),
  );
  const [selectedEnergyTab, setSelectedEnergyTab] = useState<EnergyPanelKey>(() =>
    resolveEnergyTabParam(searchParams.get(ENERGY_TAB_QUERY_KEY)),
  );

  const [isCityRefreshPending, startCityRefresh] = useTransition();
  const [isDateRefreshPending, startDateRefresh] = useTransition();

  const replaceCityParam = useCallback(
    (nextCity: string): void => {
      const nextParams = currentSearchParams(searchParams);
      nextParams.set("city", nextCity);
      nextParams.delete(EVENT_QUERY_KEY);
      startCityRefresh(() => router.replace(pathWithParams(pathname, nextParams)));
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
      startDateRefresh(() => router.replace(pathWithParams(pathname, nextParams)));
    },
    [pathname, router, searchParams, startDateRefresh],
  );

  // A workspace change is a history entry; a scope change is not.
  const updateNavQuery = useCallback(
    (
      nextNavKey: string,
      options: { mobilityTab?: MobilityTabKey; energyTab?: EnergyPanelKey; eventId?: string } = {},
    ): void => {
      const nextParams = buildNavigationQueryParams(
        new URLSearchParams(searchParams.toString()),
        nextNavKey,
        options,
        { mobilityTab: selectedMobilityTab, energyTab: selectedEnergyTab },
      );

      const nextPath = nextParams.toString();
      const currentPath = searchParams.toString()
        ? `${pathname}?${searchParams.toString()}`
        : pathname;
      const destinationBase = nextNavKey === "today" ? "/plan" : pathname === "/plan" ? "/" : pathname;
      const destinationPath = nextPath ? `${destinationBase}?${nextPath}` : destinationBase;
      if (destinationPath === currentPath) {
        return;
      }

      router.push(destinationPath);
    },
    [pathname, router, searchParams, selectedEnergyTab, selectedMobilityTab],
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

  const selectCity = useCallback(
    (nextCityValue: string): void => {
      const nextCity = normalizeCityValue(nextCityValue);
      onScopeChange();
      setSelectedCity(nextCity);
      saveCityValue(nextCity);
      replaceCityParam(nextCity);
    },
    [onScopeChange, replaceCityParam],
  );

  const selectDate = useCallback(
    (nextDate: string | null): void => {
      onDateChosen();
      onScopeChange();
      if (nextDate !== null) {
        setNeedsHistoryAvailability(true);
      }
      setSelectedDate(nextDate);
      replaceDateParam(nextDate);
    },
    [onDateChosen, onScopeChange, replaceDateParam],
  );

  const requestHistoryAvailability = useCallback(() => setNeedsHistoryAvailability(true), []);

  // The server can hand down a different scope than the one in state, when the
  // page is re-rendered for a new request.
  useEffect(() => {
    setSelectedCity(normalizeCityValue(initialCity));
  }, [initialCity]);

  useEffect(() => {
    setSelectedDate(initialDate ?? null);
  }, [initialDate]);

  // Clearing the date in state must clear it from the URL too.
  useEffect(() => {
    if (searchParams.has("date") && selectedDate === null) {
      replaceDateParam(null);
    }
  }, [replaceDateParam, searchParams, selectedDate]);

  // With no city in the URL the stored preference wins, and is then written to
  // the URL so the view is shareable.
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

  return {
    selectedCity,
    selectedDate,
    selectedNavKey,
    selectedMobilityTab,
    selectedEnergyTab,
    needsHistoryAvailability,
    isScopeTransitionPending: isCityRefreshPending || isDateRefreshPending,
    selectCity,
    selectDate,
    requestHistoryAvailability,
    selectMobilityTab,
    selectEnergyTab,
    updateNavQuery,
    setSelectedNavKey,
    setSelectedMobilityTab,
    setSelectedEnergyTab,
  };
}
