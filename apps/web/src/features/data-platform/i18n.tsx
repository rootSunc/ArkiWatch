"use client";

import { NextIntlClientProvider } from "next-intl";
import { createContext, ReactNode, useContext, useMemo } from "react";

import enMessages from "./messages/en.json";
import shellEnMessages from "./messages/shell.en.json";
import shellZhMessages from "./messages/shell.zh.json";
import zhMessages from "./messages/zh.json";

export type LanguageMode = "en" | "zh";

export const LANGUAGE_STORAGE_KEY = "arkiwatch-language";

type StructuredMessages = {
  shell: Record<string, string>;
};

type I18nContextValue = {
  language: LanguageMode;
  t: (value: string) => string;
  tKey: (key: string) => string;
  enumLabel: (value: string | null | undefined) => string;
  dataLabel: (value: string | null | undefined) => string;
};

const LEGACY_MESSAGE_CATALOG: Record<LanguageMode, Record<string, string>> = {
  en: enMessages,
  zh: zhMessages,
};

const STRUCTURED_MESSAGE_CATALOG: Record<LanguageMode, StructuredMessages> = {
  en: shellEnMessages,
  zh: shellZhMessages,
};

const DEFAULT_CONTEXT: I18nContextValue = {
  language: "en",
  t: (value) => value,
  tKey: (key) => key,
  enumLabel: (value) => humanizeValue(value),
  dataLabel: (value) => humanizeValue(value),
};

const I18nContext = createContext<I18nContextValue>(DEFAULT_CONTEXT);

function humanizeValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function resolveStructuredMessage(
  language: LanguageMode,
  key: string,
): string | undefined {
  const [namespace, messageKey] = key.split(".", 2);
  if (!namespace || !messageKey) {
    return undefined;
  }

  const namespaceMessages = STRUCTURED_MESSAGE_CATALOG[language][
    namespace as keyof StructuredMessages
  ];
  return namespaceMessages?.[messageKey];
}

export function translateMessageKey(language: LanguageMode, key: string): string {
  const localized = resolveStructuredMessage(language, key);
  if (localized) {
    return localized;
  }

  const englishFallback = resolveStructuredMessage("en", key);
  return englishFallback ?? key;
}

export function isLanguageMode(value: string | null): value is LanguageMode {
  return value === "en" || value === "zh";
}

export function preferredLanguageMode(): LanguageMode {
  if (typeof navigator === "undefined") {
    return "en";
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function storedLanguageMode(): LanguageMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguageMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLanguageMode(language: LanguageMode): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Language switching should keep working even when persistent storage is unavailable.
  }
}

export function applyLanguageMode(language: LanguageMode): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.language = language;
}

export function translateText(language: LanguageMode, value: string): string {
  if (language === "en") {
    return value;
  }

  return LEGACY_MESSAGE_CATALOG.zh[value] ?? value;
}

export function translateEnumLabel(language: LanguageMode, value: string | null | undefined): string {
  const label = humanizeValue(value);
  return label ? translateText(language, label) : "";
}

export function translateDataLabel(language: LanguageMode, value: string | null | undefined): string {
  const label = value?.replaceAll("_", " ") ?? "";
  return label ? translateText(language, label) : "";
}

export function I18nProvider({
  children,
  language,
}: {
  children: ReactNode;
  language: LanguageMode;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      t: (text) => translateText(language, text),
      tKey: (key) => translateMessageKey(language, key),
      enumLabel: (text) => translateEnumLabel(language, text),
      dataLabel: (text) => translateDataLabel(language, text),
    }),
    [language],
  );

  return (
    <NextIntlClientProvider
      locale={language}
      messages={{
        ...LEGACY_MESSAGE_CATALOG[language],
        ...STRUCTURED_MESSAGE_CATALOG[language],
      }}
    >
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    </NextIntlClientProvider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function LanguageSwitchButton({
  language,
  onLanguageChange,
}: {
  language: LanguageMode;
  onLanguageChange: (language: LanguageMode) => void;
}) {
  const label = translateMessageKey(language, "shell.displayLanguage");

  return (
    <div className="language-switcher" aria-label={label} role="group" title={label}>
      {(["en", "zh"] as const).map((option) => (
        <button
          aria-pressed={language === option}
          className={
            language === option ? "language-option language-option-active" : "language-option"
          }
          key={option}
          onClick={() => onLanguageChange(option)}
          type="button"
        >
          {option === "en" ? "EN" : "中文"}
        </button>
      ))}
    </div>
  );
}
