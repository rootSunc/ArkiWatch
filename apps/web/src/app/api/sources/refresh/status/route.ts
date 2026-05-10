import { NextRequest, NextResponse } from "next/server";

import {
  resolveServerApiBaseUrl,
  SESSION_COOKIE_NAME,
} from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";

export async function GET(request: NextRequest) {
  const crossSiteResponse = rejectCrossSiteRequest(request);
  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const apiBaseUrl = resolveServerApiBaseUrl();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const backendResponse = await fetch(`${apiBaseUrl}/sources/refresh/status`, {
    method: "GET",
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { detail: "Source refresh status backend is unavailable." },
      { status: 502 },
    );
  }

  const responseBody = await backendResponse.json().catch(() => null);

  return NextResponse.json(
    responseBody ?? { detail: "Source refresh status returned an empty response." },
    { status: backendResponse.status },
  );
}
