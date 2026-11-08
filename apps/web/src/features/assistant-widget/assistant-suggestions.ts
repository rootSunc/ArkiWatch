import { displayTitle } from "@/features/data-platform/model/data-platform-view-model";
import { translateMessageKey, type LanguageMode } from "@/features/data-platform/i18n";
import type { PlatformCategory, PlatformOverviewResponse } from "@/features/data-platform/types";

export function assistantCategoryLabel(
  category: PlatformCategory | undefined,
  language: LanguageMode,
): string {
  return category
    ? displayTitle(category, language)
    : translateMessageKey(language, "shell.navWeather");
}

export function firstAssistantCategoryLabel(
  overview: PlatformOverviewResponse | null,
  language: LanguageMode,
): string {
  return assistantCategoryLabel(overview?.categories[0], language);
}
