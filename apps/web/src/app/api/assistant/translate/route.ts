import { NextRequest, NextResponse } from "next/server";

import {
  resolveServerApiBaseUrl,
  SERVER_ASSISTANT_TIMEOUT_MS,
  SESSION_COOKIE_NAME,
} from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";
import { requestSignalWithTimeout } from "@/features/auth/request-signal";

import { assistantJsonResponse } from "../response";

export async function POST(request: NextRequest) {
  const crossSiteResponse = rejectCrossSiteRequest(request);
  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ detail: "Invalid translation payload." }, { status: 400 });
  }

  const apiBaseUrl = resolveServerApiBaseUrl();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const backendResponse = await fetch(`${apiBaseUrl}/assistant/translate`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: requestSignalWithTimeout(request.signal, SERVER_ASSISTANT_TIMEOUT_MS),
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { detail: "Translation backend is unavailable." },
      { status: 502 },
    );
  }

  const responseBody = await backendResponse.json().catch(() => null);

  return assistantJsonResponse(
    backendResponse,
    responseBody,
    "Translation service is temporarily unavailable.",
  );
}
