"use client";

import { useEffect } from "react";

import { eventAnchorId } from "../recent-events";

/** How long to keep waiting for a deep-linked event that may never render. */
const WAIT_LIMIT_MS = 3000;

/** How long the arrival highlight stays on the row. */
const HIGHLIGHT_MS = 1800;

/**
 * Scrolls a deep-linked event into view once its row exists.
 *
 * The row belongs to a workspace that is still loading when the link is
 * followed, so the element is usually absent on the first pass. Waiting on a
 * mutation rather than polling means it lands as soon as the row mounts, and
 * the limit only exists for a link whose event is not in the current scope.
 */
export function useEventAnchorScroll(eventId: string | null, enabled: boolean): void {
  useEffect(() => {
    if (!eventId || !enabled) {
      return;
    }

    let highlightTimeout: number | null = null;

    const reveal = (element: HTMLElement) => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      element.scrollIntoView({ behavior, block: "center" });
      element.classList.add("event-anchor-active");
      highlightTimeout = window.setTimeout(
        () => element.classList.remove("event-anchor-active"),
        HIGHLIGHT_MS,
      );
    };

    const find = () => document.getElementById(eventAnchorId(eventId));

    const existing = find();
    if (existing) {
      reveal(existing);
      return () => {
        if (highlightTimeout !== null) {
          window.clearTimeout(highlightTimeout);
        }
      };
    }

    const observer = new MutationObserver(() => {
      const element = find();
      if (element) {
        observer.disconnect();
        reveal(element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const giveUp = window.setTimeout(() => observer.disconnect(), WAIT_LIMIT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(giveUp);
      if (highlightTimeout !== null) {
        window.clearTimeout(highlightTimeout);
      }
    };
  }, [enabled, eventId]);
}
