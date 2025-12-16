import { DataPlatformHome } from "@/features/data-platform/data-platform-home";
import { fetchPlatformHome } from "@/features/data-platform/api";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { apiBaseUrl, defaultUserId, overview, error } = await fetchPlatformHome();

  return (
    <DataPlatformHome
      apiBaseUrl={apiBaseUrl}
      defaultUserId={defaultUserId}
      error={error}
      overview={overview}
    />
  );
}
