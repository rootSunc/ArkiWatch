import type { ReactNode } from "react";

import type { LanguageMode } from "../i18n";
import { translateMessageKey } from "../i18n";

type DataHelpTextOptions = {
  key?: string | null;
  label?: string | null;
  detail?: string | null;
  language: LanguageMode;
};

type DataHelpIconProps = {
  text: string | null | undefined;
};

type DataLabelWithHelpProps = {
  children: ReactNode;
  className?: string;
  helpText: string | null | undefined;
};

const HELP_KEY_BY_LABEL: Record<string, string> = {
  "active events": "activeEvents",
  "active fields": "activeFields",
  "active now": "activeAlerts",
  "alert scope": "alertScope",
  "available fields": "availableFields",
  "best price": "bestPrice",
  "best window": "bestWindow",
  "catalog coverage": "catalogCoverage",
  "catalog stage": "catalogStage",
  "collection volume": "collectionVolume",
  "comparative matrix": "comparativeMatrix",
  "current condition": "currentCondition",
  "current network condition": "currentNetworkCondition",
  "current transit risk": "currentTransitRisk",
  "data quality": "dataQuality",
  "data sources": "dataSources",
  "event readiness": "eventReadiness",
  "feed coverage": "feedCoverage",
  "field coverage": "fieldCoverage",
  "free events": "freeEvents",
  "high severity": "highSeverity",
  "hourly points": "hourlyPoints",
  "latest ingest": "latestIngest",
  "last sync": "lastSync",
  "live data streams": "liveDataStreams",
  normalized: "normalized",
  "normalized event": "normalizedEvent",
  "peak gust": "peakGust",
  "peak index": "peakIndex",
  "peak rain": "peakRain",
  "peak wind": "peakWind",
  pipeline: "pipeline",
  "pollutant fields": "pollutantFields",
  "rain windows": "rainWindows",
  "raw decoded": "rawDecoded",
  "raw feed": "rawFeed",
  "raw messages": "rawMessages",
  records: "latestIngest",
  "below forecast average": "relativeSavings",
  "road events": "roadDisruptions",
  "weather risk": "roadWeather",
  corridors: "corridors",
  "route scoped": "routeScoped",
  "score distribution": "scoreDistribution",
  "score fields": "scoreFields",
  "selected event": "selectedEvent",
  "severity mix": "severityMix",
  "signal level": "signalLevel",
  "source layers": "sourceLayers",
  "source readiness": "sourceReadiness",
  "source request": "sourceRequest",
  "source state": "sourceState",
  "source status": "sourceStatus",
  "event map geometry": "eventMapGeometry",
  "station geometry": "stationGeometry",
  "station ranking": "stationRanking",
  "stop scoped": "stopScoped",
  "temperature range": "temperatureRange",
  "thermal range": "thermalRange",
  "tracked fields": "trackedFields",
  "upcoming events": "upcomingEvents",
  "window state": "windowState",
  "worst score": "worstScore",
  "worst station": "worstStation",
};

function normalizeHelpKey(value: string | null | undefined): string | null {
  const key = value?.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  return key || null;
}

function normalizeHelpLabel(value: string | null | undefined): string | null {
  const label = value
    ?.trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ");

  return label || null;
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
}

function resolveHelpMessageKey(
  normalizedKey: string | null,
  normalizedLabel: string | null,
): string | null {
  if (normalizedKey) {
    return `dataHelp.${snakeToCamel(normalizedKey)}`;
  }

  if (normalizedLabel && HELP_KEY_BY_LABEL[normalizedLabel]) {
    return `dataHelp.${HELP_KEY_BY_LABEL[normalizedLabel]}`;
  }

  return null;
}

export function dataHelpText({
  key,
  label,
  detail,
  language,
}: DataHelpTextOptions): string | null {
  const messageKey = resolveHelpMessageKey(normalizeHelpKey(key), normalizeHelpLabel(label));
  if (messageKey) {
    const translated = translateMessageKey(language, messageKey);
    // A newly introduced API key should never leak into the UI while the
    // message catalog catches up. Prefer the caller's contextual explanation.
    return translated === messageKey ? detail ?? null : translated;
  }

  return detail ?? null;
}

export function DataHelpIcon({ text }: DataHelpIconProps) {
  if (!text) {
    return null;
  }

  return (
    <span
      aria-label={text}
      className="data-help-icon"
      data-tooltip={text}
      role="img"
      title={text}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        info
      </span>
    </span>
  );
}

export function DataLabelWithHelp({
  children,
  className,
  helpText
}: DataLabelWithHelpProps) {
  if (!helpText) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span className={["data-label-with-help", className].filter(Boolean).join(" ")}>
      <span>{children}</span>
      <DataHelpIcon text={helpText} />
    </span>
  );
}
