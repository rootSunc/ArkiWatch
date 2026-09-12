/**
 * The display language, shared by the client store and the server renderer.
 *
 * Kept out of `i18n.tsx` because that module is client-only, and the server
 * needs the cookie name and the guard to render localized metadata.
 */
export type LanguageMode = "en" | "zh";

export const LANGUAGE_STORAGE_KEY = "arkiwatch-language";

/**
 * Mirrors the stored language so the server can render the right `<title>` and
 * `lang` on the first pass. Without it the document renders in English and the
 * client has to correct it after hydration.
 */
export const LANGUAGE_COOKIE = "arkiwatch-language";

export function isLanguageMode(value: string | null | undefined): value is LanguageMode {
  return value === "en" || value === "zh";
}

export function documentLanguageTag(language: LanguageMode): string {
  return language === "zh" ? "zh-CN" : "en";
}
