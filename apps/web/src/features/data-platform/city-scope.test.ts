import { describe, expect, it } from "vitest";

import {
  categorySupportsCityScope,
  cityLabel,
  DEFAULT_CITY,
  normalizeCityValue
} from "./city-scope";

describe("city scope helpers", () => {
  it("normalizes supported city values and falls back for unknown values", () => {
    expect(normalizeCityValue(" Espoo ")).toBe("espoo");
    expect(normalizeCityValue("new york")).toBe(DEFAULT_CITY);
    expect(normalizeCityValue(null)).toBe(DEFAULT_CITY);
  });

  it("returns stable labels and category scoping support", () => {
    expect(cityLabel("vantaa")).toBe("Vantaa");
    expect(cityLabel("unknown")).toBe("Helsinki");
    expect(categorySupportsCityScope("weather")).toBe(true);
    expect(categorySupportsCityScope("energy")).toBe(false);
  });
});
