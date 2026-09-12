"use client";

import type { Ref } from "react";

import { AssistantGlyph } from "@/features/assistant-widget/assistant-glyph";

import type { NavItem } from "./data-platform-shell";
import { useI18n } from "./i18n";

const MOBILE_ITEM_LABEL_KEYS: Record<string, string> = {
  today: "shell.navToday",
  overview: "shell.navSignalsShort",
  weather: "shell.navWeather",
  mobility: "shell.navMobilityShort",
};

function mobileItemLabelKey(itemKey: string, fallbackLabelKey: string): string {
  return MOBILE_ITEM_LABEL_KEYS[itemKey] ?? `shell.${fallbackLabelKey}`;
}

type MobileBottomNavProps = {
  assistantButtonRef: Ref<HTMLButtonElement>;
  isScopePending: boolean;
  items: NavItem[];
  onOpenAssistant: () => void;
  onSelectNavItem: (item: NavItem) => void;
  selectedNavKey: string;
};

/**
 * The compact mobile navigation stays intentionally presentational. Scope
 * transitions and assistant state belong to the page controller; this
 * component only renders the small set of high-value destinations.
 */
export function MobileBottomNav({
  assistantButtonRef,
  isScopePending,
  items,
  onOpenAssistant,
  onSelectNavItem,
  selectedNavKey,
}: MobileBottomNavProps) {
  const { tKey } = useI18n();

  return (
    <footer
      className="mobile-dashboard-footer"
      aria-label={tKey("shell.mobileNavigation")}
    >
      {/* Distinct from the sidebar nav, which carries the same label on desktop.
        Two landmarks sharing one accessible name is ambiguous for screen-reader
        landmark lists. */}
      <nav className="mobile-bottom-nav" aria-label={tKey("shell.signalShortcuts")}>
        {items.map((item) => {
          const isActive =
            selectedNavKey === item.key ||
            (item.categoryKey != null && selectedNavKey === item.categoryKey);

          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "mobile-bottom-nav-item mobile-bottom-nav-item-active"
                  : "mobile-bottom-nav-item"
              }
              key={item.key}
              onClick={() => onSelectNavItem(item)}
              title={tKey(`shell.${item.labelKey}`)}
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.icon}
              </span>
              <span>{tKey(mobileItemLabelKey(item.key, item.labelKey))}</span>
            </button>
          );
        })}
        <button
          aria-disabled={isScopePending || undefined}
          className="mobile-bottom-nav-item mobile-bottom-nav-assistant"
          disabled={isScopePending}
          onClick={() => onOpenAssistant()}
          ref={assistantButtonRef}
          title={
            isScopePending
              ? tKey("shell.scopeUpdating")
              : tKey("assistant.openAssistant")
          }
          type="button"
        >
          <AssistantGlyph />
          <span>{tKey("shell.ask")}</span>
        </button>
      </nav>
    </footer>
  );
}
