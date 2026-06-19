import type { KeyboardEvent } from "react";

export type TabNavigationItem<Key extends string> = {
  key: Key;
};

/**
 * Keep manually activated tabs usable with the keyboard while preserving the
 * URL/state update owned by the workspace that renders them.
 */
export function handleTabListKeyDown<Key extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  tabs: readonly TabNavigationItem<Key>[],
  activeKey: Key,
  onChange: (key: Key) => void,
  idPrefix: string,
): void {
  if (tabs.length < 2) {
    return;
  }

  const activeIndex = tabs.findIndex((tab) => tab.key === activeKey);
  if (activeIndex < 0) {
    return;
  }

  let nextIndex: number | null = null;
  switch (event.key) {
    case "ArrowRight":
      nextIndex = (activeIndex + 1) % tabs.length;
      break;
    case "ArrowLeft":
      nextIndex = (activeIndex - 1 + tabs.length) % tabs.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = tabs.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  const nextKey = tabs[nextIndex].key;
  onChange(nextKey);
  window.requestAnimationFrame(() => {
    document.getElementById(`${idPrefix}-${nextKey}`)?.focus();
  });
}
