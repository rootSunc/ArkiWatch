import { describe, expect, it } from "vitest";

import { isCatalogCategoryKey } from "./data-platform-nav-utils";

describe("isCatalogCategoryKey", () => {
  it("keeps reference catalog domains out of the core signal group", () => {
    expect(isCatalogCategoryKey("city_services")).toBe(true);
    expect(isCatalogCategoryKey("geospatial")).toBe(true);
    expect(isCatalogCategoryKey("regional_profile")).toBe(true);
  });

  it("keeps everyday signal domains in the primary group", () => {
    expect(isCatalogCategoryKey("weather")).toBe(false);
    expect(isCatalogCategoryKey("mobility")).toBe(false);
  });
});
