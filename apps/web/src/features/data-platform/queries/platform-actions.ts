"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

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

type ErrorPayload = {
  detail?: unknown;
  message?: unknown;
};

export async function readPlatformActionError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
  const detail =
    typeof payload?.detail === "string"
      ? payload.detail
      : typeof payload?.message === "string"
        ? payload.message
        : null;
  return new Error(detail?.trim() || fallback);
}

const REFRESH_POLL_INTERVAL_MS = 2000;
const REFRESH_POLL_TIMEOUT_MS = 10 * 60 * 1000;

function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) {
    return reason;
  }

  return new DOMException("The refresh request was cancelled.", "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError(signal);
  }
}

async function refreshPlatformSources(signal: AbortSignal): Promise<RefreshEnqueueResponse> {
  const response = await fetch("/api/sources/refresh", {
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw await readPlatformActionError(response, "Failed to refresh data sources");
  }

  return (await response.json()) as RefreshEnqueueResponse;
}

async function fetchRefreshStatus(signal: AbortSignal): Promise<RefreshStatusResponse> {
  const response = await fetch("/api/sources/refresh/status", {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await readPlatformActionError(response, "Failed to load refresh status");
  }

  return (await response.json()) as RefreshStatusResponse;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(abortError(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitForRefreshSettlement(
  signal: AbortSignal,
): Promise<RefreshStatusResponse> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < REFRESH_POLL_TIMEOUT_MS) {
    throwIfAborted(signal);
    const status = await fetchRefreshStatus(signal);
    if (status.status === "missing") {
      throw new Error("Platform refresh job is not configured on the scheduler");
    }
    if (status.status === "succeeded" || status.status === "failed") {
      if (status.status === "failed") {
        throw new Error(status.last_error || "Platform refresh failed");
      }
      return status;
    }
    await sleep(REFRESH_POLL_INTERVAL_MS, signal);
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
  const refreshControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      refreshControllerRef.current?.abort();
      refreshControllerRef.current = null;
    };
  }, []);

  return useMutation({
    mutationFn: async () => {
      refreshControllerRef.current?.abort();
      const controller = new AbortController();
      refreshControllerRef.current = controller;

      try {
        const enqueueResult = await refreshPlatformSources(controller.signal);
        if (
          enqueueResult.status !== "accepted" &&
          enqueueResult.status !== "already_running"
        ) {
          throw new Error(enqueueResult.message || "Failed to queue platform refresh");
        }
        await waitForRefreshSettlement(controller.signal);
        return enqueueResult;
      } finally {
        if (refreshControllerRef.current === controller) {
          refreshControllerRef.current = null;
        }
      }
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
