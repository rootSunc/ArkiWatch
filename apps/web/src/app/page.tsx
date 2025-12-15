import { fetchDashboard } from "@/features/home/api";
import { HomePage } from "@/features/home/home-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { apiBaseUrl, dashboard, error } = await fetchDashboard();

  return <HomePage apiBaseUrl={apiBaseUrl} dashboard={dashboard} error={error} />;
}
