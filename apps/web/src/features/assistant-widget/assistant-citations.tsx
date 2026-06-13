"use client";

import type { ReactNode } from "react";

import { formatTimestamp } from "@/features/shared/format";

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

export function AssistantCitationList({
  citations,
  language,
  messageId,
  onOpenView,
  tKey,
}: AssistantCitationListProps): ReactNode {
  return (
    <ul>
      {citations.slice(0, MAX_VISIBLE_ASSISTANT_CITATIONS).map((citation, index) => {
        const sourceLabel = assistantCitationSourceLabel(citation.source, language);
        const sourceView = assistantCitationView(citation.source);

        return (
          <li key={`${messageId}-${index}-${citation.source}-${citation.checked_at ?? ""}`}>
            <div>
              {sourceView && onOpenView ? (
                <button
                  aria-label={tKey("assistant.openSource").replace("{source}", sourceLabel)}
                  className="assistant-citation-source-button"
                  onClick={() => onOpenView(sourceView)}
                  type="button"
                >
                  <strong>{sourceLabel}</strong>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    arrow_forward
                  </span>
                </button>
              ) : (
                <strong>{sourceLabel}</strong>
              )}
              {citation.checked_at ? (
                <time dateTime={citation.checked_at}>
                  {tKey("assistant.checkedAt").replace(
                    "{time}",
                    citationTimestamp(citation.checked_at, language),
                  )}
                </time>
              ) : null}
            </div>
            {citation.detail ? (
              <span>{assistantCitationDetail(citation.source, citation.detail, language)}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
