import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ReactNode } from "react";

import { appEnv } from "@/lib/env";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "600", "700", "800", "900"]
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["500", "700"]
});

export const metadata: Metadata = {
  title: `${appEnv.appName} | Unified Data Platform`,
  description:
    "A unified Finland public-data platform for live signals, expansion categories, source health, and AI-assisted data exploration."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className="dark" data-theme="dark" lang="en">
      <body className={`${inter.variable} ${jetBrainsMono.variable}`}>{children}</body>
    </html>
  );
}
