import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("web app manifest", () => {
  it("uses the current ArkiWatch canvas and accent colors", () => {
    const metadata = manifest();

    expect(metadata.background_color).toBe("#f3f1ec");
    expect(metadata.theme_color).toBe("#2b4a52");
  });
});
