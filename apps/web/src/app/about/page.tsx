import type { Metadata } from "next";

import AboutPage from "./about-page";

export const metadata: Metadata = {
  title: "About ArkiWatch | Public data. Practical decisions.",
  description:
    "ArkiWatch turns Finnish public signals into transparent, practical daily guidance.",
};

export default function Page() {
  return <AboutPage />;
}
