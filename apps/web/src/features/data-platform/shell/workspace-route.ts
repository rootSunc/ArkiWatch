export type WorkspaceRoute =
  | "air"
  | "city_services"
  | "energy"
  | "geospatial"
  | "linked_events"
  | "mobility"
  | "regional_profile"
  | "water"
  | "weather";

export function workspaceRouteForCategory(
  categoryKey: string | null | undefined,
): WorkspaceRoute | null {
  switch (categoryKey) {
    case "air":
    case "city_services":
    case "energy":
    case "geospatial":
    case "mobility":
    case "regional_profile":
    case "water":
    case "weather":
      return categoryKey;
    case "events":
      return "linked_events";
    default:
      return null;
  }
}
