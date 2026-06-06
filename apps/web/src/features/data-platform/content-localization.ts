import type { LanguageMode } from "./i18n";

/**
 * Returns the best available copy for a UI surface without changing the
 * canonical value used by the API. Localized fields are optional so live
 * sources can adopt them incrementally while the platform stays backwards
 * compatible with existing payloads.
 */
export function localizedContent(
  language: LanguageMode,
  value: string,
  simplifiedChineseValue?: string | null,
): string {
  if (language === "zh" && simplifiedChineseValue?.trim()) {
    return simplifiedChineseValue;
  }
  return value;
}
