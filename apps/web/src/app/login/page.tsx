import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { LoginForm } from "@/features/auth/login-form";
import { getCurrentSession } from "@/features/auth/session";

type LoginPageProps = {
  searchParams?: Promise<{
    expired?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Admin sign in | ArkiWatch",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const session = await getCurrentSession();
  if (session) {
    redirect("/");
  }

  return <LoginForm sessionExpired={resolvedSearchParams?.expired === "1"} />;
}
