import { NextResponse } from "next/server";

const FORWARDED_HEADERS = ["retry-after", "www-authenticate"] as const;

/** Keep actionable backend headers when the browser calls the same-origin proxy. */
export function assistantJsonResponse(
  response: Response,
  body: unknown,
  fallback: string,
): NextResponse {
  const headers = new Headers();
  for (const header of FORWARDED_HEADERS) {
    const value = response.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }

  return NextResponse.json(body ?? { detail: fallback }, {
    status: response.status,
    headers,
  });
}
