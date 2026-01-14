import { DataPlatformHome } from "@/features/data-platform/data-platform-home";
import { fetchPlatformHome } from "@/features/data-platform/api";
import { normalizeCityValue } from "@/features/data-platform/city-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    city?: string;
    date?: string;
  };
};

export default async function Page({ searchParams }: PageProps) {
  const selectedCity = normalizeCityValue(searchParams?.city);
  const selectedDate = searchParams?.date ?? null;
  const { apiBaseUrl, defaultUserId, overview, weather, airQuality, energy, householdEnergy, history, roadRail, transit, error } =
    await fetchPlatformHome(selectedCity, selectedDate);

  return (
    <DataPlatformHome
      airQuality={airQuality}
      apiBaseUrl={apiBaseUrl}
      defaultUserId={defaultUserId}
      initialCity={selectedCity}
      initialDate={selectedDate}
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
