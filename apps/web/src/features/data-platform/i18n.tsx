"use client";

import {
  documentLanguageTag,
  isLanguageMode,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  type LanguageMode,
} from "./language";
import { NextIntlClientProvider } from "next-intl";
import { createContext, ReactNode, useContext, useEffect, useLayoutEffect, useMemo } from "react";

import labelsEnMessages from "./messages/labels.en.json";

export type { LanguageMode } from "./language";
export const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  metricLabel: (metric: MetricLabelSource | null | undefined) => string;
  dataItemLabel: (item: { key: string; label_key: string } | string) => string;
};

export type MetricLabelSource = {
  key: string;
  label?: string | null;
  label_key?: string | null;
};

export type MessageCatalog = {
  legacy: Record<string, string>;
  structured: StructuredMessages;
};

const legacyCatalogs: Partial<Record<LanguageMode, Record<string, string>>> = {};
const structuredCatalogs: Partial<Record<LanguageMode, StructuredMessages>> = {};

export function installMessageCatalog(language: LanguageMode, catalog: MessageCatalog): void {
  legacyCatalogs[language] = catalog.legacy;
  structuredCatalogs[language] = catalog.structured;
}

export function hasMessageCatalog(language: LanguageMode): boolean {
  return structuredCatalogs[language] != null;
}

const DEFAULT_CONTEXT: I18nContextValue = {
  language: "en",
  t: (value) => value,
  tKey: (key) => key,
  enumLabel: (value) => humanizeValue(value),
  dataLabel: (value) => humanizeValue(value),
  metricLabel: (metric) => metric?.label ?? metric?.key ?? "",
  dataItemLabel: (item) => (typeof item === "string" ? item : item.key),
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
  good: "shell.good",
  good_window: "shell.goodWindow",
  geospatial: "shell.navGeospatialBase",
  healthy: "shell.healthy",
  helsinki_region: "shell.helsinkiRegion",
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
  needs_attention: "shell.needsAttention",
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
    `labels.${camel}`,
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

  const namespaceMessages = structuredCatalogs[language]?.[
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

export function preferredLanguageMode(): LanguageMode {
  if (typeof navigator === "undefined") {
    return "en";
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/**
 * The language this document was rendered in, as the server decided it.
 *
 * The client must not re-derive the language from scratch and overwrite what
 * the server already localized — the document, its metadata and its copy would
 * disagree. The stored preference still wins, since that is the choice the
 * visitor made most recently.
 */
export function resolveClientLanguage(): LanguageMode {
  const stored = storedLanguageMode();
  if (stored) {
    return stored;
  }

  const rendered = typeof document === "undefined" ? null : document.documentElement.dataset.language;
  return isLanguageMode(rendered ?? null) ? (rendered as LanguageMode) : preferredLanguageMode();
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

  document.documentElement.lang = documentLanguageTag(language);
  document.documentElement.dataset.language = language;
  // Mirrored to a cookie so the next server render emits the right metadata.
  document.cookie = `${LANGUAGE_COOKIE}=${language};path=/;max-age=31536000;samesite=lax`;
}

function translateText(language: LanguageMode, value: string): string {
  if (language === "en") {
    return value;
  }

  const labelKey = resolveLabelMessageKey(value);
  if (labelKey) {
    return translateMessageKey(language, labelKey);
  }

  return legacyCatalogs.zh?.[value] ?? value;
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

export function translateMetricLabel(
  language: LanguageMode,
  metric: MetricLabelSource | null | undefined,
): string {
  if (!metric) {
    return "";
  }

  const structuredKey = metric.label_key ?? snakeToCamel(normalizeDynamicLabelToken(metric.key) ?? metric.key);
  const resolved = resolveStructuredMessage(language, `labels.${structuredKey}`);
  if (resolved) {
    return resolved;
  }

  return translateDataLabel(language, metric.label ?? metric.key);
}

export function translateKeyDataItemLabel(
  language: LanguageMode,
  item: { key: string; label_key: string } | string,
): string {
  if (typeof item === "string") {
    return translateDataLabel(language, item);
  }

  return translateMetricLabel(language, {
    key: item.key,
    label_key: item.label_key,
  });
}

export function I18nProvider({
  children,
  language,
  messages,
}: {
  children: ReactNode;
  language: LanguageMode;
  messages?: MessageCatalog;
}) {
  if (messages) {
    installMessageCatalog(language, messages);
  }
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      t: (text) => translateText(language, text),
      tKey: (key) => translateMessageKey(language, key),
      enumLabel: (text) => translateEnumLabel(language, text),
      dataLabel: (text) => translateDataLabel(language, text),
      metricLabel: (metric) => translateMetricLabel(language, metric),
      dataItemLabel: (item) => translateKeyDataItemLabel(language, item),
    }),
    [language],
  );

  return (
    <NextIntlClientProvider
      locale={language}
      messages={{
        ...legacyCatalogs[language],
        ...structuredCatalogs[language],
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
