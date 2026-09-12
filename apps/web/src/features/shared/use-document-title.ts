"use client";

import { useEffect } from "react";

/**
 * Retitles the document when the language changes without a navigation.
 *
 * The title itself is server-rendered from the language cookie, so this only
 * covers an in-page switch. It deliberately does not try to correct a title on
 * first load: Next streams metadata at an unpredictable point, and a client
 * write that lands first is simply overwritten. A visitor whose language is
 * only in localStorage therefore sees the default title once, and the boot
 * script in app/layout.tsx seeds the cookie so every later load is correct.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (document.title !== title) {
      document.title = title;
    }
  }, [title]);
}
