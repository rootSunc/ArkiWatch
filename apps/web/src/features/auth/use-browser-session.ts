"use client";

import { useEffect, useState } from "react";

import type { SessionUser } from "./config";

export function useBrowserSession(hasSessionCookie: boolean) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [resolved, setResolved] = useState(!hasSessionCookie);

  useEffect(() => {
    if (!hasSessionCookie) {
      return;
    }

    let cancelled = false;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return (await response.json()) as SessionUser;
      })
      .then((nextUser) => {
        if (cancelled) {
          return;
        }
        setUser(nextUser);
        setResolved(true);
      })
      .catch(() => {
        if (!cancelled) {
          setResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasSessionCookie]);

  const isAuthenticated = hasSessionCookie && (!resolved || user !== null);

  return {
    isAuthenticated,
    userId: user?.id,
    label: user?.name ?? user?.email ?? user?.id ?? (isAuthenticated ? "" : "Demo view"),
  };
}
