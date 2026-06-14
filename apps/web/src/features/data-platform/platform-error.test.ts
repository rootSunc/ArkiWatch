import { describe, expect, it } from "vitest";

import { platformErrorMessage } from "./platform-error";

describe("platformErrorMessage", () => {
  const translate = (key: string) => key;

  it("turns browser network failures into an actionable unavailable message", () => {
    expect(platformErrorMessage("Failed to fetch", translate)).toBe("shell.apiUnavailable");
  });

  it("classifies timeouts and access errors separately", () => {
    expect(platformErrorMessage("Platform request timed out.", translate)).toBe("shell.apiTimeout");
    expect(platformErrorMessage("Platform request failed with 403.", translate)).toBe("shell.apiAccessDenied");
  });

  it("classifies server and incomplete responses", () => {
    expect(platformErrorMessage("Platform request failed with 503.", translate)).toBe("shell.apiUnavailable");
    expect(platformErrorMessage("API response did not include data.", translate)).toBe("shell.apiIncompleteResponse");
  });

  it("falls back for unknown or missing errors", () => {
    expect(platformErrorMessage("Unexpected parser failure", translate)).toBe("shell.unknownPlatformError");
    expect(platformErrorMessage(null, translate)).toBe("shell.unknownPlatformError");
  });
});
