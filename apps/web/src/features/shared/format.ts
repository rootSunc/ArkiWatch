export function formatTimestamp(
  value: string | null,
  mode: "dateTime" | "date" = "dateTime"
): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    ...(mode === "dateTime"
      ? {
          hour: "2-digit",
          minute: "2-digit"
        }
      : {})
  }).format(new Date(value));
}

export function formatRelativeAge(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const diffInMinutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (diffInMinutes < 1) {
    return "just now";
  }

  if (diffInMinutes < 60) {
    return `${diffInMinutes} min ago`;
  }

  const diffInHours = Math.round(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} h ago`;
  }

  return `${Math.round(diffInHours / 24)} d ago`;
}

export function formatLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function statusTone(status: string): string {
  switch (status) {
    case "active":
    case "complete":
    case "healthy":
    case "fresh":
    case "ready":
    case "SENT":
      return "good";
    case "action_required":
    case "in_progress":
    case "pending":
    case "stale":
    case "watch":
      return "warn";
    case "blocked":
    case "config_required":
    case "degraded":
    case "failing":
    case "invalid_user_id":
    case "setup_required":
    case "FAILED":
      return "bad";
    default:
      return "neutral";
  }
}

export function severityTone(severity: string): string {
  switch (severity) {
    case "high":
    case "HIGH":
      return "bad";
    case "medium":
    case "MEDIUM":
      return "warn";
    case "low":
    case "LOW":
      return "good";
    default:
      return "neutral";
  }
}
