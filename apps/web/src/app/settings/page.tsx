import type { Metadata } from "next";

import { metadataText } from "@/features/data-platform/server-metadata";
import { requestLanguage } from "@/features/data-platform/server-language";
import { requireSession } from "@/features/auth/session";
import { PersonalSettingsPage } from "@/features/data-platform/personal-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: metadataText(await requestLanguage(), "settingsDocumentTitle") };
}

export default async function SettingsPage() {
  await requireSession();
  return <PersonalSettingsPage />;
}
