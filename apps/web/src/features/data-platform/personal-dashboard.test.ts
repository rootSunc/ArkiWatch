import { describe, expect, it } from "vitest";

import {
  nextPersonalWorkflowStep,
  personalContextTone,
} from "./personal-dashboard";

describe("personal dashboard helpers", () => {
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
});
