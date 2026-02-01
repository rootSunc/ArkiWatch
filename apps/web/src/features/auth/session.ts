import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  normalizeApiBaseUrl,
  SESSION_COOKIE_NAME,
} from "./config";
import type { AuthSession, SessionUser } from "./config";

export async function getCurrentSession(): Promise<AuthSession | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const apiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  try {
    const response = await fetch(`${apiBaseUrl}/auth/me`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return {
      token,
      user: (await response.json()) as SessionUser,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  return session;
}
