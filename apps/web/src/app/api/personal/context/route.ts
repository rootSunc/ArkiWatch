import { NextRequest, NextResponse } from "next/server";
import { resolveServerApiBaseUrl, SESSION_COOKIE_NAME, SERVER_API_TIMEOUT_MS } from "@/features/auth/config";
import { rejectCrossSiteRequest } from "@/features/auth/request-guard";
import { requestSignalWithTimeout } from "@/features/auth/request-signal";

async function proxy(request: NextRequest) {
 const rejected = rejectCrossSiteRequest(request);
 if (rejected) return rejected;
 const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
 if (!token) return NextResponse.json({ detail: "Authentication is required for personal context." }, { status: 401 });
 const response = await fetch(`${resolveServerApiBaseUrl()}/me/context`, {
  method: request.method,
  cache: "no-store",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: request.method === "POST" ? await request.text() : undefined,
  signal: requestSignalWithTimeout(request.signal, SERVER_API_TIMEOUT_MS),
 }).catch(() => null);
 if (!response) return NextResponse.json({ detail: "Personal context backend is unavailable." }, { status: 502 });
 if (response.status >= 500) return NextResponse.json({ detail: "Personal context could not be loaded." }, { status: response.status });
 const body = await response.json().catch(() => null);
 if (body === null) return NextResponse.json({ detail: "Personal context backend returned an invalid response." }, { status: 502 });
 return NextResponse.json(body, { status: response.status });
}
export const GET = proxy;
export const POST = proxy;
