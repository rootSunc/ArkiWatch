"use client";

import Link from "next/link";
import { useState } from "react";

import { useDocumentTitle } from "@/features/shared/use-document-title";
import {
  applyLanguageMode,
  preferredLanguageMode,
  saveLanguageMode,
  storedLanguageMode,
  useIsomorphicLayoutEffect,
  type LanguageMode,
} from "@/features/data-platform/i18n";

import "./privacy.css";

const COPY = {
  en: {
    documentTitle: "Privacy and data boundary | ArkiWatch",
    homeLabel: "ArkiWatch home",
    brandDescriptor: "PUBLIC DATA / PRIVACY",
    about: "About ArkiWatch",
    language: "Language",
    eyebrow: "ArkiWatch / privacy",
    title: "Privacy and data boundary",
    intro:
      "ArkiWatch combines public data feeds with optional personal configuration. This page describes the default boundary for a self-hosted deployment; the deployment operator remains responsible for its database, credentials, backups, logs, and enabled third-party services.",
    storageTitle: "What the live application can store",
    storageItems: [
      "Account identity and authentication metadata.",
      "Saved locations and commute profiles.",
      "Notification preferences and Telegram channel identifiers.",
      "Recommendations, delivery status, and operational job history.",
      "Raw provider payloads, normalized events, snapshots, and source-health metadata.",
    ],
    boundariesTitle: "Data boundaries",
    boundaries: [
      "Personal routes require a bearer token and are scoped to the authenticated user. Public platform and source-data routes expose public/provider data and provenance, not personal records.",
      "The deterministic demo uses local fixtures and does not require an account, PostgreSQL, API keys, or external provider calls. Telegram is optional; enabling it sends configured recommendation or public-broadcast text to the Telegram API.",
    ],
    retentionTitle: "Retention defaults",
    retention:
      "When retention cleanup is enabled, raw observations default to 90 days, normalized events to 365 days, scheduler runs to 90 days, and Telegram webhook idempotency records to 30 days. Operators should adjust those settings for their legal and operational requirements and test backups before shortening a policy.",
    operatorTitle: "Operator responsibilities",
    operator:
      "Use strong, unique values for authentication, database, metrics, provider, and Telegram secrets. Protect production API and documentation paths at the edge, secure backups, rotate credentials after suspected exposure, and never commit environment files or production data.",
    footer: "ArkiWatch · Finnish public data, made practical.",
    back: "Back to the data platform",
  },
  zh: {
    documentTitle: "隐私与数据边界 | ArkiWatch",
    homeLabel: "ArkiWatch 主页",
    brandDescriptor: "公共数据 / 隐私说明",
    about: "关于 ArkiWatch",
    language: "语言",
    eyebrow: "ArkiWatch / 隐私说明",
    title: "隐私与数据边界",
    intro:
      "ArkiWatch 将公共数据流与可选的个人配置结合起来。本页描述自托管部署的默认边界；部署运营者仍负责数据库、凭据、备份、日志以及启用的第三方服务。",
    storageTitle: "实时应用可能保存的内容",
    storageItems: [
      "账户身份与认证元数据。",
      "保存的位置与通勤配置。",
      "通知偏好与 Telegram 频道标识。",
      "建议、通知投递状态与运营任务历史。",
      "供应商原始数据、标准化事件、快照与来源健康度元数据。",
    ],
    boundariesTitle: "数据边界",
    boundaries: [
      "个人接口需要 bearer token，并限制在已认证用户范围内。公共平台与来源数据接口只公开公共数据、供应商数据及其溯源信息，不公开个人记录。",
      "确定性演示使用本地 fixture，不需要账户、PostgreSQL、API key 或外部供应商调用。Telegram 是可选功能；启用后，会把配置的建议或公共播报文本发送给 Telegram API。",
    ],
    retentionTitle: "默认保留期限",
    retention:
      "启用保留清理后，原始观测默认保留 90 天，标准化事件保留 365 天，调度任务运行记录保留 90 天，Telegram webhook 幂等记录保留 30 天。运营者应根据法律和运营要求调整这些设置，并在缩短策略前测试备份。",
    operatorTitle: "运营者责任",
    operator:
      "请为认证、数据库、指标、供应商和 Telegram secret 使用强度足够且彼此不同的值；在边缘层保护生产 API 与文档路径，保护备份，在怀疑泄露后轮换凭据，并且不要提交环境文件或生产数据。",
    footer: "ArkiWatch · 让芬兰公共数据真正服务日常。",
    back: "返回数据平台",
  },
} as const;

export default function PrivacyPage() {
  const [language, setLanguage] = useState<LanguageMode>("en");
  const copy = COPY[language];

  useIsomorphicLayoutEffect(() => {
    const nextLanguage = storedLanguageMode() ?? preferredLanguageMode();
    setLanguage(nextLanguage);
    applyLanguageMode(nextLanguage);
  }, []);

  useDocumentTitle(copy.documentTitle);

  function changeLanguage(nextLanguage: LanguageMode): void {
    setLanguage(nextLanguage);
    saveLanguageMode(nextLanguage);
    applyLanguageMode(nextLanguage);
  }

  return (
    <main className="privacy-page">
      <div className="privacy-shell">
        <header className="privacy-nav">
          <Link className="privacy-brand" href="/" aria-label={copy.homeLabel}>
            <strong>ArkiWatch</strong>
            <span>{copy.brandDescriptor}</span>
          </Link>
          <div className="privacy-nav-actions">
            <div className="privacy-language" aria-label={copy.language} role="group">
              {(["en", "zh"] as const).map((option) => (
                <button
                  aria-pressed={language === option}
                  className={language === option ? "is-active" : ""}
                  key={option}
                  onClick={() => changeLanguage(option)}
                  type="button"
                >
                  {option === "en" ? "EN" : "中文"}
                </button>
              ))}
            </div>
            <Link className="privacy-back-link" href="/about">
              {copy.about} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </header>

        <article className="privacy-content">
          <p className="privacy-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="privacy-lead">{copy.intro}</p>

          <section>
            <h2>{copy.storageTitle}</h2>
            <ul>
              {copy.storageItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h2>{copy.boundariesTitle}</h2>
            {copy.boundaries.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>

          <section>
            <h2>{copy.retentionTitle}</h2>
            <p>{copy.retention}</p>
          </section>

          <section>
            <h2>{copy.operatorTitle}</h2>
            <p>{copy.operator}</p>
          </section>
        </article>

        <footer className="privacy-footer">
          <span>{copy.footer}</span>
          <Link href="/">{copy.back}</Link>
        </footer>
      </div>
    </main>
  );
}
