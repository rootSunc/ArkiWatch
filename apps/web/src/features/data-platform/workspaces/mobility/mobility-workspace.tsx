"use client";

import { RoadRailWorkspace } from "./road-rail-workspace";
import { TransitWorkspace } from "./transit-workspace";
import { resolveDataTimezone } from "../../model/data-timezone";
import { scopedStatusLabel } from "../../model/data-time-scope";
import { useI18n } from "../../i18n";
import { isEmptyStatus, liveStatusTone } from "../../model/platform-status";
import { handleTabListKeyDown } from "../../shell/tab-navigation";
import { WorkspaceEvidenceHeader } from "../workspace-ui";
import type {
  PlatformCategory,
  PlatformHistoricalSnapshot,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
} from "../../types";

export type MobilityTabKey = "transit" | "traffic";

type MobilityWorkspaceProps = {
  activeTab: MobilityTabKey;
  highlightedEventId?: string | null;
  onTabChange: (tab: MobilityTabKey) => void;
  roadRail: RoadRailCurrentResponse | null;
  roadRailCategory: PlatformCategory | null;
  roadRailHistory: PlatformHistoricalSnapshot<RoadRailCurrentResponse>[];
  transit: TransitCurrentResponse | null;
  transitCategory: PlatformCategory | null;
  transitHistory: PlatformHistoricalSnapshot<TransitCurrentResponse>[];
};

const MOBILITY_TABS: Array<{
  key: MobilityTabKey;
  icon: string;
  labelKey: string;
}> = [
  { key: "transit", icon: "directions_bus", labelKey: "transit" },
  { key: "traffic", icon: "traffic", labelKey: "roadRail" },
];

function mobilityTabCount(
  tab: MobilityTabKey,
  transit: TransitCurrentResponse | null,
  roadRail: RoadRailCurrentResponse | null,
): number | null {
  if (tab === "transit") {
    return transit && !isEmptyStatus(transit.status)
      ? (transit.quality.active_alert_count ?? 0)
      : null;
  }
  return roadRail && !isEmptyStatus(roadRail.status)
    ? (roadRail.quality.active_event_count ?? 0)
    : null;
}

export function MobilityWorkspace({
  activeTab,
  highlightedEventId,
  onTabChange,
  roadRail,
  roadRailCategory,
  roadRailHistory,
  transit,
  transitCategory,
  transitHistory,
}: MobilityWorkspaceProps) {
  const { language, tKey } = useI18n();
  const mobilityTabIdPrefix = "mobility-workspace-tab";
  const mobilityPanelId = "mobility-workspace-panel";
  const evidence = transit && !isEmptyStatus(transit.status) ? transit : roadRail;
  const sourceLabel = [transit?.source_code, roadRail?.source_code]
    .filter((code): code is string => Boolean(code))
    .map((code) => code.toUpperCase())
    .join(", ");
  const alertCount = transit && !isEmptyStatus(transit.status)
    ? (transit.quality.active_alert_count ?? 0)
    : 0;
  const mobilityStatus = alertCount > 0
    ? `${tKey("mobility.watch")}, ${alertCount} ${tKey("mobility.activeNotices")}`
    : evidence
      ? scopedStatusLabel(
          evidence.status,
          evidence.time_scope,
          tKey,
          "transit.hslFeedActive",
          "transit.feedDelayed",
        )
      : undefined;

  return (
    <section className="mobility-detail-page" aria-label={tKey("mobility.mobilityDetail")}>
      <WorkspaceEvidenceHeader
        className="mobility-detail-header"
        eyebrow={tKey("mobility.mobilityWorkspace")}
        fallbackKey="transit.notObserved"
        language={language}
        observedAt={evidence?.observed_at ?? evidence?.checked_at ?? null}
        sourceLabel={sourceLabel || null}
        status={mobilityStatus}
        statusTone={alertCount > 0 ? "warn" : evidence ? liveStatusTone(evidence.status) : "neutral"}
        tKey={tKey}
        timeScope={evidence?.time_scope}
        title={tKey("mobility.transitAndRoadSignals")}
        timezone={resolveDataTimezone(evidence?.time_scope?.timezone)}
      >
        <p>{tKey("mobility.activeNotices")}</p>
      </WorkspaceEvidenceHeader>
      <nav className="mobility-tab-list" aria-label={tKey("mobility.mobilityWorkspaceTabs")} role="tablist">
        {MOBILITY_TABS.map((tab) => {
          const count = mobilityTabCount(tab.key, transit, roadRail);
          const tabLabel = tKey(`mobility.${tab.labelKey}`);
          const countLabel =
            count !== null ? `, ${count} ${tKey("mobility.active")}` : "";

          return (
            <button
              aria-label={`${tabLabel}${countLabel}`}
              aria-selected={activeTab === tab.key}
              aria-controls={mobilityPanelId}
              className={activeTab === tab.key ? "mobility-tab mobility-tab-active" : "mobility-tab"}
              id={`${mobilityTabIdPrefix}-${tab.key}`}
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              onKeyDown={(event) =>
                handleTabListKeyDown(
                  event,
                  MOBILITY_TABS,
                  activeTab,
                  onTabChange,
                  mobilityTabIdPrefix,
                )
              }
              role="tab"
              tabIndex={activeTab === tab.key ? 0 : -1}
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {tab.icon}
              </span>
              <span>{tabLabel}</span>
              {count !== null && count > 0 ? (
                <span className="mobility-tab-count" aria-hidden="true">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div
        aria-labelledby={`${mobilityTabIdPrefix}-${activeTab}`}
        className="mobility-workspace-panel"
        id={mobilityPanelId}
        role="tabpanel"
        tabIndex={-1}
      >
        {activeTab === "transit" ? (
          <TransitWorkspace
            category={transitCategory}
            highlightedEventId={highlightedEventId}
            history={transitHistory}
            transit={transit}
          />
        ) : (
          <RoadRailWorkspace
            category={roadRailCategory}
            highlightedEventId={highlightedEventId}
            history={roadRailHistory}
            roadRail={roadRail}
          />
        )}
      </div>
    </section>
  );
}
