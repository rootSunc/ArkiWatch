import { DataPlatformHome } from "@/features/data-platform/data-platform-home";
import { fetchPlatformHome } from "@/features/data-platform/api";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { apiBaseUrl, defaultUserId, overview, weather, airQuality, error } =
    await fetchPlatformHome();

  return (
    <DataPlatformHome
      airQuality={airQuality}
      apiBaseUrl={apiBaseUrl}
      defaultUserId={defaultUserId}
      error={error}
      overview={overview}
      weather={weather}
    />
  );
}
