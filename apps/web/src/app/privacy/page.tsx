import type { Metadata } from "next";

import PrivacyPage from "./privacy-page";

export const metadata: Metadata = {
  title: "Privacy and data boundary | ArkiWatch",
  description: "How ArkiWatch separates public signals from optional personal configuration.",
};

export default function Page() {
  return <PrivacyPage />;
}
