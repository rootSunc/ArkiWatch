import { expect, it } from "vitest";
import { demoFixtureForScope } from "../demo/demo-data";
import { briefingCacheRemaining } from "./briefing-cache";
it("uses server validity and elapsed receipt time instead of the browser's date", () => {
 const dashboard = demoFixtureForScope().publicDashboard;
 const receivedAt = Date.parse("2099-01-01T00:00:00Z");
 const duration = Date.parse(dashboard.decision!.valid_until) - Date.parse(dashboard.decision!.evaluated_at);
 expect(briefingCacheRemaining(dashboard, receivedAt, receivedAt + 100)).toBe(duration - 100);
 expect(briefingCacheRemaining(dashboard, receivedAt, receivedAt + duration)).toBe(0);
 expect(briefingCacheRemaining(undefined, receivedAt)).toBe(0);
});
