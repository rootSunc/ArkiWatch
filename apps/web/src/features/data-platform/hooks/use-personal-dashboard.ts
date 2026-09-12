"use client";

import { useQuery } from "@tanstack/react-query";

import { unwrapApiResult } from "@/lib/api-client";

import { fetchPersonalDashboard } from "../personal-dashboard";

const PERSONAL_DASHBOARD_STALE_TIME_MS = 60 * 1000;

const personalDashboardKeys = {
  all: ["personal-dashboard"] as const,
  current: (userId: string | undefined) =>
    [...personalDashboardKeys.all, userId ?? "anonymous"] as const,
};

export function usePersonalDashboard({
  enabled,
  userId,
}: {
  enabled: boolean;
  userId?: string;
}) {
  const query = useQuery({
    queryKey: personalDashboardKeys.current(userId),
    queryFn: async ({ signal }) => unwrapApiResult(await fetchPersonalDashboard(signal)),
    enabled: enabled && Boolean(userId),
    staleTime: PERSONAL_DASHBOARD_STALE_TIME_MS,
    // Personal setup can be edited on a separate route. Always revalidate on
    // mount so returning to Today never shows an old completion state.
    refetchOnMount: "always",
    retry: false,
  });

  return {
    dashboard: query.data ?? null,
    error: query.error instanceof Error ? query.error.message : null,
    isPending: query.isPending,
    retry: async () => {
      await query.refetch();
    },
  };
}
