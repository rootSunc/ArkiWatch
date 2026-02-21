import { NextRequest, NextResponse } from "next/server";

import { resolveServerApiBaseUrl, SESSION_COOKIE_NAME } from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";

type BackendLoginResponse = {
  access_token: string;
  expires_at: string;
  user: unknown;
};

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
    body: JSON.stringify(credentials),
  });
  const responseBody = await backendResponse.json().catch(() => null);

  if (!backendResponse.ok) {
    return NextResponse.json(
      { detail: formatLoginError(responseBody?.detail) },
      { status: backendResponse.status },
    );
  }

  const loginResponse = responseBody as BackendLoginResponse;
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

function formatLoginError(detail: unknown): string {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (typeof item?.msg === "string" ? item.msg : null))
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  return "Login failed.";
}
