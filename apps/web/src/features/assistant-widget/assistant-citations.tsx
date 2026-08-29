"use client";

import type { ReactNode } from "react";

import { formatTimestamp } from "@/features/shared/format";
import { MaterialIcon } from "@/features/shared/material-icon";

import {
  translateDataLabel,
  translateEnumLabel,
  translateMessageKey,
  type LanguageMode,
} from "@/features/data-platform/i18n";
import { localizedPlatformCopy } from "@/features/data-platform/platform-copy";

import type { AssistantApiCitation } from "./assistant-stream";

type AssistantCitationListProps = {
  citations: AssistantApiCitation[];
  language: LanguageMode;
  messageId: string;
  onOpenView?: (view: string) => void;
  sourceDocumentation?: Record<string, string>;
  tKey: (key: string) => string;
};

export const MAX_VISIBLE_ASSISTANT_CITATIONS = 4;

const SOURCE_DEFINITIONS: Record<string, { labelKey: string; view: string }> = {
  platform_overview: { labelKey: "assistant.sourcePlatformOverview", view: "overview" },
  weather: { labelKey: "assistant.sourceWeather", view: "weather" },
  air_quality: { labelKey: "assistant.sourceAirQuality", view: "air" },
  energy_grid: { labelKey: "assistant.sourceEnergy", view: "energy" },
  energy_household: { labelKey: "assistant.sourceEnergy", view: "energy" },
  traffic: { labelKey: "assistant.sourceRoadRail", view: "mobility" },
  transit: { labelKey: "assistant.sourceTransit", view: "mobility" },
  platform_history: { labelKey: "assistant.sourceHistory", view: "overview" },
};

const SOURCE_ICONS: Record<string, string> = {
  platform_overview: "hub",
  platform_history: "hub",
  weather: "cloud",
  air_quality: "air",
  energy_grid: "bolt",
  energy_household: "bolt",
  traffic: "commute",
  transit: "commute",
};

function assistantCitationIcon(source: string): string {
  return SOURCE_ICONS[source.trim().toLowerCase()] ?? "database";
}

function sourceDefinition(source: string): { labelKey: string; view: string } | null {
  return SOURCE_DEFINITIONS[source.trim().toLowerCase()] ?? null;
}

export function assistantCitationSourceLabel(
  source: string,
  language: LanguageMode,
): string {
  const definition = sourceDefinition(source);
  if (definition) {
    return translateMessageKey(language, definition.labelKey);
  }

  return localizedPlatformCopy(source, language) ?? translateDataLabel(language, source);
}

export function assistantCitationView(source: string): string | null {
  return sourceDefinition(source)?.view ??
    (source.trim().toLowerCase() === "static demo fixture" ? "overview" : null);
}

export function assistantCitationDocumentationUrl(
  source: string,
  sourceDocumentation: Record<string, string> = {},
): string | null {
  const normalizedSource = source.trim().toLowerCase();
  const directUrl = sourceDocumentation[normalizedSource];
  if (directUrl) {
    return directUrl;
  }

  const view = assistantCitationView(source);
  return view ? sourceDocumentation[view] ?? null : null;
}

export function assistantCitationFollowUp(
  source: string,
  language: LanguageMode,
): string | null {
  const normalizedSource = source.trim().toLowerCase();
  const key = normalizedSource.includes("weather") || normalizedSource.includes("air")
    ? "assistant.bestTimeToGoOutside"
    : normalizedSource.includes("traffic") || normalizedSource.includes("transit")
      ? "assistant.bestTimeToCommute"
      : normalizedSource.includes("energy")
        ? "assistant.explainCurrent"
        : normalizedSource.includes("overview") || normalizedSource.includes("history")
          ? "assistant.whichSourceAbnormal"
          : null;

  return key ? translateMessageKey(language, key) : null;
}

function citationTimestamp(value: string, language: LanguageMode): string {
  try {
    return formatTimestamp(value, "dateTime", language);
  } catch {
    return value;
  }
}

export function assistantCitationDetail(
  source: string,
  detail: string,
  language: LanguageMode,
): string {
  const trimmedDetail = detail.trim();
  if (!trimmedDetail) {
    return "";
  }

  const sourceLabel = assistantCitationSourceLabel(source, language);
  const snapshotMatch = trimmedDetail.match(/^.+ data snapshot\.$/i);
  if (snapshotMatch) {
    return translateMessageKey(language, "assistant.sourceSnapshotDetail").replace(
      "{source}",
      sourceLabel,
    );
  }

  const statusMatch = trimmedDetail.match(/^.+ status=([^,]+), location=(.+)\.$/i);
  if (statusMatch) {
    return translateMessageKey(language, "assistant.sourceStatusDetail")
      .replace("{status}", translateEnumLabel(language, statusMatch[1] ?? ""))
      .replace("{location}", translateDataLabel(language, statusMatch[2] ?? ""));
  }

  if (trimmedDetail.startsWith("Data collection temporarily unavailable.")) {
    return translateMessageKey(language, "assistant.sourceUnavailableDetail");
  }

  const demoSnapshotMatch = trimmedDetail.match(/^(.+?) snapshot · (.+)$/i);
  if (demoSnapshotMatch) {
    return translateMessageKey(language, "assistant.demoSnapshotDetail")
      .replace("{location}", translateDataLabel(language, demoSnapshotMatch[1] ?? ""))
      .replace("{date}", demoSnapshotMatch[2] ?? "");
  }

  return trimmedDetail;
}

/**
 * Evidence cards. Each citation is a button that navigates to the source
 * workspace when one exists — this is the assistant's citation mechanism
 * (README §12). A citation carries `{source, checked_at, detail}` only; there
 * is no numeric readout, so the card shows the source and when it was checked.
 */
export function AssistantCitationList({
  citations,
  language,
  messageId,
  onOpenView,
  sourceDocumentation,
  tKey,
}: AssistantCitationListProps): ReactNode {
  return (
    <div className="assistant-evidence" aria-label={tKey("assistant.viewSources")}>
      {citations.slice(0, MAX_VISIBLE_ASSISTANT_CITATIONS).map((citation, index) => {
        const sourceLabel = assistantCitationSourceLabel(citation.source, language);
        const sourceView = assistantCitationView(citation.source);
        const documentationUrl = assistantCitationDocumentationUrl(
          citation.source,
          sourceDocumentation,
        );
        const checkedLabel = citation.checked_at
          ? citationTimestamp(citation.checked_at, language)
          : assistantCitationDetail(citation.source, citation.detail, language);
        const key = `${messageId}-${index}-${citation.source}-${citation.checked_at ?? ""}`;
        const cardBody = (
          <>
            <span className="assistant-evidence-top">
              <MaterialIcon name={assistantCitationIcon(citation.source)} />
              <span className="assistant-evidence-label">{sourceLabel}</span>
            </span>
            {checkedLabel ? (
              <span className="assistant-evidence-value">{checkedLabel}</span>
            ) : null}
          </>
        );

        if (sourceView && onOpenView) {
          return (
            <button
              aria-label={tKey("assistant.openSource").replace("{source}", sourceLabel)}
              className="assistant-evidence-card"
              key={key}
              onClick={() => onOpenView(sourceView)}
              type="button"
            >
              {cardBody}
            </button>
          );
        }

        if (documentationUrl) {
          return (
            <a
              aria-label={`${sourceLabel} · ${tKey("assistant.openProviderDocs")}`}
              className="assistant-evidence-card"
              href={documentationUrl}
              key={key}
              rel="noreferrer"
              target="_blank"
            >
              {cardBody}
            </a>
          );
        }

        return (
          <span className="assistant-evidence-card assistant-evidence-card-static" key={key}>
            {cardBody}
          </span>
        );
      })}
    </div>
  );
}
