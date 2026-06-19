import { NextRequest, NextResponse } from "next/server";

import {
  resolveServerApiBaseUrl,
  SESSION_COOKIE_NAME,
  SERVER_API_TIMEOUT_MS,
} from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";
import { requestSignalWithTimeout } from "@/features/auth/request-signal";

export async function GET(request: NextRequest) {
  const crossSiteResponse = rejectCrossSiteRequest(request);
  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { detail: "Authentication is required for the personal dashboard." },
      { status: 401 },
    );
  }

  const backendUrl = new URL(`${resolveServerApiBaseUrl()}/personal/dashboard`);
  const requestedUserId = request.nextUrl.searchParams.get("user_id");
  if (requestedUserId) {
    backendUrl.searchParams.set("user_id", requestedUserId);
  }

  const backendResponse = await fetch(backendUrl, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: requestSignalWithTimeout(request.signal, SERVER_API_TIMEOUT_MS),
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { detail: "Personal dashboard backend is unavailable." },
      { status: 502 },
    );
  }

  const responseBody = await backendResponse.json().catch(() => null);
  if (!backendResponse.ok) {
    return NextResponse.json(
      { detail: "Personal dashboard request failed." },
      { status: backendResponse.status },
    );
  }

  return NextResponse.json(
    responseBody ?? { detail: "Personal dashboard returned an empty response." },
    { status: backendResponse.status },
  );
}
