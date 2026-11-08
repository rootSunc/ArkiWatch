"use client";

import { useEffect, useState } from "react";

import "../styles/console-inspection.css";
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
import { formatScopedClock, formatTimestamp, severityTone } from "@/features/shared/format";
import { localizedContent } from "../model/content-localization";
import { useI18n } from "../i18n";
import { eventAnchorId, recentEventDetails } from "../model/recent-events";
import { eventStateAt } from "../model/event-time-state";
import { scopedReferenceTime } from "../model/data-time-scope";
import { displayTitle } from "../model/data-platform-view-model";
import { exportCsv } from "./console-model";
import { ShareViewLinkButton } from "../workspaces/share-view-link-button";
import type {
  PlatformCategory,
  PlatformEvent,
  PlatformTimeScope,
} from "../types";
import { LinkedEventsWorkspace } from "../workspaces/workspace-panels";

export function ConsoleEvents({
  categories,
  events,
  checkedAt,
  timezone,
  timeScope,
  highlightedEventId,
  onOpenEvent,
  onAsk,
  coverage,
}: {
  categories: PlatformCategory[];
  events: PlatformEvent[];
  checkedAt: string;
  timezone: string;
  timeScope?: PlatformTimeScope | null;
  highlightedEventId?: string | null;
  onOpenEvent: (event: PlatformEvent) => void;
  onAsk?: (question: string) => void;
  coverage?: string | null;
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
  const askQuestion = (event: PlatformEvent) =>
    `${localizedContent(language, event.title, event.title_zh)}: ${localizedContent(language, event.body, event.body_zh)}`;
  const stateCount = (state: string) =>
    allEvents.filter((event) => eventStateAt(event, referenceAt) === state).length;
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
        subtitle={[
          coverage,
          tKey("shell.eventFeeds"),
          formatTimestamp(checkedAt, "dateTime", language, timezone),
        ].filter(Boolean).join(" · ")}
        actions={
          <div className="events-header-actions">
            <span className="events-header-counts">
              {tKey(timeScope?.date ? "shell.eventHeaderDated" : "shell.eventHeaderLive")
                .replace("{open}", String(stateCount("active")))
                .replace("{count}", String(allEvents.length))}
            </span>
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
          </div>
        }
      />
      <div className="console-filter-bar">
        <div
          className="console-segmented"
          role="group"
          aria-label={tKey("shell.eventLifecycle")}
        >
          {(
            [
              ["all", "all", allEvents.length],
              ["active", "eventStateactive", stateCount("active")],
              ["ended", "eventStateended", stateCount("ended")],
            ] as const
          ).map(([value, key, count]) => (
            <button
              type="button"
              aria-pressed={lifecycle === value}
              aria-label={tKey(`shell.${key}`)}
              onClick={() => setLifecycle(value)}
              key={value}
            >
              {tKey(`shell.${key}`)}{" "}
              <span aria-hidden="true">{count}</span>
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
        <select
          aria-label={tKey("shell.eventKind")}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">{tKey("shell.allEventTypes")}</option>
          <option value="incidents">{tKey("shell.incidents")}</option>
          <option value="public">{tKey("shell.publicEvents")}</option>
        </select>
        <details className="console-filter-more">
          <summary>{tKey("shell.moreFilters")}</summary>
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
        </details>
      </div>
      <Card title={`${tKey("shell.navLinkedEvents")} (${rows.length})`}>
        <DataTable
          rows={rows}
          rowKey={(e) => e.id}
          label={tKey("shell.navLinkedEvents")}
          empty={tKey("shell.noMatchingRows")}
          onRowClick={(e) => setSelectedId(e.id)}
          rowTone={(e) => severityTone(e.severity)}
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
              key: "domain",
              label: tKey("shell.category"),
              sortValue: (e) => e.category_key,
              render: (e) => {
                const match = categories.find((category) => category.key === e.category_key);
                return match ? displayTitle(match, language) : enumLabel(e.category_key);
              },
            },
            {
              key: "time",
              label: tKey("shell.startsAt"),
              render: (e) => (
                <time dateTime={e.starts_at} title={formatTimestamp(e.starts_at, "dateTime", language, timezone)}>
                  {formatScopedClock(e.starts_at, referenceAt, language, timezone)}
                </time>
              ),
              sortValue: (e) => e.starts_at,
            },
            {
              key: "source",
              label: tKey("shell.provider"),
              render: (e) => e.source_codes.join(", ").toUpperCase(),
            },
            ...(onAsk
              ? [
                  {
                    key: "ask",
                    label: tKey("shell.ask"),
                    render: (event: PlatformEvent) => (
                      <button
                        className="console-text-button"
                        type="button"
                        aria-label={`${tKey("shell.askAboutThis")}: ${localizedContent(language, event.title, event.title_zh)}`}
                        onClick={(click) => {
                          click.stopPropagation();
                          onAsk(askQuestion(event));
                        }}
                      >
                        {tKey("shell.ask")}
                      </button>
                    ),
                  },
                ]
              : []),
            {
              key: "more",
              label: tKey("shell.rowOpens"),
              hideLabel: true,
              render: () => <span className="row-chevron" aria-hidden="true">›</span>,
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
            {onAsk ? (
              <button
                className="console-button"
                type="button"
                onClick={() => onAsk(askQuestion(selected))}
              >
                {tKey("shell.askAboutThis")}
              </button>
            ) : null}
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
