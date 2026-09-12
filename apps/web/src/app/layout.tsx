import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { ReactNode } from "react";

import { documentLanguageTag } from "@/features/data-platform/language";
import { metadataText } from "@/features/data-platform/server-metadata";
import { requestLanguage } from "@/features/data-platform/server-language";
import { appEnv } from "@/lib/env";

import "./tokens.css";
import "./globals.css";
import "./material-symbols.css";
import "./minimal-global.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  weight: ["400", "500", "600", "700"],
  display: "swap"
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "700"]
});

export async function generateMetadata(): Promise<Metadata> {
  const language = await requestLanguage();
  const title = metadataText(language, "documentTitle");
  const description = metadataText(language, "documentDescription");

  return {
    metadataBase: new URL(appEnv.appOrigin),
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      images: [{ url: "/og.png", width: 1731, height: 909, alt: "ArkiWatch public-data life assistant" }]
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] }
  };
}

export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

export const dynamic = "force-dynamic";

function runtimeConfigScript(): string {
  const apiBaseUrl =
    process.env.API_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return `window.__ARKIWATCH_RUNTIME_CONFIG__=${JSON.stringify({ apiBaseUrl }).replace(/</g, "\\u003c")};`;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = await requestLanguage();

  return (
    <html
      suppressHydrationWarning
      className="light"
      data-theme="light"
      data-language={language}
      lang={documentLanguageTag(language)}
    >
      <head>
        <script
          id="arkiwatch-runtime-config"
          dangerouslySetInnerHTML={{ __html: runtimeConfigScript() }}
        />
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
      <body className={`${geist.variable} ${jetBrainsMono.variable}`}>{children}</body>
    </html>
  );
}
