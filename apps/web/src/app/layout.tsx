import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ReactNode } from "react";

import { appEnv } from "@/lib/env";

import "./globals.css";
import "./material-symbols.css";

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
  metadataBase: new URL(appEnv.appOrigin),
  title: `${appEnv.appName} | Public data. Practical decisions.`,
  description:
    "Practical daily guidance for life in Finland, grounded in transparent public data.",
  openGraph: {
    type: "website",
    title: `${appEnv.appName} | Public data. Practical decisions.`,
    description: "Practical daily guidance for life in Finland, grounded in transparent public data.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "ArkiWatch public-data life assistant" }]
  },
  twitter: {
    card: "summary_large_image",
    title: `${appEnv.appName} | Public data. Practical decisions.`,
    description: "Practical daily guidance for life in Finland, grounded in transparent public data.",
    images: ["/og.png"]
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning className="light" data-theme="light" lang="en">
      <head>
        <script
          id="theme-initializer"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('arkiwatch-theme');
                  var theme = stored;
                  if (!theme) {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.className = theme;
                  document.documentElement.setAttribute('data-theme', theme);

                  var storedLanguage = localStorage.getItem('arkiwatch-language');
                  var browserLanguage = (navigator.language || '').toLowerCase();
                  var language = storedLanguage === 'zh' ||
                    (storedLanguage !== 'en' && browserLanguage.indexOf('zh') === 0)
                    ? 'zh'
                    : 'en';
                  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
                  document.documentElement.setAttribute('data-language', language);
                } catch (e) {}
              })();
            `
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetBrainsMono.variable}`}>{children}</body>
    </html>
  );
}
