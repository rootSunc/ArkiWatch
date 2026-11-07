"use client";

import { cityLabel } from "./city-scope";
import { RefreshErrorBanner } from "./data-platform-shell";
import { useI18n } from "./i18n";
import type { PlatformTimeScope } from "./types";

type ShellNoticesProps = {
  historicalDate: string | null;
  timeScope: PlatformTimeScope | null;
  onReturnToLive: () => void;
  isDemo: boolean;
  isDetailPage: boolean;
  demoCitySupported: boolean;
  demoSnapshotCheckedAt: string | null;
  selectedCity: string;
  isScopePending: boolean;
  refreshError: string | null;
  onDismissRefreshError: () => void;
};

/**
 * The banners that qualify what is below them.
 *
 * Each one answers "why is this not simply live data for my city right now":
 * a past date, a fixture, a scope still loading, a refresh that failed. They
 * sit together because a reader needs all of them before trusting a number,
 * and because only one is usually present.
 */
export function ShellNotices({ isDemo, demoCitySupported, selectedCity, refreshError, onDismissRefreshError }: ShellNoticesProps) {
  const { language, tKey } = useI18n();
  return <>
    {isDemo && !demoCitySupported ? <p className="scope-limited-notice" role="status">{tKey("shell.demoModeCityLimited").replace("{city}", cityLabel(selectedCity))}</p> : null}
    {refreshError ? <RefreshErrorBanner error={refreshError} language={language} onDismiss={onDismissRefreshError} /> : null}
  </>;
}

type PlatformDataWarningProps = {
  hasPartialData: boolean;
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
};

/**
 * Shown when the platform read failed. It distinguishes a partial answer from
 * none at all, and always offers a way back — the retry button is also the
 * focus target after a failed attempt.
 */
export function PlatformDataWarning({
  hasPartialData,
  message,
  isRetrying,
  onRetry,
}: PlatformDataWarningProps) {
  const { tKey } = useI18n();

  return (
    <div className="platform-inline-warning" role="alert">
      <span className="material-symbols-outlined" aria-hidden="true">
            warning
          </span>
      <span className="platform-inline-warning-copy">
        <strong>
          {hasPartialData ? tKey("shell.partialDataWarning") : tKey("shell.dataUnavailableWarning")}
        </strong>
        <span>{message}</span>
      </span>
      <button
        className="platform-inline-warning-action"
        disabled={isRetrying}
        onClick={onRetry}
        type="button"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
            refresh
          </span>
        {isRetrying ? tKey("shell.retrying") : tKey("shell.retryData")}
      </button>
    </div>
  );
}

type PlatformUnavailableProps = {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
  apiBaseUrl: string;
  userId: string | null;
};

/**
 * Shown when there is no overview to render at all, as opposed to a partial
 * one. It names the endpoint it tried and the user context it used, because
 * the usual cause is a misconfigured self-hosted deployment rather than an
 * outage.
 */
export function PlatformUnavailable({
  message,
  isRetrying,
  onRetry,
  apiBaseUrl,
  userId,
}: PlatformUnavailableProps) {
  const { tKey } = useI18n();

  return (
    <section className="platform-error" aria-label={tKey("shell.platformUnavailable")}>
      <span>{tKey("shell.platformUnavailable")}</span>
      <h1>{tKey("shell.dataPlatformCouldNotLoad")}</h1>
      <p>{message}</p>
      <div className="platform-error-actions">
        <button
          className="platform-error-retry"
          disabled={isRetrying}
          onClick={onRetry}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            refresh
          </span>
          {isRetrying ? tKey("shell.retrying") : tKey("shell.retryData")}
        </button>
      </div>
      <small>
        {tKey("shell.apiEndpoint")}: {apiBaseUrl}
        {userId ? `, ${tKey("shell.userContext")}: ${userId}` : ""}
      </small>
    </section>
  );
}
