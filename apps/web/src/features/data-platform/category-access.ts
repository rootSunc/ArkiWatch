import type { PlatformOverviewResponse } from "./types";

const HIDDEN_CATEGORY_KEYS: readonly string[] = [];

export function categoryVisibleToCurrentUser(
  categoryKey: string | null | undefined,
): boolean {
  return !categoryKey || !HIDDEN_CATEGORY_KEYS.includes(categoryKey);
}

export function filterPlatformOverviewForCurrentUser(
  overview: PlatformOverviewResponse | null,
): PlatformOverviewResponse | null {
  return overview;
}
