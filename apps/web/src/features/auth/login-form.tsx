"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  applyLanguageMode,
  preferredLanguageMode,
  saveLanguageMode,
  storedLanguageMode,
  translateMessageKey,
  useIsomorphicLayoutEffect,
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
  const errorRef = useRef<HTMLParagraphElement>(null);

  useIsomorphicLayoutEffect(() => {
    const nextLanguage = storedLanguageMode() ?? preferredLanguageMode();
    setLanguage(nextLanguage);
    applyLanguageMode(nextLanguage);
    if (sessionExpired) {
      setError(translateMessageKey(nextLanguage, "auth.sessionExpired"));
    }
  }, [sessionExpired]);

  useEffect(() => {
    const title = `${translateMessageKey(language, "auth.adminSignIn")} | ArkiWatch`;
    const applyTitle = () => {
      if (document.title !== title) {
        document.title = title;
      }
    };

    applyTitle();

    // Next's metadata reconciliation can run after this client effect during
    // navigation. Keep a short bounded sync window so a streamed metadata
    // title cannot replace the localized login title after hydration.
    const titleSyncs = [0, 50, 250, 1000].map((delay) =>
      window.setTimeout(applyTitle, delay),
    );
    window.addEventListener("load", applyTitle, { once: true });

    return () => {
      for (const titleSync of titleSyncs) {
        window.clearTimeout(titleSync);
      }
      window.removeEventListener("load", applyTitle);
    };
  }, [language]);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

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

  function changeLanguage(nextLanguage: LanguageMode): void {
    setLanguage(nextLanguage);
    saveLanguageMode(nextLanguage);
    applyLanguageMode(nextLanguage);
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <header className="login-panel-header">
          <div className="login-brand">
            <span className="login-brand-mark" aria-hidden="true">
              <Image alt="" height={96} priority src="/brand/logo.png" width={96} />
            </span>
            <div>
              <span>ArkiWatch</span>
              <h1 id="login-title">{tKey("auth.adminSignIn")}</h1>
            </div>
          </div>
          <div className="login-language" aria-label={tKey("shell.displayLanguage")} role="group">
            {(["en", "zh"] as const).map((option) => (
              <button
                aria-pressed={language === option}
                className={language === option ? "is-active" : ""}
                key={option}
                onClick={() => changeLanguage(option)}
                type="button"
              >
                {option === "en" ? "EN" : "中文"}
              </button>
            ))}
          </div>
        </header>

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
            <p className="login-error" ref={errorRef} role="alert" tabIndex={-1}>
              {error}
            </p>
          ) : null}

          <button className="login-submit" disabled={isSubmitting} type="submit">
            <span>{isSubmitting ? tKey("auth.signingIn") : tKey("auth.signIn")}</span>
          </button>
          <Link className="login-secondary" href="/">
            {tKey("auth.continueAsDemo")}
          </Link>
        </form>
        <p className="login-note">{tKey("auth.adminBoundary")}</p>
      </section>
    </main>
  );
}
