import { describe, expect, it } from "vitest";

import { countPhrase } from "./count-phrase";

describe("countPhrase", () => {
  it("uses the singular sentence for one and the plural sentence otherwise", () => {
    expect(countPhrase(1, "1 alert is active.", "{count} alerts are active.")).toBe("1 alert is active.");
    expect(countPhrase(3, "1 alert is active.", "{count} alerts are active.")).toBe("3 alerts are active.");
    expect(countPhrase(0, "1 names a stop.", "{count} name a stop.", "None name a stop.")).toBe(
      "None name a stop.",
    );
  });
});
