import { describe, expect, it } from "vitest";

import { formatAssistantScopeDate } from "./assistant-scope";

describe("formatAssistantScopeDate", () => {
  it("keeps a date-only scope on the selected calendar day", () => {
    expect(formatAssistantScopeDate("2026-08-08", "en")).toBe("08 Aug");
    expect(formatAssistantScopeDate("2026-08-08", "zh")).toBe("8月8日");
  });
});
