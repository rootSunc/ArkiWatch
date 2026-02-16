import { NextRequest, NextResponse } from "next/server";

import {
  normalizeApiBaseUrl,
  SESSION_COOKIE_NAME,
} from "@/features/auth/config";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ detail: "Invalid translation payload." }, { status: 400 });
  }

  const apiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const backendResponse = await fetch(`${apiBaseUrl}/assistant/translate`, {
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
      { detail: "Translation backend is unavailable." },
      { status: 502 },
    );
  }

  const responseBody = await backendResponse.json().catch(() => null);

  return NextResponse.json(
    responseBody ?? { detail: "Translation service returned an empty response." },
    { status: backendResponse.status },
  );
}
