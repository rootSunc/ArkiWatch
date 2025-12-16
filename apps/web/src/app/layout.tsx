import type { Metadata } from "next";
import { ReactNode } from "react";

import { appEnv } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: `${appEnv.appName} | Helsinki/Uusimaa Daily Guidance`,
  description:
    "Public daily guidance for commute, outdoor conditions, home air, and flexible electricity timing."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
