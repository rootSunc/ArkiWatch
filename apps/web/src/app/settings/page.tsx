import type { Metadata } from "next";

import { requireSession } from "@/features/auth/session";
import { PersonalSettingsPage } from "@/features/data-platform/personal-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Personal setup | ArkiWatch",
};

export default async function SettingsPage() {
  const session = await requireSession();
  return <PersonalSettingsPage user={session.user} />;
}
