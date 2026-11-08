import { cookies } from "next/headers";
import { dehydrate } from "@tanstack/react-query";

import { DataPlatformHome } from "@/features/data-platform/data-platform-home";
import { prefetchPlatformHome } from "@/features/data-platform/queries/platform-queries";
import { normalizeCityValue } from "@/features/data-platform/model/city-scope";
import { requestLanguage } from "@/features/data-platform/server-language";
import { serverMessageCatalog } from "@/features/data-platform/messages/server-catalog";
import { normalizeSourceDateValue } from "@/features/data-platform/model/time-window";
import { SESSION_COOKIE_NAME } from "@/features/auth/config";
import { appEnv } from "@/lib/env";
import { getQueryClient } from "@/lib/query-client";
import { QueryProvider } from "@/providers/query-provider";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    city?: string;
    date?: string;
    view?: string;
    mobilityTab?: string;
    energyTab?: string;
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const hasSessionCookie = Boolean((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  const language = await requestLanguage();
  const selectedCity = normalizeCityValue(resolvedSearchParams?.city);
  const selectedDate = normalizeSourceDateValue(resolvedSearchParams?.date);
  const queryClient = getQueryClient();

  if (appEnv.demoMode) {
    // Demo fixtures resolve locally. Awaiting them keeps the server HTML and
    // hydrated client tree identical, so the first-run path has no hydration
    // warning or loading flash.
    await prefetchPlatformHome(queryClient, {
      city: selectedCity,
      date: selectedDate,
      activeNavKey: resolvedSearchParams?.view ?? "overview",
      isHistorical: Boolean(selectedDate),
    }).catch(() => undefined);
  }

  return (
    <QueryProvider
      dehydratedState={dehydrate(queryClient, {
        // Only deterministic demo queries are prefetched on the server. Live
        // queries start in the browser so each request has one owner and a
        // failed upstream cannot leave an abandoned server-side request.
        shouldDehydrateQuery: (query) => query.state.status === "success",
      })}
    >
      <DataPlatformHome
        hasSessionCookie={hasSessionCookie}
        initialCity={selectedCity}
        initialDate={selectedDate}
        initialLanguage={language}
        initialView={resolvedSearchParams?.view ?? null}
        messages={serverMessageCatalog(language)}
      />
    </QueryProvider>
  );
}
