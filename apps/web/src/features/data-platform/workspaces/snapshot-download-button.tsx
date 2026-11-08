"use client";
import { useState } from "react";
import { useI18n } from "../i18n";
import { Toast } from "@/features/shared/ui/console";
import type { PlatformOverviewResponse } from "../types";

export function SnapshotDownloadButton({
  overview,
}: {
  overview: PlatformOverviewResponse;
}) {
  const { tKey } = useI18n();
  const [downloaded, setDownloaded] = useState(false);
  return (
    <>
      <button
        className="console-button"
        type="button"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(overview, null, 2)], {
              type: "application/json",
            }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = `arkiwatch-${overview.time_scope?.date ?? overview.checked_at.slice(0, 10)}.json`;
          link.click();
          setDownloaded(true);
          window.setTimeout(() => {
            URL.revokeObjectURL(url);
            setDownloaded(false);
          }, 3000);
        }}
      >
        {tKey("shell.exportSnapshot")}
      </button>
      <Toast>{downloaded ? tKey("shell.downloaded") : null}</Toast>
    </>
  );
}
