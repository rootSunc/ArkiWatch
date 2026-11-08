"use client";

import type { CSSProperties } from "react";

import { AssistantGlyph } from "@/features/assistant-widget/assistant-glyph";

import { useI18n } from "../i18n";
import {
  nextPersonalWorkflowStep,
  personalContextTone,
  type PersonalDashboardRead,
} from "../personal/personal-dashboard";

const STEP_LABEL_KEYS: Record<string, string> = {
  user: "shell.personalStepUser",
  location: "shell.personalStepLocation",
  preferences: "shell.personalStepPreferences",
  commute: "shell.personalStepCommute",
  telegram: "shell.personalStepTelegram",
};

type PersonalContextStripProps = {
  dashboard: Pick<PersonalDashboardRead, "onboarding_completion_percent" | "workflow_steps">;
  onOpenAssistant: () => void;
  onOpenSettings?: () => void;
};

export function PersonalContextStrip({
  dashboard,
  onOpenAssistant,
  onOpenSettings,
}: PersonalContextStripProps) {
  const { tKey } = useI18n();
  const completionPercent = Math.max(
    0,
    Math.min(100, dashboard.onboarding_completion_percent),
  );
  const nextStep = nextPersonalWorkflowStep(dashboard);
  const tone = personalContextTone(completionPercent);
  const nextStepLabel = nextStep
    ? STEP_LABEL_KEYS[nextStep.key]
      ? tKey(STEP_LABEL_KEYS[nextStep.key])
      : nextStep.title
    : null;
  const actionOpener = nextStep && onOpenSettings ? onOpenSettings : onOpenAssistant;
  const actionLabel = nextStep && onOpenSettings
    ? tKey("shell.personalAssistantSetup")
    : tKey("shell.personalAssistantAsk");

  return (
    <section
      aria-label={tKey("shell.personalAssistantContext")}
      className={`today-personal-context today-personal-context-${tone}`}
    >
      <AssistantGlyph className="today-personal-context-icon" />
      <span className="today-personal-context-copy">
        <span className="today-section-kicker">{tKey("shell.personalAssistantContext")}</span>
        <strong>
          {tKey("shell.personalAssistantProgress").replace(
            "{percent}",
            String(completionPercent),
          )}
        </strong>
        <span>
          {nextStepLabel
            ? tKey("shell.personalAssistantNextStep").replace("{step}", nextStepLabel)
            : tKey("shell.personalAssistantReady")}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="today-personal-context-progress"
        style={{ "--today-personal-progress": `${completionPercent}%` } as CSSProperties}
      >
        <span />
      </span>
      <button
        className="today-secondary-action"
        onClick={() => actionOpener()}
        type="button"
      >
        {actionLabel}
        {nextStep && onOpenSettings ? (
          <span className="material-symbols-outlined" aria-hidden="true">
            tune
          </span>
        ) : (
          <AssistantGlyph />
        )}
      </button>
    </section>
  );
}
