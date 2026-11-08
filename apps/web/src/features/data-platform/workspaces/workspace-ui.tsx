"use client";

import { useContext, type ReactNode } from "react";
import { InspectionContext } from "@/features/shared/ui/inspection-context";

import { scopedDataTimestamp } from "../model/data-time-scope";
import type { LanguageMode } from "../i18n";
import type { PlatformTimeScope } from "../types";
import { MaterialIcon } from "@/features/shared/material-icon";

type TranslateMessage = (key: string) => string;

export type WorkspaceTone =
  | "good"
  | "warn"
  | "bad"
  | "neutral"
  | "ready"
  | "stale"
  | "failed"
  | "empty";

type WorkspaceEvidenceHeaderProps = {
  className?: string;
  eyebrow?: ReactNode;
  headingLevel?: 1 | 2;
  title: ReactNode;
  status?: ReactNode;
  statusTone?: WorkspaceTone;
  sourceLabel?: string | null;
  observedAt?: string | null;
  timeScope?: PlatformTimeScope | null;
  language: LanguageMode;
  tKey: TranslateMessage;
  fallbackKey: string;
  timezone?: string;
  children?: ReactNode;
};

/**
 * Shared detail-page header. Every workspace answers the same trust questions
 * in the same place: what is this, what is its current state, and where/when
 * was the displayed evidence collected.
 */
export function WorkspaceEvidenceHeader({
  className = "",
  eyebrow,
  headingLevel = 1,
  title,
  status,
  statusTone = "neutral",
  sourceLabel,
  observedAt,
  timeScope,
  language,
  tKey,
  fallbackKey,
  timezone,
  children,
}: WorkspaceEvidenceHeaderProps) {
  const inspection = useContext(InspectionContext);
  const Heading = inspection
    ? headingLevel === 2
      ? "h3"
      : "h2"
    : headingLevel === 2
      ? "h2"
      : "h1";
  const timestamp = scopedDataTimestamp(
    observedAt,
    timeScope,
    language,
    tKey,
    fallbackKey,
    timezone,
  );

  return (
    <header className={`workspace-evidence-header ${className}`.trim()}>
      <div className="workspace-evidence-heading">
        {eyebrow ? (
          <span className="workspace-evidence-eyebrow">{eyebrow}</span>
        ) : null}
        <Heading>{title}</Heading>
        {status ? (
          <div
            className={`workspace-evidence-status workspace-evidence-status-${statusTone}`}
          >
            <span aria-hidden="true" />
            <strong>{status}</strong>
          </div>
        ) : null}
      </div>
      <div className="workspace-evidence-meta">
        {sourceLabel ? (
          <span className="workspace-evidence-source">{sourceLabel}</span>
        ) : null}
        <time dateTime={observedAt ?? undefined}>{timestamp}</time>
        {children ? (
          <details className="workspace-evidence-extra">
            <summary>{tKey("shell.sourceDetails")}</summary>
            <div className="workspace-evidence-extra-content">{children}</div>
          </details>
        ) : null}
      </div>
    </header>
  );
}

type WorkspaceEmptyStateProps = {
  className?: string;
  eyebrow?: ReactNode;
  headingLevel?: 1 | 2;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
};

/** Consistent, calm empty/error state for a missing source window. */
export function WorkspaceEmptyState({
  className = "",
  eyebrow,
  headingLevel = 2,
  title,
  description,
  action,
}: WorkspaceEmptyStateProps) {
  const inspection = useContext(InspectionContext);
  const Heading = inspection
    ? headingLevel === 1
      ? "h2"
      : "h3"
    : headingLevel === 1
      ? "h1"
      : "h2";

  return (
    <section className={`workspace-empty-state ${className}`.trim()}>
      {eyebrow ? (
        <span className="workspace-empty-state-eyebrow">{eyebrow}</span>
      ) : null}
      <MaterialIcon name="cloud_off" className="workspace-empty-state-icon" />
      <Heading>{title}</Heading>
      <p>{description}</p>
      {action ? (
        <div className="workspace-empty-state-action">{action}</div>
      ) : null}
    </section>
  );
}
