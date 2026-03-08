"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { platformKeys } from "./platform-queries";

async function refreshPlatformSources(): Promise<void> {
  const response = await fetch("/api/sources/refresh", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to refresh data sources");
  }
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
    mutationFn: refreshPlatformSources,
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
