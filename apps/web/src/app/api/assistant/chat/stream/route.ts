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
    return NextResponse.json(
      responseBody ?? { detail: "Assistant stream returned an empty response." },
      { status: backendResponse.status },
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
