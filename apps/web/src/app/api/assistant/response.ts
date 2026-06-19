import { NextResponse } from "next/server";

const FORWARDED_HEADERS = ["retry-after", "www-authenticate"] as const;

function safeErrorDetail(status: number, fallback: string): string {
  if (status === 429) {
    return "Assistant request limit reached. Please try again shortly.";
  }

  if (status === 401 || status === 403) {
    return "Assistant access is unavailable.";
  }

  return fallback;
}

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

  const responseBody = response.ok
    ? body ?? { detail: fallback }
    : { detail: safeErrorDetail(response.status, fallback) };

  return NextResponse.json(responseBody, {
    status: response.status,
    headers,
  });
}
