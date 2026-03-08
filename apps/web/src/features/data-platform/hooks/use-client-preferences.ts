"use client";

import { useCallback, useEffect, useState } from "react";

import {
  applyThemeMode,
  preferredThemeMode,
  saveThemeMode,
  storedThemeMode,
  ThemeMode,
} from "../data-platform-shell";
import {
  applyLanguageMode,
  preferredLanguageMode,
  saveLanguageMode,
  storedLanguageMode,
  type LanguageMode,
} from "../i18n";
import { loadReadRecentEventIds, saveReadRecentEventIds } from "../data-platform-nav-utils";

export function useClientPreferences() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [languageMode, setLanguageMode] = useState<LanguageMode>("en");
  const [readRecentEventIds, setReadRecentEventIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setReadRecentEventIds(loadReadRecentEventIds());
  }, []);

  useEffect(() => {
    const nextThemeMode = storedThemeMode() ?? preferredThemeMode();
    setThemeMode(nextThemeMode);
    applyThemeMode(nextThemeMode);
  }, []);

  useEffect(() => {
    const nextLanguageMode = storedLanguageMode() ?? preferredLanguageMode();
    setLanguageMode(nextLanguageMode);
    applyLanguageMode(nextLanguageMode);
  }, []);

  const toggleThemeMode = useCallback((): void => {
    setThemeMode((currentThemeMode) => {
      const nextThemeMode = currentThemeMode === "dark" ? "light" : "dark";
      applyThemeMode(nextThemeMode);
      saveThemeMode(nextThemeMode);
      return nextThemeMode;
    });
  }, []);

  const selectLanguageMode = useCallback((nextLanguageMode: LanguageMode): void => {
    setLanguageMode(nextLanguageMode);
    applyLanguageMode(nextLanguageMode);
    saveLanguageMode(nextLanguageMode);
  }, []);

  const markRecentEventRead = useCallback((eventId: string): void => {
    setReadRecentEventIds((currentIds) => {
      if (currentIds.has(eventId)) {
        return currentIds;
      }

      const nextIds = new Set(currentIds);
      nextIds.add(eventId);
      saveReadRecentEventIds(nextIds);
      return nextIds;
    });
  }, []);

  return {
    languageMode,
    markRecentEventRead,
    readRecentEventIds,
    selectLanguageMode,
    setReadRecentEventIds,
    themeMode,
    toggleThemeMode,
  };
}
