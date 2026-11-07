import { UNAVAILABLE_DATA_VALUE } from "./data-value";
import type { PlatformTone } from "./types";

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
  return value == null || !Number.isFinite(value) ? UNAVAILABLE_DATA_VALUE : new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}
export function formatPercent(value: number | null | undefined, tKey: (key: string) => string): string {
  return value == null || !Number.isFinite(value) ? tKey("shell.nA") : `${formatNumber(value, 0)}%`;
}
export function severityTone(severity: string): PlatformTone {
  return ({ CRITICAL: "bad", HIGH: "bad", MEDIUM: "warn", LOW: "good" } as Record<string, PlatformTone>)[severity.toUpperCase()] ?? "neutral";
}
export function statusTone(status: string): PlatformTone {
  if (["ready", "fetched"].includes(status)) return "good";
  if (["empty", "missing", "not_collected", "stale"].includes(status)) return "warn";
  if (["failed", "error"].includes(status)) return "bad";
  return "neutral";
}
export function uniqueJoined(values: string[]): string {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 4).join(", ") || UNAVAILABLE_DATA_VALUE;
}
export function clampPercent(value: number): number { return Math.max(6, Math.min(100, value)); }
export function severityRows(counts: Record<string, number> = {}) {
  const levels = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].filter((level) => level !== "CRITICAL" || counts[level]);
  const max = Math.max(1, ...Object.values(counts));
  return levels.map((severity) => ({ severity, count: counts[severity] ?? 0, width: Math.max(8, ((counts[severity] ?? 0) / max) * 100) }));
}
export function filterEvents<T extends { filters?: string[] }>(events: T[], filter: string): T[] {
  return filter === "all" ? events : events.filter((event) => event.filters?.includes(filter));
}
