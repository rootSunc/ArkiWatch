"use client";

import { useEffect } from "react";

/**
 * Holds the document title to the current language.
 *
 * The server renders the title from the language cookie, so normally there is
 * nothing to correct. Two cases still need this: an in-page language switch,
 * and a visitor whose language is in localStorage but not yet in a cookie,
 * whose streamed metadata can arrive after the first client render. Rather
 * than guess at a delay, watch the head and re-assert until unmount.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const apply = () => {
      if (document.title !== title) {
        document.title = title;
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}
