"use client";

import { useState } from "react";

import {
  applyLanguageMode,
  preferredLanguageMode,
  saveLanguageMode,
  storedLanguageMode,
  useIsomorphicLayoutEffect,
  type LanguageMode,
} from "@/features/data-platform/i18n";

/**
 * Display language for the pages outside the dashboard shell — /about,
 * /privacy, /login and the 404.
 *
 * They render before the dashboard's I18nProvider exists, so each needs to
 * resolve and persist the language itself. The first render is English so the
 * server and client agree; the stored preference lands in a layout effect,
 * before paint.
 */
export function usePageLanguage(): [LanguageMode, (next: LanguageMode) => void] {
  const [language, setLanguage] = useState<LanguageMode>("en");

  useIsomorphicLayoutEffect(() => {
    const resolved = storedLanguageMode() ?? preferredLanguageMode();
    setLanguage(resolved);
    applyLanguageMode(resolved);
  }, []);

  function changeLanguage(next: LanguageMode): void {
    setLanguage(next);
    saveLanguageMode(next);
    applyLanguageMode(next);
  }

  return [language, changeLanguage];
}

/** EN / 中文 toggle for those same pages. */
export function PageLanguageToggle({
  className,
  label,
  language,
  onChange,
}: {
  className: string;
  label: string;
  language: LanguageMode;
  onChange: (next: LanguageMode) => void;
}) {
  return (
    <div className={className} aria-label={label} role="group">
      {(["en", "zh"] as const).map((option) => (
        <button
          aria-pressed={language === option}
          className={language === option ? "is-active" : ""}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option === "en" ? "EN" : "中文"}
        </button>
      ))}
    </div>
  );
}
