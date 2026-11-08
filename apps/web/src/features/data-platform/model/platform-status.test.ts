import { describe, expect, it } from "vitest";

import { isEmptyStatus, liveStatusLabel, liveStatusTone } from "./platform-status";

const tKey = (key: string) => key;

describe("live data status presentation", () => {
  it("keeps backend status variants in four user-facing tones", () => {
    expect(liveStatusTone("ready")).toBe("ready");
    expect(liveStatusTone("summary_only")).toBe("ready");
    expect(liveStatusTone("stale")).toBe("stale");
    expect(liveStatusTone("partial")).toBe("stale");
    expect(liveStatusTone("pending")).toBe("stale");
    expect(liveStatusTone("empty")).toBe("empty");
    expect(liveStatusTone("not_collected")).toBe("empty");
    expect(liveStatusTone("unavailable")).toBe("empty");
    expect(liveStatusTone("failed")).toBe("failed");
    expect(liveStatusTone("error")).toBe("failed");
    expect(liveStatusTone("new_backend_status")).toBe("empty");
  });

  it("uses domain labels for healthy/delayed states and generic labels otherwise", () => {
    expect(liveStatusLabel("ready", tKey, "weather.liveSyncActive", "weather.syncDelayed")).toBe("weather.liveSyncActive");
    expect(liveStatusLabel("stale", tKey, "weather.liveSyncActive", "weather.syncDelayed")).toBe("weather.syncDelayed");
    expect(liveStatusLabel("partial", tKey, "weather.liveSyncActive", "weather.syncDelayed")).toBe("shell.partial");
    expect(liveStatusLabel("empty", tKey, "weather.liveSyncActive", "weather.syncDelayed")).toBe("shell.empty");
    expect(liveStatusLabel("missing", tKey, "weather.liveSyncActive", "weather.syncDelayed")).toBe("shell.missing");
    expect(liveStatusLabel("unavailable", tKey, "weather.liveSyncActive", "weather.syncDelayed")).toBe("shell.unavailable");
    expect(liveStatusLabel("failed", tKey, "weather.liveSyncActive", "weather.syncDelayed")).toBe("shell.error");
  });

  it("identifies unavailable payloads without treating partial or stale data as empty", () => {
    expect(isEmptyStatus("empty")).toBe(true);
    expect(isEmptyStatus("not_collected")).toBe(true);
    expect(isEmptyStatus("unavailable")).toBe(true);
    expect(isEmptyStatus("ready")).toBe(false);
    expect(isEmptyStatus("partial")).toBe(false);
    expect(isEmptyStatus("stale")).toBe(false);
    expect(isEmptyStatus("new_backend_status")).toBe(false);
  });
});
