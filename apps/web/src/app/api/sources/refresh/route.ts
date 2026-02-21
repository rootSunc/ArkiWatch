import { NextRequest, NextResponse } from "next/server";

import {
  resolveServerApiBaseUrl,
  SESSION_COOKIE_NAME,
} from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";

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
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { detail: "Source refresh backend is unavailable." },
      { status: 502 },
    );
  }

  const responseBody = await backendResponse.json().catch(() => null);

  return NextResponse.json(
    responseBody ?? { detail: "Source refresh returned an empty response." },
    { status: backendResponse.status },
  );
}
