export type LiveStatusTone = "ready" | "stale" | "empty" | "failed";

type TranslateMessage = (key: string) => string;

/**
 * Normalize extensible API status values into the four states the live-data
 * indicator can explain without exposing backend vocabulary to users.
 */
export function liveStatusTone(status: string | null | undefined): LiveStatusTone {
  switch (status?.trim().toLowerCase()) {
    case "ready":
    case "healthy":
    case "connected":
    case "fetched":
    case "summary_only":
      return "ready";
    case "stale":
    case "pending":
    case "planned":
    case "watch":
      return "stale";
    case "empty":
    case "missing":
    case "not_collected":
      return "empty";
    case "failed":
    case "failing":
    case "error":
    case "inactive":
    case "alert":
      return "failed";
    default:
      return "empty";
  }
}

/** True when a payload explicitly says that no usable records are available. */
export function isEmptyStatus(status: string | null | undefined): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === "empty" || normalized === "missing" || normalized === "not_collected";
}

/**
 * Keep the positive and delayed labels domain-specific while making empty,
 * failed, and unknown source states explicit and consistently localized.
 */
export function liveStatusLabel(
  status: string | null | undefined,
  tKey: TranslateMessage,
  readyKey: string,
  staleKey: string,
): string {
  const normalized = status?.trim().toLowerCase();

  if (liveStatusTone(status) === "ready") {
    return tKey(readyKey);
  }

  if (liveStatusTone(status) === "stale") {
    return tKey(staleKey);
  }

  if (normalized === "missing") {
    return tKey("shell.missing");
  }

  if (normalized === "not_collected") {
    return tKey("shell.notCollected");
  }

  if (liveStatusTone(status) === "failed") {
    return tKey("shell.error");
  }

  if (!normalized) {
    return tKey("shell.needsAttention");
  }

  return tKey("shell.empty");
}
