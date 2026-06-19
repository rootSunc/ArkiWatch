"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  preferredLanguageMode,
  storedLanguageMode,
  translateMessageKey,
  type LanguageMode,
} from "@/features/data-platform/i18n";

type LoginFormProps = {
  sessionExpired: boolean;
};

export function LoginForm({ sessionExpired }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  // Keep the first render deterministic for SSR, then apply the saved/browser
  // preference after hydration. Reading navigator/localStorage during render
  // caused the login page to hydrate with different copy in different locales.
  const [language, setLanguage] = useState<LanguageMode>("en");
  const tKey = (key: string) => translateMessageKey(language, key);
  const [error, setError] = useState<string | null>(
    sessionExpired ? translateMessageKey("en", "auth.sessionExpired") : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const nextLanguage = storedLanguageMode() ?? preferredLanguageMode();
    setLanguage(nextLanguage);
    if (sessionExpired) {
      setError(translateMessageKey(nextLanguage, "auth.sessionExpired"));
    }
  }, [sessionExpired]);

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
        setError(tKey("auth.loginFailed"));
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError(tKey("auth.loginFailed"));
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
            <h1 id="login-title">{tKey("auth.adminSignIn")}</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          <label>
            <span>{tKey("auth.username")}</span>
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
            <span>{tKey("auth.password")}</span>
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
            <span>{isSubmitting ? tKey("auth.signingIn") : tKey("auth.signIn")}</span>
          </button>
          <Link className="login-secondary" href="/">
            {tKey("auth.continueAsDemo")}
          </Link>
        </form>
      </section>
    </main>
  );
}
