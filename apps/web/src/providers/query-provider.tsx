"use client";

import { HydrationBoundary, QueryClientProvider } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { ReactNode } from "react";

import { getQueryClient } from "@/lib/query-client";

type QueryProviderProps = {
  children: ReactNode;
  dehydratedState?: DehydratedState;
};

export function QueryProvider({ children, dehydratedState }: QueryProviderProps) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
    </QueryClientProvider>
  );
}
