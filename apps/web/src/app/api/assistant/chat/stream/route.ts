import { NextRequest, NextResponse } from "next/server";

import {
  resolveServerApiBaseUrl,
  SERVER_ASSISTANT_TIMEOUT_MS,
  SESSION_COOKIE_NAME,
} from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";
import { requestSignalWithTimeout } from "@/features/auth/request-signal";

import { assistantJsonResponse } from "../../response";

export async function POST(request: NextRequest) {
  const crossSiteResponse = rejectCrossSiteRequest(request);
  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ detail: "Invalid assistant payload." }, { status: 400 });
  }

  const apiBaseUrl = resolveServerApiBaseUrl();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const backendResponse = await fetch(`${apiBaseUrl}/assistant/chat/stream`, {
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
      { detail: "Assistant backend is unavailable." },
      { status: 502 },
    );
  }

  if (!backendResponse.ok || !backendResponse.body) {
    const responseBody = await backendResponse.json().catch(() => null);
    return assistantJsonResponse(
      backendResponse,
      responseBody,
      "Assistant stream is temporarily unavailable.",
    );
  }

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: {
      "Cache-Control": backendResponse.headers.get("cache-control") ?? "no-cache, no-transform",
      "Content-Type": backendResponse.headers.get("content-type") ?? "text/event-stream",
      "Connection": backendResponse.headers.get("connection") ?? "keep-alive",
      "X-Accel-Buffering": backendResponse.headers.get("x-accel-buffering") ?? "no",
    },
  });
}
