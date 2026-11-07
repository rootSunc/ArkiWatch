import { localizedContent } from "./content-localization";
import { isCatalogCategoryKey } from "./data-platform-nav-utils";
import {
  displayTitle,
  eventCategoryLabel,
  eventMatchesSearch,
  isNotificationEvent,
  matchesSearch,
  notificationToneForEvents,
  pickPriorityEvent,
  recentEventLabel,
} from "./data-platform-view-model";
import type { LanguageMode } from "./language";
import type { DashboardTone } from "./data-platform-shell";
import type { PlatformCategory, PlatformEvent } from "./types";

type SignalViewInput = {
  categoryEvents?: Record<string, PlatformEvent[]>;
  /** Non-null when a single workspace is in view rather than the whole catalogue. */
  selectedCategory: PlatformCategory | null;
  displayCategories: PlatformCategory[];
  categories: PlatformCategory[];
  recentEvents: PlatformEvent[];
  searchValue: string;
  language: LanguageMode;
  readRecentEventIds: Set<string>;
  selectedCity: string;
  eventReferenceAt: string | null;
  tKey: (key: string) => string;
};

export type SignalView = {
  primaryVisibleCategories: PlatformCategory[];
  catalogVisibleCategories: PlatformCategory[];
  visibleEvents: PlatformEvent[];
  unreadVisibleEvents: PlatformEvent[];
  visibleNotificationEvents: PlatformEvent[];
  latestVisibleEvent: PlatformEvent | null;
  latestUnreadEvent: PlatformEvent | null;
  latestEventTone: DashboardTone;
  recentNotificationCount: number;
  recentNotificationTone: DashboardTone;
  overallNotificationTitle: string;
  overallNotificationBody: string;
  overallNotificationDetail: string;
};

/**
 * What the signal surface shows for the current search and scope.
 *
 * The search box filters categories and events together, and the summary card
 * above them has to describe the filtered set rather than the whole catalogue —
 * otherwise it reports activity the reader cannot see.
 */
export function buildSignalView({
  selectedCategory,
  displayCategories,
  categories,
  recentEvents,
  searchValue,
  language,
  readRecentEventIds,
  categoryEvents,
  tKey,
}: SignalViewInput): SignalView {
  const scopedCategories = selectedCategory ? [selectedCategory] : displayCategories;
  const visibleCategories = scopedCategories.filter((category) =>
    matchesSearch(category, searchValue, language),
  );

  const scopedEvents = selectedCategory
    ? categoryEvents?.[selectedCategory.key] ?? []
    : recentEvents;
  const visibleEvents = scopedEvents.filter((event) =>
    eventMatchesSearch(event, searchValue, language),
  );

  const unreadVisibleEvents = visibleEvents.filter((event) => !readRecentEventIds.has(event.id));
  const visibleNotificationEvents = visibleEvents.filter(isNotificationEvent);
  const unreadRecentEvents = recentEvents.filter((event) => !readRecentEventIds.has(event.id));
  const latestVisibleEvent = visibleEvents[0] ?? null;
  const priorityVisibleEvent = pickPriorityEvent(visibleNotificationEvents);

  const scopeLabel = selectedCategory
    ? displayTitle(selectedCategory, language)
    : tKey("shell.overall");

  return {
    primaryVisibleCategories: visibleCategories.filter(
      (category) => !isCatalogCategoryKey(category.key),
    ),
    catalogVisibleCategories: visibleCategories.filter((category) =>
      isCatalogCategoryKey(category.key),
    ),
    visibleEvents,
    unreadVisibleEvents,
    visibleNotificationEvents,
    latestVisibleEvent,
    latestUnreadEvent: unreadVisibleEvents[0] ?? latestVisibleEvent,
    latestEventTone: notificationToneForEvents(
      unreadVisibleEvents.length > 0 ? unreadVisibleEvents : visibleNotificationEvents,
    ),
    recentNotificationCount: unreadRecentEvents.length,
    recentNotificationTone: notificationToneForEvents(unreadRecentEvents),
    overallNotificationTitle:
      visibleNotificationEvents.length > 0
        ? `${scopeLabel}, ${recentEventLabel(visibleNotificationEvents.length, language)}`
        : `${scopeLabel}, ${tKey("shell.noActiveNotifications")}`,
    overallNotificationBody: priorityVisibleEvent
      ? `${eventCategoryLabel(categories, priorityVisibleEvent, language)}, ${localizedContent(
          language,
          priorityVisibleEvent.title,
          priorityVisibleEvent.title_zh,
        )}`
      : tKey("shell.noActiveCrossSignalNotificationsInThisView"),
    overallNotificationDetail:
      (priorityVisibleEvent
        ? localizedContent(language, priorityVisibleEvent.body, priorityVisibleEvent.body_zh)
        : null) ?? tKey("shell.recentEventsRemainAvailableBelowForSourceLevelInspection"),
  };
}
