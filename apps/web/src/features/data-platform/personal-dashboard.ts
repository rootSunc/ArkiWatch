import type { components } from "@/lib/api-contract";
import {
  DEFAULT_API_TIMEOUT_MS,
  apiTransportErrorMessage,
  type ApiJsonResult,
} from "@/lib/api-client";
import { requestSignalWithTimeout } from "@/lib/request-signal";

export type PersonalDashboardRead = components["schemas"]["DashboardRead"];
export type PersonalWorkflowStep = components["schemas"]["DashboardWorkflowStepRead"];

export function nextPersonalWorkflowStep(
  dashboard: Pick<PersonalDashboardRead, "workflow_steps">,
): PersonalWorkflowStep | null {
  return dashboard.workflow_steps.find((step) => step.status !== "complete") ?? null;
}

export function personalContextTone(
  completionPercent: number,
): "good" | "warn" | "neutral" {
  if (completionPercent >= 100) {
    return "good";
  }

  if (completionPercent > 0) {
    return "warn";
  }

  return "neutral";
}

export async function fetchPersonalDashboard(
  signal?: AbortSignal,
): Promise<ApiJsonResult<PersonalDashboardRead>> {
  try {
    const response = await fetch("/api/personal/dashboard", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: signal
        ? requestSignalWithTimeout(signal, DEFAULT_API_TIMEOUT_MS)
        : AbortSignal.timeout(DEFAULT_API_TIMEOUT_MS),
    });
    const responseBody = (await response.json().catch(() => null)) as
      | PersonalDashboardRead
      | { detail?: string }
      | null;

    if (!response.ok) {
      return {
        data: null,
        error:
          responseBody && "detail" in responseBody && responseBody.detail
            ? responseBody.detail
            : `Personal dashboard request failed with ${response.status}.`,
        status: response.status,
      };
    }

    return { data: responseBody as PersonalDashboardRead, error: null, status: response.status };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    return {
      data: null,
      error: apiTransportErrorMessage(error, "Personal dashboard request failed."),
      status: null,
    };
  }
}
