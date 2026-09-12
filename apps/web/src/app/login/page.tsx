import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { metadataText } from "@/features/data-platform/server-metadata";
import { requestLanguage } from "@/features/data-platform/server-language";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentSession } from "@/features/auth/session";

type LoginPageProps = {
  searchParams?: Promise<{
    expired?: string;
  }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return { title: metadataText(await requestLanguage(), "loginDocumentTitle") };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const session = await getCurrentSession();
  if (session) {
    redirect("/");
  }

  return <LoginForm sessionExpired={resolvedSearchParams?.expired === "1"} />;
}
