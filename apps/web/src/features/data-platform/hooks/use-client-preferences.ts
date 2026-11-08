"use client";

import { useCallback, useEffect, useState } from "react";

import {
  applyThemeMode,
  preferredThemeMode,
  saveThemeMode,
  storedThemeMode,
  ThemeMode,
} from "../shell/data-platform-shell";
import {
  applyLanguageMode,
  resolveClientLanguage,
  saveLanguageMode,
  useIsomorphicLayoutEffect,
  type LanguageMode,
} from "../i18n";
import { ensureMessageCatalog } from "../messages/load-client-catalog";
import { loadReadRecentEventIds, saveReadRecentEventIds } from "../shell/data-platform-nav-utils";

export function useClientPreferences(initialLanguage: LanguageMode = "en") {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [languageMode, setLanguageMode] = useState<LanguageMode>(initialLanguage);
  const [readRecentEventIds, setReadRecentEventIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setReadRecentEventIds(loadReadRecentEventIds());
  }, []);

  useIsomorphicLayoutEffect(() => {
    const nextThemeMode = storedThemeMode() ?? preferredThemeMode();
    setThemeMode(nextThemeMode);
    applyThemeMode(nextThemeMode);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const nextLanguageMode = resolveClientLanguage();
    let cancelled = false;
    void ensureMessageCatalog(nextLanguageMode).then(() => {
      if (cancelled) {
        return;
      }
      setLanguageMode(nextLanguageMode);
      applyLanguageMode(nextLanguageMode);
    });
    return () => {
      cancelled = true;
    };
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
    void ensureMessageCatalog(nextLanguageMode).then(() => {
      setLanguageMode(nextLanguageMode);
      applyLanguageMode(nextLanguageMode);
      saveLanguageMode(nextLanguageMode);
    });
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
