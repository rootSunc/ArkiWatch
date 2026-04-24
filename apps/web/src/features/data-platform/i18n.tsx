"use client";

import { NextIntlClientProvider } from "next-intl";
import { createContext, ReactNode, useContext, useMemo } from "react";

import airQualityEnMessages from "./messages/airQuality.en.json";
import airQualityZhMessages from "./messages/airQuality.zh.json";
import assistantEnMessages from "./messages/assistant.en.json";
import assistantZhMessages from "./messages/assistant.zh.json";
import authEnMessages from "./messages/auth.en.json";
import authZhMessages from "./messages/auth.zh.json";
import geospatialEnMessages from "./messages/geospatial.en.json";
import geospatialZhMessages from "./messages/geospatial.zh.json";
import dataHelpEnMessages from "./messages/dataHelp.en.json";
import dataHelpZhMessages from "./messages/dataHelp.zh.json";
import cityServicesEnMessages from "./messages/cityServices.en.json";
import cityServicesZhMessages from "./messages/cityServices.zh.json";
import energyEnMessages from "./messages/energy.en.json";
import energyZhMessages from "./messages/energy.zh.json";
import enMessages from "./messages/en.json";
import linkedEventsEnMessages from "./messages/linkedEvents.en.json";
import linkedEventsZhMessages from "./messages/linkedEvents.zh.json";
import labelsEnMessages from "./messages/labels.en.json";
import labelsZhMessages from "./messages/labels.zh.json";
import mobilityEnMessages from "./messages/mobility.en.json";
import mobilityZhMessages from "./messages/mobility.zh.json";
import regionalProfileEnMessages from "./messages/regionalProfile.en.json";
import regionalProfileZhMessages from "./messages/regionalProfile.zh.json";
import roadRailEnMessages from "./messages/roadRail.en.json";
import roadRailZhMessages from "./messages/roadRail.zh.json";
import shellEnMessages from "./messages/shell.en.json";
import shellZhMessages from "./messages/shell.zh.json";
import transitEnMessages from "./messages/transit.en.json";
import transitZhMessages from "./messages/transit.zh.json";
import waterSnowEnMessages from "./messages/waterSnow.en.json";
import waterSnowZhMessages from "./messages/waterSnow.zh.json";
import weatherEnMessages from "./messages/weather.en.json";
import weatherZhMessages from "./messages/weather.zh.json";
import zhMessages from "./messages/zh.json";

export type LanguageMode = "en" | "zh";

export const LANGUAGE_STORAGE_KEY = "arkiwatch-language";

type StructuredMessages = {
  shell: Record<string, string>;
  weather: Record<string, string>;
  energy: Record<string, string>;
  transit: Record<string, string>;
  mobility: Record<string, string>;
  roadRail: Record<string, string>;
  airQuality: Record<string, string>;
  linkedEvents: Record<string, string>;
  waterSnow: Record<string, string>;
  regionalProfile: Record<string, string>;
  geospatial: Record<string, string>;
  cityServices: Record<string, string>;
  dataHelp: Record<string, string>;
  auth: Record<string, string>;
  assistant: Record<string, string>;
  labels: Record<string, string>;
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
  en: { ...shellEnMessages, ...weatherEnMessages, ...energyEnMessages, ...transitEnMessages, ...mobilityEnMessages, ...roadRailEnMessages, ...airQualityEnMessages, ...linkedEventsEnMessages, ...waterSnowEnMessages, ...regionalProfileEnMessages, ...geospatialEnMessages, ...cityServicesEnMessages, ...dataHelpEnMessages, ...authEnMessages, ...assistantEnMessages, ...labelsEnMessages },
  zh: { ...shellZhMessages, ...weatherZhMessages, ...energyZhMessages, ...transitZhMessages, ...mobilityZhMessages, ...roadRailZhMessages, ...airQualityZhMessages, ...linkedEventsZhMessages, ...waterSnowZhMessages, ...regionalProfileZhMessages, ...geospatialZhMessages, ...cityServicesZhMessages, ...dataHelpZhMessages, ...authZhMessages, ...assistantZhMessages, ...labelsZhMessages },
};

const DEFAULT_CONTEXT: I18nContextValue = {
  language: "en",
  t: (value) => value,
  tKey: (key) => key,
  enumLabel: (value) => humanizeValue(value),
  dataLabel: (value) => humanizeValue(value),
};

const I18nContext = createContext<I18nContextValue>(DEFAULT_CONTEXT);

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
}

function camelToSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function normalizeLabelText(value: string): string {
  return value.trim().toLowerCase().replace(/[()]/g, "").replace(/\s+/g, " ");
}

function buildLabelTextAliases(): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const [key, text] of Object.entries(labelsEnMessages.labels)) {
    const messageKey = `labels.${key}`;
    aliases[normalizeLabelText(text)] = messageKey;
    aliases[camelToSnake(key)] = messageKey;
    aliases[camelToSnake(key).replaceAll("_", " ")] = messageKey;
  }

  return aliases;
}

const LABEL_TEXT_ALIASES = buildLabelTextAliases();

function resolveLabelMessageKey(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const normalizedText = normalizeLabelText(trimmed);
  if (LABEL_TEXT_ALIASES[normalizedText]) {
    return LABEL_TEXT_ALIASES[normalizedText];
  }

  const normalizedToken = normalizeDynamicLabelToken(trimmed);
  if (normalizedToken && LABEL_TEXT_ALIASES[normalizedToken]) {
    return LABEL_TEXT_ALIASES[normalizedToken];
  }

  if (normalizedToken) {
    const camelKey = snakeToCamel(normalizedToken);
    if (labelsEnMessages.labels[camelKey as keyof typeof labelsEnMessages.labels]) {
      return `labels.${camelKey}`;
    }
  }

  return null;
}

const DYNAMIC_LABEL_ALIASES: Record<string, string> = {
  active: "shell.active",
  air: "shell.navAirQuality",
  alert: "shell.alert",
  background: "shell.statusCatalog",
  bad: "shell.bad",
  catalog: "shell.catalog",
  city_services: "shell.navCityServices",
  commute: "shell.commute",
  connected: "shell.statusActive",
  degraded: "shell.degraded",
  empty: "shell.empty",
  energy: "shell.navEnergy",
  error: "shell.error",
  events: "shell.navLinkedEvents",
  failing: "shell.failing",
  fetched: "shell.fetched",
  fresh: "shell.fresh",
  geospatial: "shell.navGeospatialBase",
  healthy: "shell.healthy",
  helsinki_metro: "shell.helsinkiMetro",
  helsinki_uusimaa: "shell.helsinkiUusimaa",
  high: "shell.high",
  home_air: "shell.homeAir",
  inactive: "shell.inactive",
  info: "shell.info",
  live: "shell.live",
  low: "shell.low",
  mapped: "shell.mapped",
  medium: "shell.medium",
  missing: "shell.missing",
  mobility: "shell.navMobility",
  neutral: "shell.neutral",
  not_collected: "shell.notCollected",
  outdoor: "shell.outdoor",
  partial: "shell.partial",
  pending: "shell.pending",
  planned: "shell.planned",
  ready: "shell.ready",
  regional_profile: "shell.navRegionalProfile",
  stale: "shell.stale",
  summary_only: "shell.summaryOnly",
  traffic: "shell.navRoadRail",
  transit: "shell.navTransit",
  warn: "shell.warn",
  watch: "shell.watch",
  water: "shell.navWaterAndSnow",
  weather: "shell.navWeather",
};

function normalizeDynamicLabelToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function resolveDynamicLabelKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeDynamicLabelToken(value);
  if (!normalized) {
    return null;
  }

  const alias = DYNAMIC_LABEL_ALIASES[normalized];
  if (alias) {
    return alias;
  }

  const camel = snakeToCamel(normalized);
  const structuredCandidates = [
    `shell.${camel}`,
    `shell.status${camel.charAt(0).toUpperCase()}${camel.slice(1)}`,
  ];

  for (const key of structuredCandidates) {
    if (resolveStructuredMessage("en", key)) {
      return key;
    }
  }

  return null;
}

function translateDynamicLabel(
  language: LanguageMode,
  value: string | null | undefined,
  fallback: (label: string) => string,
): string {
  const messageKey = resolveDynamicLabelKey(value);
  if (messageKey) {
    return translateMessageKey(language, messageKey);
  }

  const label = fallback(value ?? "");
  return label ? translateText(language, label) : "";
}

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

  const labelKey = resolveLabelMessageKey(value);
  if (labelKey) {
    return translateMessageKey(language, labelKey);
  }

  return LEGACY_MESSAGE_CATALOG.zh[value] ?? value;
}

export function translateEnumLabel(language: LanguageMode, value: string | null | undefined): string {
  return translateDynamicLabel(language, value, humanizeValue);
}

export function translateDataLabel(language: LanguageMode, value: string | null | undefined): string {
  const labelKey = resolveLabelMessageKey(value);
  if (labelKey) {
    return translateMessageKey(language, labelKey);
  }

  return translateDynamicLabel(
    language,
    value,
    (raw) => raw.replaceAll("_", " "),
  );
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
