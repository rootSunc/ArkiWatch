import { NextRequest, NextResponse } from "next/server";

import {
  resolveServerApiBaseUrl,
  SESSION_COOKIE_NAME,
  SERVER_API_TIMEOUT_MS,
} from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";
import { requestSignalWithTimeout } from "@/features/auth/request-signal";

export async function POST(request: NextRequest) {
  const crossSiteResponse = rejectCrossSiteRequest(request);
  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const apiBaseUrl = resolveServerApiBaseUrl();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const backendResponse = await fetch(`${apiBaseUrl}/sources/refresh`, {
    method: "POST",
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: requestSignalWithTimeout(request.signal, SERVER_API_TIMEOUT_MS),
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { detail: "Source refresh backend is unavailable." },
      { status: 502 },
    );
  }

  const responseBody = await backendResponse.json().catch(() => null);

  if (!backendResponse.ok) {
    return NextResponse.json(
      { detail: "Source refresh request failed." },
      { status: backendResponse.status },
    );
  }

  return NextResponse.json(
    responseBody ?? { detail: "Source refresh returned an empty response." },
    { status: backendResponse.status },
  );
}
