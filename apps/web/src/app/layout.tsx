import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { ReactNode } from "react";

import { appEnv } from "@/lib/env";

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning className="light" data-theme="light" lang="en">
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

                  if (window.location.pathname === '/login') {
                    var loginTitle = language === 'zh'
                      ? '管理员登录 | ArkiWatch'
                      : 'Admin sign in | ArkiWatch';
                    var applyLoginTitle = function() {
                      if (window.location.pathname === '/login' && document.title !== loginTitle) {
                        document.title = loginTitle;
                      }
                    };
                    applyLoginTitle();
                    window.addEventListener('load', applyLoginTitle, { once: true });
                    window.setTimeout(applyLoginTitle, 0);
                    window.setTimeout(applyLoginTitle, 250);
                    window.setTimeout(applyLoginTitle, 1000);
                  }
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
