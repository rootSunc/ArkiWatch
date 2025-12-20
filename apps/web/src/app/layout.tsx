import type { Metadata } from "next";
import { ReactNode } from "react";

import { appEnv } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: `${appEnv.appName} | Unified Data Platform`,
  description:
    "A unified Finland public-data platform for live signals, expansion categories, source health, and AI-assisted data exploration."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
