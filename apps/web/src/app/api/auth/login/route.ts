import { NextRequest, NextResponse } from "next/server";

import {
  resolveServerApiBaseUrl,
  SERVER_API_TIMEOUT_MS,
  SESSION_COOKIE_NAME,
} from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";
import { requestSignalWithTimeout } from "@/features/auth/request-signal";

type BackendLoginResponse = {
  access_token: string;
  expires_at: string;
  user: unknown;
};

function isBackendLoginResponse(value: unknown): value is BackendLoginResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as Partial<BackendLoginResponse>;
  return (
    typeof response.access_token === "string" &&
    response.access_token.trim().length > 0 &&
    typeof response.expires_at === "string" &&
    !Number.isNaN(Date.parse(response.expires_at)) &&
    "user" in response
  );
}

export async function POST(request: NextRequest) {
  const crossSiteResponse = rejectCrossSiteRequest(request);
  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const credentials = await request.json().catch(() => null);
  if (!credentials) {
    return NextResponse.json({ detail: "Invalid login payload." }, { status: 400 });
  }

  const apiBaseUrl = resolveServerApiBaseUrl();
  const backendResponse = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    signal: requestSignalWithTimeout(request.signal, SERVER_API_TIMEOUT_MS),
    body: JSON.stringify(credentials),
  }).catch(() => null);
  if (!backendResponse) {
    return NextResponse.json(
      { detail: "Login backend is unavailable." },
      { status: 502 },
    );
  }

  const responseBody = await backendResponse.json().catch(() => null);

  if (!backendResponse.ok) {
    return NextResponse.json({ detail: "Login failed." }, { status: backendResponse.status });
  }

  if (!isBackendLoginResponse(responseBody)) {
    return NextResponse.json(
      { detail: "Login backend returned an invalid response." },
      { status: 502 },
    );
  }

  const loginResponse = responseBody;
  const response = NextResponse.json({
    expires_at: loginResponse.expires_at,
    user: loginResponse.user,
  });
  response.cookies.set(SESSION_COOKIE_NAME, loginResponse.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(loginResponse.expires_at),
  });

  return response;
}
