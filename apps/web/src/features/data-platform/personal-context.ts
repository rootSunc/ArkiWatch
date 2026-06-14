import type { components } from "@/lib/api-contract";
import type { ApiJsonResult } from "@/lib/api-client";

export type PersonalLocation = components["schemas"]["UserLocationRead"];
export type PersonalPreference = components["schemas"]["UserPreferenceRead"];
export type PersonalCommuteProfile = components["schemas"]["UserCommuteProfileRead"];
export type PersonalChannel = components["schemas"]["NotificationChannelRead"];

export type PersonalContextRead = {
  locations: PersonalLocation[];
  preferences: PersonalPreference | null;
  commuteProfiles: PersonalCommuteProfile[];
  channels: PersonalChannel[];
};

export type PersonalContextResource = keyof PersonalContextRead;

export type PersonalLocationInput = Omit<
  components["schemas"]["UserLocationCreate"],
  "user_id"
> & { id?: string };
export type PersonalPreferenceInput = Omit<
  components["schemas"]["UserPreferenceUpsert"],
  "user_id"
>;
export type PersonalCommuteInput = Omit<
  components["schemas"]["UserCommuteProfileCreate"],
  "user_id"
> & { id?: string };
export type PersonalChannelInput = Omit<
  components["schemas"]["NotificationChannelUpsert"],
  "user_id"
>;

type ErrorBody = { detail?: string | Array<{ msg?: string }> } | null;

function errorMessage(body: ErrorBody, fallback: string): string {
  if (typeof body?.detail === "string" && body.detail.trim()) {
    return body.detail;
  }

  if (Array.isArray(body?.detail)) {
    const messages = body.detail
      .map((item) => item.msg?.trim())
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  return fallback;
}

export async function fetchPersonalContext(): Promise<ApiJsonResult<PersonalContextRead>> {
  try {
    const response = await fetch("/api/personal/context", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const body = (await response.json().catch(() => null)) as
      | PersonalContextRead
      | ErrorBody;

    if (!response.ok) {
      return {
        data: null,
        error: errorMessage(body as ErrorBody, `Personal context request failed with ${response.status}.`),
        status: response.status,
      };
    }

    return { data: body as PersonalContextRead, error: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Personal context request failed.",
      status: null,
    };
  }
}

export async function savePersonalContext(
  resource: PersonalContextResource,
  payload:
    | PersonalLocationInput
    | PersonalPreferenceInput
    | PersonalCommuteInput
    | PersonalChannelInput,
): Promise<ApiJsonResult<unknown>> {
  try {
    const response = await fetch("/api/personal/context", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ resource, payload }),
    });
    const body = (await response.json().catch(() => null)) as ErrorBody | unknown;

    if (!response.ok) {
      return {
        data: null,
        error: errorMessage(body as ErrorBody, `Personal context update failed with ${response.status}.`),
        status: response.status,
      };
    }

    return { data: body, error: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Personal context update failed.",
      status: null,
    };
  }
}
