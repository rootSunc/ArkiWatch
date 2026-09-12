import type { Metadata } from "next";

import { metadataText } from "@/features/data-platform/server-metadata";
import { requestLanguage } from "@/features/data-platform/server-language";

import PrivacyPage from "./privacy-page";

export async function generateMetadata(): Promise<Metadata> {
  const language = await requestLanguage();
  return {
    title: metadataText(language, "privacyDocumentTitle"),
    description: metadataText(language, "privacyDocumentDescription"),
  };
}

export default function Page() {
  return <PrivacyPage />;
}
