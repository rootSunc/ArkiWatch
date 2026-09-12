import shellEnMessages from "./messages/shell.en.json";
import shellZhMessages from "./messages/shell.zh.json";
import type { LanguageMode } from "./language";

/**
 * Page metadata text for server components.
 *
 * `i18n.tsx` is a client module, so its translator cannot run during a server
 * render. This reads the same shell catalogue, which keeps the titles in one
 * place rather than duplicating them per route.
 */
const SHELL_MESSAGES: Record<LanguageMode, Record<string, string>> = {
  en: shellEnMessages.shell,
  zh: shellZhMessages.shell,
};

export function metadataText(language: LanguageMode, key: string): string {
  return SHELL_MESSAGES[language][key] ?? SHELL_MESSAGES.en[key] ?? key;
}
