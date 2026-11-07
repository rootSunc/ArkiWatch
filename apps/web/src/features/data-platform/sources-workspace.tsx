"use client";

import { useEffect, useState } from "react";
import {
  Card,
  Drawer,
  DataTable,
  PageHeader,
  StatusBadge,
  Toast,
} from "@/features/shared/ui/console";
import { formatTimestamp } from "@/features/shared/format";
import { useI18n } from "./i18n";
import { sourceHealthTone } from "./source-health";
import { useSearchParams } from "next/navigation";
import { displayTitle } from "./data-platform-view-model";
import { exportCsv } from "./console-model";
import { ShareViewLinkButton } from "./share-view-link-button";
import type { DashboardSource, PlatformOverviewResponse } from "./types";

export function SourcesWorkspace({
  overview,
}: {
  overview: PlatformOverviewResponse;
}) {
  const { language, tKey, enumLabel } = useI18n();
  const searchParams = useSearchParams();
  const requestedSource = searchParams.get("source");
  const [selectedCode, setSelectedCode] = useState<string | null>(
    requestedSource,
  );
  const [toast, setToast] = useState("");
  useEffect(() => setSelectedCode(requestedSource), [requestedSource]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const selected = overview.sources.find((s) => s.source_code === selectedCode);
  const sourceDomains = (code: string) =>
    overview.categories
      .filter((c) => c.source_codes.includes(code))
      .map((c) => displayTitle(c, language))
      .join(", ");
  const openSource = (code: string) => {
    setSelectedCode(code);
    const url = new URL(window.location.href);
    url.searchParams.set("source", code);
    window.history.replaceState(window.history.state, "", url);
  };
  const closeSource = () => {
    setSelectedCode(null);
    if (requestedSource) {
      const url = new URL(window.location.href);
      url.searchParams.delete("source");
      window.history.replaceState(window.history.state, "", url);
    }
  };
  const lastSuccess = (s: DashboardSource) =>
    s.last_successful_run_at ??
    (s.last_run_status === "succeeded" ? s.last_run_finished_at : null);
  const runLabel = (day: NonNullable<DashboardSource["run_history"]>[number]) =>
    `${day.date}: ${tKey("shell.runDaySummary").replace("{runs}", String(day.runs)).replace("{succeeded}", String(day.succeeded)).replace("{failed}", String(day.failed)).replace("{running}", String(day.running))}`;
  const health = overview.source_health;
  const timezone = overview.time_scope?.timezone ?? overview.timezone;
  return (
    <div className="console-sources">
      <PageHeader
        title={tKey("shell.navSources")}
        actions={
          <details className="page-actions">
            <summary aria-label={tKey("shell.pageActions")}>•••</summary>
            <div>
              <ShareViewLinkButton language={language} />
              <button
                className="console-button"
                type="button"
                onClick={() => {
                  exportCsv(
                    "sources.csv",
                    [
                      tKey("shell.provider"),
                      tKey("shell.category"),
                      tKey("shell.status"),
                      tKey("shell.lastSuccess"),
                      tKey("shell.rowsReturned"),
                      tKey("shell.lastError"),
                    ],
                    overview.sources.map((s) => [
                      s.source_code,
                      sourceDomains(s.source_code),
                      s.operational_status,
                      lastSuccess(s),
                      s.records_ingested,
                      s.error_message,
                    ]),
                  );
                  setToast(tKey("shell.downloaded"));
                }}
              >
                {tKey("shell.exportCsv")}
              </button>
            </div>
          </details>
        }
        subtitle={
          health
            ? tKey("shell.sourceSummary")
                .replace("{healthy}", String(health.healthy))
                .replace("{tracked}", String(health.tracked))
                .replace("{issues}", String(health.issues))
            : tKey("shell.noCollectorState")
        }
      />
      <Card
        title={tKey("shell.trackedSources")}
        footer={tKey(
          overview.sources.some((s) => s.run_history?.length)
            ? "shell.runHistoryExplanation"
            : "shell.runHistoryUnavailable",
        )}
      >
        <DataTable
          rows={overview.sources}
          rowKey={(s) => s.id}
          label={tKey("shell.navSources")}
          empty={tKey("shell.noCollectorState")}
          onRowClick={(s) => openSource(s.source_code)}
          columns={[
            {
              key: "source",
              label: tKey("shell.provider"),
              sortValue: (s) => s.source_name,
              render: (s) => (
                <button
                  className="console-text-button"
                  type="button"
                  onClick={() => openSource(s.source_code)}
                >
                  {s.source_code.toUpperCase()} · {s.source_name}
                </button>
              ),
            },
            {
              key: "domain",
              label: tKey("shell.category"),
              render: (s) =>
                sourceDomains(s.source_code) || tKey("shell.notRecorded"),
              sortValue: (s) => sourceDomains(s.source_code),
            },
            {
              key: "status",
              label: tKey("shell.status"),
              sortValue: (s) => s.operational_status,
              render: (s) => (
                <StatusBadge tone={sourceHealthTone(s.operational_status)}>
                  {enumLabel(s.operational_status)}
                </StatusBadge>
              ),
            },
            {
              key: "last",
              label: tKey("shell.lastSuccess"),
              sortValue: (s) => lastSuccess(s) ?? "",
              render: (s) =>
                lastSuccess(s)
                  ? formatTimestamp(
                      lastSuccess(s)!,
                      "dateTime",
                      language,
                      timezone,
                    )
                  : tKey("shell.notRecorded"),
            },
            {
              key: "runs",
              label: tKey("shell.runHistory"),
              render: (s) =>
                s.run_history?.length ? (
                  <span
                    className="source-run-strip"
                    role="img"
                    aria-label={s.run_history.map(runLabel).join("; ")}
                  >
                    {s.run_history.map((day) => (
                      <span
                        key={day.date}
                        aria-hidden="true"
                        title={runLabel(day)}
                        data-state={
                          day.failed > 0
                            ? "failed"
                            : day.running > 0
                              ? "running"
                              : day.succeeded > 0
                                ? "succeeded"
                                : "empty"
                        }
                      >
                        {day.failed > 0
                          ? "!"
                          : day.succeeded > 0
                            ? "✓"
                            : day.running > 0
                              ? "·"
                              : "−"}
                      </span>
                    ))}
                  </span>
                ) : (
                  tKey("shell.notRecorded")
                ),
            },
            {
              key: "rows",
              label: tKey("shell.rowsReturned"),
              numeric: true,
              sortValue: (s) => s.records_ingested ?? -1,
              render: (s) => s.records_ingested ?? "—",
            },
            {
              key: "duration",
              label: tKey("shell.latency"),
              numeric: true,
              render: (s) =>
                s.last_run_started_at && s.last_run_finished_at
                  ? `${Math.max(0, Date.parse(s.last_run_finished_at) - Date.parse(s.last_run_started_at)) / 1000}s`
                  : "—",
            },
          ]}
        />
      </Card>
      {selected ? (
        <Drawer open title={selected.source_name} onClose={closeSource}>
          <dl className="source-evidence">
            <div>
              <dt>{tKey("shell.lastCompletedRun")}</dt>
              <dd>
                {selected.last_run_finished_at
                  ? formatTimestamp(
                      selected.last_run_finished_at,
                      "dateTime",
                      language,
                      timezone,
                    )
                  : tKey("shell.notRecorded")}{" "}
                · {enumLabel(selected.last_run_status)}
              </dd>
            </div>
            <div>
              <dt>{tKey("shell.lastError")}</dt>
              <dd>{selected.error_message || tKey("shell.notRecorded")}</dd>
            </div>
            <div>
              <dt>{tKey("shell.licence")}</dt>
              <dd>{selected.license_label || tKey("shell.notRecorded")}</dd>
            </div>
          </dl>
          {selected.run_history?.length ? (
            <Card title={tKey("shell.runHistory")}>
              <DataTable
                rows={selected.run_history}
                empty={tKey("shell.runHistoryUnavailable")}
                rowKey={(day) => day.date}
                label={tKey("shell.runHistory")}
                columns={[
                  {
                    key: "date",
                    label: tKey("shell.date"),
                    render: (day) => day.date,
                  },
                  {
                    key: "success",
                    label: tKey("shell.runsSucceeded"),
                    numeric: true,
                    render: (day) => day.succeeded,
                  },
                  {
                    key: "failed",
                    label: tKey("shell.runsFailed"),
                    numeric: true,
                    render: (day) => day.failed,
                  },
                  {
                    key: "running",
                    label: tKey("shell.runsRunning"),
                    numeric: true,
                    render: (day) => day.running,
                  },
                ]}
              />
            </Card>
          ) : null}
          {selected.documentation_url ? (
            <a
              className="console-text-button"
              href={selected.documentation_url}
              target="_blank"
              rel="noreferrer"
            >
              {tKey("shell.providerDocs")} ↗
            </a>
          ) : null}
        </Drawer>
      ) : null}
      <Toast>{toast}</Toast>
    </div>
  );
}
