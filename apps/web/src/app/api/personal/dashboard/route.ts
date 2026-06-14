import { NextRequest, NextResponse } from "next/server";

import {
  resolveServerApiBaseUrl,
  SESSION_COOKIE_NAME,
} from "@/features/auth/config";

export async function GET(request: NextRequest) {
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
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { detail: "Personal dashboard backend is unavailable." },
      { status: 502 },
    );
  }

  const responseBody = await backendResponse.json().catch(() => null);
  return NextResponse.json(
    responseBody ?? { detail: "Personal dashboard returned an empty response." },
    { status: backendResponse.status },
  );
}
