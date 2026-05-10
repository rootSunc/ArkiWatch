"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { platformKeys } from "./platform-queries";

type RefreshEnqueueResponse = {
  status: "accepted" | "already_running" | string;
  job_id?: string;
  job_key?: string;
  message?: string;
};

type RefreshStatusResponse = {
  status: "queued" | "running" | "succeeded" | "failed" | "idle" | "missing" | string;
  last_status?: string | null;
  last_error?: string | null;
};

const REFRESH_POLL_INTERVAL_MS = 2000;
const REFRESH_POLL_TIMEOUT_MS = 10 * 60 * 1000;

async function refreshPlatformSources(): Promise<RefreshEnqueueResponse> {
  const response = await fetch("/api/sources/refresh", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to refresh data sources");
  }

  return (await response.json()) as RefreshEnqueueResponse;
}

async function fetchRefreshStatus(): Promise<RefreshStatusResponse> {
  const response = await fetch("/api/sources/refresh/status", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load refresh status");
  }

  return (await response.json()) as RefreshStatusResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForRefreshSettlement(): Promise<RefreshStatusResponse> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < REFRESH_POLL_TIMEOUT_MS) {
    const status = await fetchRefreshStatus();
    if (status.status === "missing") {
      throw new Error("Platform refresh job is not configured on the scheduler");
    }
    if (status.status === "succeeded" || status.status === "failed") {
      if (status.status === "failed") {
        throw new Error(status.last_error || "Platform refresh failed");
      }
      return status;
    }
    await sleep(REFRESH_POLL_INTERVAL_MS);
  }

  throw new Error("Platform refresh timed out");
}

async function signOutRequest(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
  }).catch(() => null);
}

export function useRefreshPlatformData() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      const enqueueResult = await refreshPlatformSources();
      if (
        enqueueResult.status !== "accepted" &&
        enqueueResult.status !== "already_running"
      ) {
        throw new Error(enqueueResult.message || "Failed to queue platform refresh");
      }
      await waitForRefreshSettlement();
      return enqueueResult;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: platformKeys.all });
      router.refresh();
    },
  });
}

export function useSignOut() {
  const router = useRouter();

  return useMutation({
    mutationFn: signOutRequest,
    onSettled: () => {
      router.replace("/");
      router.refresh();
    },
  });
}
