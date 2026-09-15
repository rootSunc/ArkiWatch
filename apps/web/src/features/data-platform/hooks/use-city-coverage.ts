"use client";
import { useEffect, useState } from "react";
import type { components } from "@/lib/api-contract";
import { createApiClient, resolveApiBaseUrl } from "@/lib/api-client";
import { appEnv } from "@/lib/env";
import coverage from "../generated/coverage.json";

type Coverage = components["schemas"]["PlatformCoverageRead"];

export function useCityCoverage(): Coverage {
 const [value, setValue] = useState<Coverage>(coverage);
 useEffect(() => {
  if (appEnv.demoMode) return;
  const controller = new AbortController();
  const client = createApiClient({ baseUrl: resolveApiBaseUrl(), signal: controller.signal });
  void client.get<Coverage>("/platform/coverage").then((result) => {
   if (!controller.signal.aborted && result.data?.cities.length) setValue(result.data);
  }).catch(() => {});
  return () => controller.abort();
 }, []);
 return value;
}
