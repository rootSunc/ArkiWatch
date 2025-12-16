import type { Metadata } from "next";
import { ReactNode } from "react";

import { appEnv } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: `${appEnv.appName} | Unified Data Platform`,
  description:
    "A unified data platform for weather, air quality, transit, energy, source health, and AI-assisted data exploration."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
