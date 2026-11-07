import { dehydrate } from "@tanstack/react-query";

import { DataPlatformHome } from "@/features/data-platform/data-platform-home";
import { prefetchPlatformHome } from "@/features/data-platform/queries/platform-queries";
import { normalizeCityValue } from "@/features/data-platform/city-scope";
import { normalizeSourceDateValue } from "@/features/data-platform/time-window";
import { getCurrentSession } from "@/features/auth/session";
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
  const session = await getCurrentSession();
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
      authToken: session?.token,
      userId: session?.user.id,
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
        currentUserLabel={
          session ? session.user.name ?? session.user.email ?? session.user.id : "Demo view"
        }
        defaultUserId={session?.user.id}
        initialCity={selectedCity}
        initialDate={selectedDate}
        initialView={resolvedSearchParams?.view ?? null}
        isAuthenticated={Boolean(session)}
      />
    </QueryProvider>
  );
}
