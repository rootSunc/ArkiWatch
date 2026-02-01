"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

type LoginFormProps = {
  sessionExpired: boolean;
};

export function LoginForm({ sessionExpired }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    sessionExpired ? "Session expired. Please sign in again." : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(formatLoginError(body?.detail));
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">
            <Image alt="" height={96} priority src="/brand/logo.png" width={96} />
          </span>
          <div>
            <span>ArkiWatch</span>
            <h1 id="login-title">Admin sign in</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              autoFocus
              name="username"
              onChange={(event) => setUsername(event.currentTarget.value)}
              required
              value={username}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="login-submit" disabled={isSubmitting} type="submit">
            <span className="material-symbols-outlined" aria-hidden="true">
              login
            </span>
            <span>{isSubmitting ? "Signing in" : "Sign in"}</span>
          </button>
        </form>
      </section>
    </main>
  );
}

function formatLoginError(detail: unknown): string {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (typeof item?.msg === "string" ? item.msg : null))
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  return "Login failed.";
}
