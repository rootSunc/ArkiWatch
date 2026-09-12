export function parseValidDate(
  value: string | number | Date | null | undefined,
): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedDate = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(parsedDate.getTime()) ? parsedDate : null;
}

export function formatTimestamp(
  value: string | null,
  mode: "dateTime" | "date" | "time" = "dateTime",
  language: "en" | "zh" = "en",
  timeZone?: string,
): string {
  if (!value) {
    return language === "zh" ? "暂无数据" : "Not available";
  }

  const parsedDate = parseValidDate(value);
  if (!parsedDate) {
    return language === "zh" ? "暂无数据" : "Not available";
  }

  const options: Intl.DateTimeFormatOptions =
    mode === "time"
      ? {
          hour: "2-digit",
          minute: "2-digit",
          ...(timeZone ? { timeZone } : {}),
        }
      : {
          day: language === "zh" ? "numeric" : "2-digit",
          month: "short",
          ...(mode === "dateTime"
            ? {
                hour: "2-digit",
                minute: "2-digit",
              }
            : {}),
          ...(timeZone ? { timeZone } : {}),
        };

  try {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", options).format(
      parsedDate,
    );
  } catch {
    // Keep a malformed deployment timezone from breaking a data surface.
    const safeOptions = { ...options };
    delete safeOptions.timeZone;
    return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", safeOptions).format(
      parsedDate,
    );
  }
}

export function formatRelativeAge(value: string | null, language: "en" | "zh" = "en"): string {
  if (!value) {
    return language === "zh" ? "从未" : "Never";
  }

  const parsedDate = parseValidDate(value);
  if (!parsedDate) {
    return language === "zh" ? "暂无数据" : "Not available";
  }

  const timestamp = parsedDate.getTime();
  const diffInMinutes = Math.round((Date.now() - timestamp) / 60000);
  if (diffInMinutes < 1) {
    return language === "zh" ? "刚刚" : "just now";
  }

  if (diffInMinutes < 60) {
    return language === "zh" ? `${diffInMinutes} 分钟前` : `${diffInMinutes} min ago`;
  }

  const diffInHours = Math.round(diffInMinutes / 60);
  if (diffInHours < 24) {
    return language === "zh" ? `${diffInHours} 小时前` : `${diffInHours} h ago`;
  }

  return language === "zh" ? `${Math.round(diffInHours / 24)} 天前` : `${Math.round(diffInHours / 24)} d ago`;
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
