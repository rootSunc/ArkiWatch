import type { Metadata } from "next";
import { ReactNode } from "react";

import { appEnv } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: `${appEnv.appName} | Platform Foundation`,
  description: "Finland life data assistant with a typed Next.js shell, Go backend, and data pipeline foundation."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
