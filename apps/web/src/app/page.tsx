import { DataPlatformHome } from "@/features/data-platform/data-platform-home";
import { fetchPlatformHome } from "@/features/data-platform/api";
import { normalizeCityValue } from "@/features/data-platform/city-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    city?: string;
  };
};

export default async function Page({ searchParams }: PageProps) {
  const selectedCity = normalizeCityValue(searchParams?.city);
  const { apiBaseUrl, defaultUserId, overview, weather, airQuality, energy, householdEnergy, history, roadRail, transit, error } =
    await fetchPlatformHome(selectedCity);

  return (
    <DataPlatformHome
      airQuality={airQuality}
      apiBaseUrl={apiBaseUrl}
      defaultUserId={defaultUserId}
      initialCity={selectedCity}
      energy={energy}
      householdEnergy={householdEnergy}
      history={history}
      error={error}
      overview={overview}
      roadRail={roadRail}
      transit={transit}
      weather={weather}
    />
  );
}
