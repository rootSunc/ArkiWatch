"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { PageLanguageToggle } from "@/features/shared/page-language";
import { useDocumentTitle } from "@/features/shared/use-document-title";
import {
  applyLanguageMode,
  resolveClientLanguage,
  saveLanguageMode,
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
  // The first render is deterministic for SSR; the saved preference applies
  // after hydration, since navigator and localStorage are client-only.
  const [language, setLanguage] = useState<LanguageMode>("en");
  const tKey = (key: string) => translateMessageKey(language, key);
  const [error, setError] = useState<string | null>(
    sessionExpired ? translateMessageKey("en", "auth.sessionExpired") : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useDocumentTitle(translateMessageKey(language, "shell.loginDocumentTitle"));

  useIsomorphicLayoutEffect(() => {
    const nextLanguage = resolveClientLanguage();
    setLanguage(nextLanguage);
    applyLanguageMode(nextLanguage);
    if (sessionExpired) {
      setError(translateMessageKey(nextLanguage, "auth.sessionExpired"));
    }
  }, [sessionExpired]);

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
          <PageLanguageToggle
            className="login-language"
            label={tKey("shell.displayLanguage")}
            language={language}
            onChange={changeLanguage}
          />
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
