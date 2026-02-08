"use client";

import { RoadRailWorkspace } from "./road-rail-workspace";
import { TransitWorkspace } from "./transit-workspace";
import { useI18n } from "./i18n";
import type {
  PlatformCategory,
  PlatformHistoricalSnapshot,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
} from "./types";

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
  label: string;
}> = [
  { key: "transit", icon: "directions_bus", label: "Transit" },
  { key: "traffic", icon: "traffic", label: "Road & Rail" },
];

function mobilityTabCount(
  tab: MobilityTabKey,
  transit: TransitCurrentResponse | null,
  roadRail: RoadRailCurrentResponse | null,
): number | null {
  if (tab === "transit") {
    return transit ? (transit.quality.active_alert_count ?? 0) : null;
  }
  return roadRail ? (roadRail.quality.active_event_count ?? 0) : null;
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
  const { t } = useI18n();

  return (
    <section className="mobility-detail-page" aria-label={t("Mobility detail")}>
      <nav className="mobility-tab-list" aria-label={t("Mobility workspace tabs")} role="tablist">
        {MOBILITY_TABS.map((tab) => {
          const count = mobilityTabCount(tab.key, transit, roadRail);
          const tabLabel = t(tab.label);
          const countLabel =
            count !== null ? `, ${count} ${t("active")}` : "";

          return (
            <button
              aria-label={`${tabLabel}${countLabel}`}
              aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? "mobility-tab mobility-tab-active" : "mobility-tab"}
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              role="tab"
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
    </section>
  );
}
