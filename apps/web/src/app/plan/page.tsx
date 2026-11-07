import Page from "../page";
export const dynamic = "force-dynamic";
export default async function PlanPage(props: Parameters<typeof Page>[0]) {
  const params = await props.searchParams;
  return Page({ searchParams: Promise.resolve({ ...params, view: "today" }) });
}
