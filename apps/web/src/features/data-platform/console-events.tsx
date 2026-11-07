"use client";

import { useEffect, useState } from "react";
import { InspectionContext } from "@/features/shared/ui/inspection-context";
import {
  Card,
  DataTable,
  Drawer,
  EmptyState,
  PageHeader,
  StatusBadge,
  Toast,
} from "@/features/shared/ui/console";
import { formatTimestamp, severityTone } from "@/features/shared/format";
import { localizedContent } from "./content-localization";
import { useI18n } from "./i18n";
import { eventAnchorId, recentEventDetails } from "./recent-events";
import { eventStateAt } from "./event-time-state";
import { scopedReferenceTime } from "./data-time-scope";
import { displayTitle } from "./data-platform-view-model";
import { exportCsv } from "./console-model";
import { ShareViewLinkButton } from "./share-view-link-button";
import type {
  PlatformCategory,
  PlatformEvent,
  PlatformTimeScope,
} from "./types";
import { LinkedEventsWorkspace } from "./workspace-panels";

export function ConsoleEvents({
  categories,
  events,
  checkedAt,
  timezone,
  timeScope,
  highlightedEventId,
  onOpenEvent,
}: {
  categories: PlatformCategory[];
  events: PlatformEvent[];
  checkedAt: string;
  timezone: string;
  timeScope?: PlatformTimeScope | null;
  highlightedEventId?: string | null;
  onOpenEvent: (event: PlatformEvent) => void;
}) {
  const { language, tKey, enumLabel } = useI18n();
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState("all");
  const [kind, setKind] = useState("all");
  const [domain, setDomain] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [source, setSource] = useState("all");
  const [selectedId, setSelectedId] = useState(highlightedEventId ?? null);
  const [inspectPublic, setInspectPublic] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(
    () => setSelectedId(highlightedEventId ?? null),
    [highlightedEventId, timeScope?.date, checkedAt],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const referenceAt = scopedReferenceTime(timeScope, checkedAt)!;
  const allEvents = Array.from(
    new Map(
      [...events, ...categories.flatMap((c) => c.events)].map((e) => [e.id, e]),
    ).values(),
  );
  const sources = Array.from(
    new Set(allEvents.flatMap((e) => e.source_codes)),
  ).sort();
  const selected = allEvents.find((e) => e.id === selectedId);
  const stateLabel = (event: PlatformEvent) =>
    tKey(`shell.eventState${eventStateAt(event, referenceAt)}`);
  const rows = allEvents.filter(
    (e) =>
      (lifecycle === "all" || eventStateAt(e, referenceAt) === lifecycle) &&
      (kind === "all" ||
        (kind === "public"
          ? e.category_key === "events"
          : e.category_key !== "events")) &&
      (domain === "all" || e.category_key === domain) &&
      (severity === "all" || e.severity.toUpperCase() === severity) &&
      (source === "all" || e.source_codes.includes(source)) &&
      `${localizedContent(language, e.title, e.title_zh)} ${localizedContent(language, e.body, e.body_zh)} ${e.source_codes.join(" ")}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const selectedSources = categories
    .flatMap((c) => c.sources)
    .filter((s) => selected?.source_codes.includes(s.source_code));
  const licences = Array.from(
    new Set(selectedSources.map((s) => s.license_label).filter(Boolean)),
  );
  return (
    <div className="console-events">
      <PageHeader
        title={tKey("shell.navLinkedEvents")}
        subtitle={`${allEvents.length} ${tKey("shell.recentEvents")}`}
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
                    "events.csv",
                    [
                      tKey("shell.navLinkedEvents"),
                      tKey("shell.status"),
                      tKey("shell.severity"),
                      tKey("shell.startsAt"),
                      tKey("shell.until"),
                      tKey("shell.provider"),
                    ],
                    rows.map((e) => [
                      localizedContent(language, e.title, e.title_zh),
                      stateLabel(e),
                      enumLabel(e.severity),
                      e.starts_at,
                      e.ends_at,
                      e.source_codes.join(", "),
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
      />
      <div className="console-filter-bar">
        <div
          className="console-segmented"
          role="group"
          aria-label={tKey("shell.eventLifecycle")}
        >
          {[
            ["all", "all"],
            ["active", "eventStateactive"],
            ["ended", "eventStateended"],
          ].map(([value, key]) => (
            <button
              type="button"
              aria-pressed={lifecycle === value}
              onClick={() => setLifecycle(value)}
              key={value}
            >
              {tKey(`shell.${key}`)}
            </button>
          ))}
        </div>
        <input
          aria-label={tKey("shell.eventSearch")}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tKey("shell.eventSearch")}
        />
        <select
          aria-label={tKey("shell.eventKind")}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">{tKey("shell.allEventTypes")}</option>
          <option value="incidents">{tKey("shell.incidents")}</option>
          <option value="public">{tKey("shell.publicEvents")}</option>
        </select>
        <select
          aria-label={tKey("shell.category")}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        >
          <option value="all">{tKey("shell.allDomains")}</option>
          {categories.map((c) => (
            <option value={c.key} key={c.key}>
              {displayTitle(c, language)}
            </option>
          ))}
        </select>
        <select
          aria-label={tKey("shell.severity")}
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="all">{tKey("shell.allSeverities")}</option>
          {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
            <option value={s} key={s}>
              {enumLabel(s)}
            </option>
          ))}
        </select>
        <select
          aria-label={tKey("shell.provider")}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="all">{tKey("shell.allProviders")}</option>
          {sources.map((s) => (
            <option value={s} key={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <Card title={`${tKey("shell.navLinkedEvents")} (${rows.length})`}>
        <DataTable
          rows={rows}
          rowKey={(e) => e.id}
          label={tKey("shell.navLinkedEvents")}
          empty={tKey("shell.noMatchingRows")}
          onRowClick={(e) => setSelectedId(e.id)}
          columns={[
            {
              key: "title",
              label: tKey("shell.navLinkedEvents"),
              render: (e) => (
                <button
                  className="console-text-button event-row-title"
                  type="button"
                  onClick={() => setSelectedId(e.id)}
                >
                  {localizedContent(language, e.title, e.title_zh)}
                </button>
              ),
              sortValue: (e) => localizedContent(language, e.title, e.title_zh),
            },
            {
              key: "status",
              label: tKey("shell.status"),
              render: (e) => (
                <StatusBadge
                  tone={
                    eventStateAt(e, referenceAt) === "active"
                      ? "warn"
                      : "neutral"
                  }
                >
                  {stateLabel(e)}
                </StatusBadge>
              ),
            },
            {
              key: "severity",
              label: tKey("shell.severity"),
              render: (e) => (
                <StatusBadge tone={severityTone(e.severity)}>
                  {enumLabel(e.severity)}
                </StatusBadge>
              ),
            },
            {
              key: "time",
              label: tKey("shell.startsAt"),
              render: (e) =>
                formatTimestamp(e.starts_at, "dateTime", language, timezone),
              sortValue: (e) => e.starts_at,
            },
            {
              key: "source",
              label: tKey("shell.provider"),
              render: (e) => e.source_codes.join(", ").toUpperCase(),
            },
          ]}
        />
        {!rows.length ? (
          <EmptyState
            title={tKey("shell.noMatchingEvents")}
            description={tKey("shell.noEventsRemedy")}
          />
        ) : null}
      </Card>
      {selected ? (
        <Drawer
          open
          title={localizedContent(language, selected.title, selected.title_zh)}
          onClose={() => setSelectedId(null)}
        >
          <article className="event-inspection" id={`event-inspection-${eventAnchorId(selected.id)}`}>
            <div className="event-inspection-badges">
              <StatusBadge tone={severityTone(selected.severity)}>
                {enumLabel(selected.severity)}
              </StatusBadge>
              <StatusBadge>{stateLabel(selected)}</StatusBadge>
            </div>
            <p>{localizedContent(language, selected.body, selected.body_zh)}</p>
            <dl className="source-evidence">
              <div>
                <dt>{tKey("shell.startsAt")}</dt>
                <dd>
                  {formatTimestamp(
                    selected.starts_at,
                    "dateTime",
                    language,
                    timezone,
                  )}
                </dd>
              </div>
              {recentEventDetails(selected, language, tKey, timezone)
                .filter(
                  (detail) =>
                    detail.key !== "until" && detail.key !== "provider",
                )
                .map((detail) => (
                  <div key={detail.key}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              <div>
                <dt>{tKey("shell.until")}</dt>
                <dd>
                  {formatTimestamp(
                    selected.ends_at,
                    "dateTime",
                    language,
                    timezone,
                  )}
                </dd>
              </div>
              <div>
                <dt>{tKey("shell.provider")}</dt>
                <dd>{selected.source_codes.join(", ").toUpperCase()}</dd>
              </div>
              <div>
                <dt>{tKey("shell.licence")}</dt>
                <dd>{licences.join("; ") || tKey("shell.notRecorded")}</dd>
              </div>
            </dl>
            <h3>{tKey("shell.viewEvidence")}</h3>
            <ul>
              {selected.evidence.map((e, index) => (
                <li key={`${index}-${e}`}>{e}</li>
              ))}
            </ul>
            <button
              className="console-button"
              onClick={() => {
                setSelectedId(null);
                onOpenEvent(selected);
              }}
              type="button"
            >
              {tKey("shell.openWorkspace")} →
            </button>
          </article>
        </Drawer>
      ) : null}
      <details
        className="workspace-inspection"
        onToggle={(e) => setInspectPublic(e.currentTarget.open)}
      >
        <summary>
          {tKey("shell.publicEvents")} · {tKey("shell.moreDetails")}
        </summary>
        {inspectPublic ? (
          <div className="workspace-inspection-content">
            <InspectionContext.Provider value>
              <LinkedEventsWorkspace
                category={categories.find((c) => c.key === "events") ?? null}
                checkedAt={checkedAt}
                highlightedEventId={null}
              />
            </InspectionContext.Provider>
          </div>
        ) : null}
      </details>
      <Toast>{toast}</Toast>
    </div>
  );
}
