import { DataPlatformHome } from "@/features/data-platform/data-platform-home";
import { fetchPlatformHome } from "@/features/data-platform/api";
import { normalizeCityValue } from "@/features/data-platform/city-scope";
import { normalizeSourceDateValue } from "@/features/data-platform/time-window";
import { requireSession } from "@/features/auth/session";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    city?: string;
    date?: string;
  };
};

export default async function Page({ searchParams }: PageProps) {
  const session = await requireSession();
  const selectedCity = normalizeCityValue(searchParams?.city);
  const selectedDate = normalizeSourceDateValue(searchParams?.date);
  const { apiBaseUrl, defaultUserId, overview, weather, airQuality, energy, householdEnergy, history, roadRail, transit, error } =
    await fetchPlatformHome(selectedCity, selectedDate, {
      authToken: session.token,
      userId: session.user.id,
    });

  return (
    <DataPlatformHome
      airQuality={airQuality}
      apiBaseUrl={apiBaseUrl}
      currentUserLabel={session.user.name ?? session.user.email ?? session.user.id}
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
