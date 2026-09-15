import type { PublicDashboardRead } from "../types";

// The server chooses validity. The browser measures only elapsed cache age, so
// an incorrectly set browser clock cannot change a recommendation's eligibility.
export function briefingCacheRemaining(data: PublicDashboardRead | undefined, receivedAt: number, now = Date.now()): number {
 const decision = data?.decision;
 if (!decision) return 0;
 const lifetime = Date.parse(decision.valid_until) - Date.parse(decision.evaluated_at);
 if (!Number.isFinite(lifetime)) return 0;
 return Math.max(0, lifetime - Math.max(0, now - receivedAt));
}
