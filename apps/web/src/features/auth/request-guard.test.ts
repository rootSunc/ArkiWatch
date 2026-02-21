import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { rejectCrossSiteRequest } from "./request-guard";

describe("request guard", () => {
  it("allows same-origin mutation requests", () => {
    const request = new NextRequest("https://app.example.test/api/auth/logout", {
      headers: {
        host: "app.example.test",
        origin: "https://app.example.test"
      }
    });

    expect(rejectCrossSiteRequest(request)).toBeNull();
  });

  it("rejects cross-site mutation requests", () => {
    const request = new NextRequest("https://app.example.test/api/auth/logout", {
      headers: {
        host: "app.example.test",
        origin: "https://evil.example.test"
      }
    });

    expect(rejectCrossSiteRequest(request)?.status).toBe(403);
  });
});
