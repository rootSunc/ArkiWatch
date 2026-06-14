import { NextRequest, NextResponse } from "next/server";

import {
  resolveServerApiBaseUrl,
  SESSION_COOKIE_NAME,
  type SessionUser,
} from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";

const RESOURCE_PATHS = {
  locations: "/user/locations",
  preferences: "/user/preferences",
  commuteProfiles: "/user/commute-profiles",
  channels: "/user/channels",
} as const;

type ResourceKey = keyof typeof RESOURCE_PATHS;

type ContextPayload = {
  resource?: ResourceKey;
  payload?: Record<string, unknown>;
};

type AuthContext = {
  token: string;
  user: SessionUser;
};

type AuthResult = AuthContext | NextResponse;

async function resolveAuthContext(request: NextRequest): Promise<AuthResult> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { detail: "Authentication is required for personal context." },
      { status: 401 },
    );
  }

  let response: Response;
  try {
    response = await fetch(`${resolveServerApiBaseUrl()}/auth/me`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return NextResponse.json(
      { detail: "Personal context backend is unavailable." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { detail: "Authentication is required for personal context." },
      { status: response.status === 401 ? 401 : 502 },
    );
  }

  const user = (await response.json().catch(() => null)) as SessionUser | null;
  if (!user?.id) {
    return NextResponse.json(
      { detail: "Authenticated user context is unavailable." },
      { status: 502 },
    );
  }

  return { token, user };
}

function isNextResponse(value: AuthResult): value is NextResponse {
  return value instanceof NextResponse;
}

async function readBackendBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function responseFromBackend(response: Response, body: unknown, fallback: string) {
  return NextResponse.json(
    body ?? { detail: fallback },
    { status: response.status },
  );
}

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (isNextResponse(auth)) {
    return auth;
  }

  const apiBaseUrl = resolveServerApiBaseUrl();
  const entries = Object.entries(RESOURCE_PATHS) as Array<[ResourceKey, string]>;
  let responses: Array<[ResourceKey, Response]>;
  try {
    responses = await Promise.all(
      entries.map(async ([key, path]) => {
        const url = new URL(`${apiBaseUrl}${path}`);
        url.searchParams.set("user_id", auth.user.id);
        const response = await fetch(url, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        return [key, response];
      }),
    );
  } catch {
    return NextResponse.json(
      { detail: "Personal context backend is unavailable." },
      { status: 502 },
    );
  }

  const failed = responses.find(([, response]) => !response.ok);
  if (failed) {
    const body = await readBackendBody(failed[1]);
    return responseFromBackend(
      failed[1],
      body,
      "Personal context could not be loaded.",
    );
  }

  const context = Object.fromEntries(
    await Promise.all(
      responses.map(async ([key, response]) => [key, await readBackendBody(response)]),
    ),
  );
  return NextResponse.json(context, { status: 200 });
}

export async function POST(request: NextRequest) {
  const crossSiteResponse = rejectCrossSiteRequest(request);
  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const auth = await resolveAuthContext(request);
  if (isNextResponse(auth)) {
    return auth;
  }

  const body = (await request.json().catch(() => null)) as ContextPayload | null;
  if (!body || !body.resource || !(body.resource in RESOURCE_PATHS)) {
    return NextResponse.json(
      { detail: "A valid personal context resource is required." },
      { status: 400 },
    );
  }
  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    return NextResponse.json(
      { detail: "A personal context payload is required." },
      { status: 400 },
    );
  }

  const payloadId = body.payload.id;
  const supportsUpdate = body.resource === "locations" || body.resource === "commuteProfiles";
  let updateId: string | null = null;
  if (payloadId !== undefined && payloadId !== null) {
    if (!supportsUpdate || typeof payloadId !== "string" || !payloadId.trim()) {
      return NextResponse.json(
        { detail: "Only saved locations and commute profiles can be updated by id." },
        { status: 400 },
      );
    }
    updateId = payloadId;
  }

  const payloadWithoutId = { ...body.payload };
  delete payloadWithoutId.id;
  const resourcePath = updateId
    ? `${RESOURCE_PATHS[body.resource]}/${encodeURIComponent(updateId)}`
    : RESOURCE_PATHS[body.resource];

  const backendResponse = await fetch(
    `${resolveServerApiBaseUrl()}${resourcePath}`,
    {
      method: updateId ? "PUT" : "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payloadWithoutId, user_id: auth.user.id }),
    },
  ).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { detail: "Personal context backend is unavailable." },
      { status: 502 },
    );
  }

  return responseFromBackend(
    backendResponse,
    await readBackendBody(backendResponse),
    "Personal context update failed.",
  );
}
