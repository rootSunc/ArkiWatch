import { afterEach, describe, expect, it, vi } from "vitest";

import { API_TIMEOUT_ERROR } from "@/lib/api-client";
import {
  fetchPersonalDashboard,
  nextPersonalWorkflowStep,
  personalContextTone,
} from "./personal-dashboard";

describe("personal dashboard helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the first incomplete setup step", () => {
    expect(
      nextPersonalWorkflowStep({
        workflow_steps: [
          { key: "user", title: "User", status: "complete", detail: "Done" },
          { key: "location", title: "Location", status: "action_required", detail: "Missing" },
          { key: "telegram", title: "Telegram", status: "blocked", detail: "Later" },
        ],
      })?.key,
    ).toBe("location");
  });

  it("treats fully configured context as good and partial context as watch", () => {
    expect(personalContextTone(100)).toBe("good");
    expect(personalContextTone(60)).toBe("warn");
    expect(personalContextTone(0)).toBe("neutral");
  });

  it("bounds a stalled personal dashboard request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The request timed out.", "TimeoutError");
      }),
    );

    const result = await fetchPersonalDashboard();

    expect(result.data).toBeNull();
    expect(result.error).toBe(API_TIMEOUT_ERROR);
    expect(result.status).toBeNull();
  });
});
