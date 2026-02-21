import { NextRequest, NextResponse } from "next/server";

export function rejectCrossSiteRequest(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  if (sameOrigin(origin, request)) {
    return null;
  }

  return NextResponse.json({ detail: "Cross-site requests are not allowed." }, { status: 403 });
}

function sameOrigin(origin: string, request: NextRequest): boolean {
  const requestOrigin = publicRequestOrigin(request);
  return origin === requestOrigin || origin === process.env.NEXT_PUBLIC_APP_ORIGIN;
}

function publicRequestOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    return `${forwardedProto ?? request.nextUrl.protocol.replace(":", "")}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) {
    return `${request.nextUrl.protocol}//${host}`;
  }

  return request.nextUrl.origin;
}
