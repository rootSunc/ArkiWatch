"use client";

import { useCallback, useEffect, useState } from "react";

import { normalizeApiBaseUrl } from "@/lib/api-client";

import { translateMessageKey, type LanguageMode } from "./i18n";

type ExportSnapshotButtonProps = {
  city: string;
  date: string | null;
  language: LanguageMode;
};

type ExportState = "idle" | "loading" | "success" | "error";

function exportUrl(city: string, date: string | null): URL {
  const url = new URL(
    `${normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}/platform/overview/export`,
  );
  url.searchParams.set("city", city);
  url.searchParams.set("format", "csv");
  if (date) {
    url.searchParams.set("date", date);
  }
  return url;
}

function responseFilename(response: Response, city: string, date: string | null): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `arkiwatch-${city}-${date ?? "live"}.csv`;
}

export function ExportSnapshotButton({
  city,
  date,
  language,
}: ExportSnapshotButtonProps) {
  const [state, setState] = useState<ExportState>("idle");
  const label = translateMessageKey(
    language,
    state === "loading"
      ? "shell.exportingSnapshot"
      : state === "error"
        ? "shell.exportFailed"
        : state === "success"
          ? "shell.snapshotExported"
          : "shell.exportSnapshot",
  );

  const downloadSnapshot = useCallback(async () => {
    if (state === "loading") {
      return;
    }

    setState("loading");
    try {
      const response = await fetch(exportUrl(city, date), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Export failed with ${response.status}.`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = responseFilename(response, city, date);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setState("success");
    } catch {
      setState("error");
    }
  }, [city, date, state]);

  useEffect(() => {
    if (state !== "success" && state !== "error") {
      return;
    }

    const timeout = window.setTimeout(() => setState("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [state]);

  return (
    <button
      aria-label={label}
      aria-busy={state === "loading"}
      className={`icon-button export-snapshot-button export-snapshot-button-${state}`}
      disabled={state === "loading"}
      onClick={() => void downloadSnapshot()}
      title={label}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {state === "loading"
          ? "progress_activity"
          : state === "error"
            ? "error"
            : state === "success"
              ? "check"
              : "download"}
      </span>
    </button>
  );
}
