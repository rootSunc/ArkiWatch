"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { resolveApiBaseUrl } from "@/lib/api-client";
import { MaterialIcon } from "@/features/shared/material-icon";

import { translateMessageKey, type LanguageMode } from "./i18n";

type ExportSnapshotButtonProps = {
  city: string;
  date: string | null;
  language: LanguageMode;
};

type ExportState = "idle" | "loading" | "success" | "error";

function exportUrl(city: string, date: string | null): URL {
  const url = new URL(
    `${resolveApiBaseUrl()}/platform/overview/export`,
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
  const activeExportRef = useRef<AbortController | null>(null);
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
    const requestController = new AbortController();
    activeExportRef.current?.abort();
    activeExportRef.current = requestController;
    try {
      const response = await fetch(exportUrl(city, date), {
        cache: "no-store",
        signal: requestController.signal,
      });
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
      if (activeExportRef.current === requestController) {
        setState("success");
      }
    } catch {
      if (!requestController.signal.aborted && activeExportRef.current === requestController) {
        setState("error");
      }
    } finally {
      if (activeExportRef.current === requestController) {
        activeExportRef.current = null;
      }
    }
  }, [city, date, state]);

  useEffect(() => {
    activeExportRef.current?.abort();
    activeExportRef.current = null;
    setState("idle");
  }, [city, date]);

  useEffect(
    () => () => {
      activeExportRef.current?.abort();
    },
    [],
  );

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
      <MaterialIcon
        name={
          state === "loading"
            ? "progress_activity"
            : state === "error"
              ? "error"
              : state === "success"
                ? "check"
                : "download"
        }
        className={state === "loading" ? "spin-animation" : undefined}
      />
    </button>
  );
}
