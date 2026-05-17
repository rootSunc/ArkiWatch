"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { prefetchPlatformHome } from "../queries/platform-queries";

export type UsePlatformNavPrefetchOptions = {
  city: string;
  date: string | null;
  userId?: string;
};

/**
 * Warm the queries a nav target needs before the user commits to it.
 *
 * Reuses the server prefetch path so the warmed keys are exactly the ones
 * `usePlatformHome` reads. Repeat hovers are free: `prefetchQuery` honours the
 * shared stale time and skips anything already cached.
 */
export function usePlatformNavPrefetch({
  city,
  date,
  userId,
}: UsePlatformNavPrefetchOptions): (navKey: string) => void {
  const queryClient = useQueryClient();

  return useCallback(
    (navKey: string) => {
      void prefetchPlatformHome(queryClient, {
        city,
        date,
        userId,
        activeNavKey: navKey,
        isHistorical: date !== null,
      }).catch(() => {
        // A failed warm-up is not user-visible; the real query will retry.
      });
    },
    [city, date, queryClient, userId],
  );
}
