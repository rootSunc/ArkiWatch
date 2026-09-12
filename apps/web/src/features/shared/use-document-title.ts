"use client";

import { useEffect } from "react";

/**
 * Retitles the document when the language changes without a navigation.
 *
 * The server already renders the right title from the language cookie, so this
 * only covers an in-page switch; there is no race with streamed metadata to
 * fight.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (document.title !== title) {
      document.title = title;
    }
  }, [title]);
}
