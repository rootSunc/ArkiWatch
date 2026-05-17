import { dehydrate } from "@tanstack/react-query";

import { DataPlatformHome } from "@/features/data-platform/data-platform-home";
import { prefetchPlatformHome } from "@/features/data-platform/queries/platform-queries";
import { normalizeCityValue } from "@/features/data-platform/city-scope";
import { normalizeSourceDateValue } from "@/features/data-platform/time-window";
import { getCurrentSession } from "@/features/auth/session";
import { getQueryClient } from "@/lib/query-client";
import { QueryProvider } from "@/providers/query-provider";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    city?: string;
    date?: string;
    view?: string;
    mobilityTab?: string;
    energyTab?: string;
  };
};

export default async function Page({ searchParams }: PageProps) {
  const session = await getCurrentSession();
  const selectedCity = normalizeCityValue(searchParams?.city);
  const selectedDate = normalizeSourceDateValue(searchParams?.date);
  const queryClient = getQueryClient();

  // Deliberately not awaited: the prefetch calls register their queries
  // synchronously, so dehydrate() below captures them as pending and React
  // streams the results in. Awaiting here would block the whole first paint on
  // the slowest upstream request.
  void prefetchPlatformHome(queryClient, {
    city: selectedCity,
    date: selectedDate,
    authToken: session?.token,
    userId: session?.user.id,
    activeNavKey: searchParams?.view ?? "today",
    isHistorical: Boolean(selectedDate),
  }).catch(() => {
    // Failures surface through the dehydrated query state on the client.
  });

  return (
    <QueryProvider dehydratedState={dehydrate(queryClient)}>
      <DataPlatformHome
        currentUserLabel={
          session ? session.user.name ?? session.user.email ?? session.user.id : "Demo view"
        }
        defaultUserId={session?.user.id}
        initialCity={selectedCity}
        initialDate={selectedDate}
        initialView={searchParams?.view ?? null}
        isAuthenticated={Boolean(session)}
      />
    </QueryProvider>
  );
}
