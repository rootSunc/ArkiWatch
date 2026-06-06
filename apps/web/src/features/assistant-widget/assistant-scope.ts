import { formatTimestamp } from "@/features/shared/format";
import type { LanguageMode } from "@/features/data-platform/i18n";

/** Format a date-only scope without allowing the browser timezone to move it
 * to the previous or next calendar day. */
export function formatAssistantScopeDate(value: string, language: LanguageMode): string {
  return formatTimestamp(`${value}T12:00:00.000Z`, "date", language);
}
