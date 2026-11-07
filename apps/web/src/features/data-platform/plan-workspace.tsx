"use client";
import { Card, EmptyState, PageHeader } from "@/features/shared/ui/console";
import { useI18n } from "./i18n";
import { DayPlanTimeline } from "./today/day-plan-timeline";
import { PersonalTodayCards } from "./today/personal-today-cards";
import type { PersonalDashboardRead } from "./personal-dashboard";
import type { TodayBrief } from "./today/today-brief";
import type { PlatformEvent } from "./types";
export function PlanWorkspace({
  brief,
  personal,
  error,
  onRetry,
  onOpenAssistant,
  onOpenEvent,
  onOpenScenario,
  onEditContext,
}: {
  brief: TodayBrief | null;
  personal: PersonalDashboardRead | null;
  error: string | null;
  onRetry: () => void;
  onOpenAssistant: (q?: string) => void;
  onOpenEvent: (e: PlatformEvent) => void;
  onOpenScenario: (key: string) => void;
  onEditContext: () => void;
}) {
  const { language, tKey } = useI18n();
  const hasContext = Boolean(
    personal?.today?.cards.length ||
      (personal?.onboarding_completion_percent ?? 0) > 0,
  );
  return (
    <div className="console-plan">
      <PageHeader
        title={tKey("shell.navPlan")}
        subtitle={tKey("shell.savedContext")}
        actions={
          <button
            className="console-button"
            type="button"
            onClick={onEditContext}
          >
            {tKey("shell.editContext")}
          </button>
        }
      />
      {error ? (
        <div role="alert">
          {error}
          <button className="console-button" type="button" onClick={onRetry}>
            {tKey("shell.retry")}
          </button>
        </div>
      ) : null}
      {!hasContext ? (
        <EmptyState
          title={tKey("shell.noPersonalContext")}
          description={tKey("shell.noPersonalContextDetail")}
        />
      ) : (
        <Card title={tKey("shell.todayPlan")}>
          <DayPlanTimeline
            items={brief?.planItems ?? []}
            language={language}
            recommendationMode={brief?.recommendationMode}
            timezone={brief?.timezone}
            onOpenEvent={onOpenEvent}
            onOpenScenario={onOpenScenario}
          />
        </Card>
      )}
      {personal ? (
        <PersonalTodayCards
          dashboard={personal}
          language={language}
          onOpenAssistant={onOpenAssistant}
        />
      ) : null}
    </div>
  );
}
