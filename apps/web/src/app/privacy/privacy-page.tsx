"use client";

import Link from "next/link";

import { useDocumentTitle } from "@/features/shared/use-document-title";
import { PageLanguageToggle, usePageLanguage } from "@/features/shared/page-language";

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
      "The deterministic demo uses local fixtures and does not require an account, PostgreSQL, API keys, or live feed collection. Map views can still load external tiles, including in the demo.",
    ],
    servicesTitle: "External services and browser storage",
    services: [
      "When a model API key is configured, the assistant sends submitted conversation messages and snapshot context to the configured provider (DeepSeek by default). On-demand translation sends the requested text and context there too. The provider’s terms and retention apply. Without a key, answers are generated locally and provider text is left untranslated; recommendation rules do not call a model.",
      "Telegram is optional. Enabling it sends configured recommendation or public-broadcast text to the Telegram API. Signal feeds are collected server-side, while coordinate maps load OpenStreetMap tiles in your browser, sending your IP address and viewed map area to the tile service.",
      "Sign-in uses an HttpOnly session cookie. Language, theme, selected city, and read-event state can persist in browser local storage, separately from saved account records.",
    ],
    retentionTitle: "Retention defaults",
    retention:
      "When data retention is enabled, raw observations default to 90 days and normalized events to 365 days. Scheduler-run cleanup (90 days) and Telegram webhook-record cleanup (30 days) run independently with the snapshot scheduler. These settings do not define automatic deletion periods for account profiles, saved locations, snapshots, or backups; the operator must describe its own retention and deletion process.",
    operatorTitle: "Operator responsibilities",
    operator:
      "Use strong, unique values for authentication, database, metrics, provider, and Telegram secrets. Protect production API and documentation paths at the edge, secure backups, rotate credentials after suspected exposure, and never commit environment files or production data.",
    footer: "ArkiWatch",
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
      "确定性演示使用本地数据，不需要账户、PostgreSQL、API key 或实时数据采集。地图页面仍可能加载外部地图瓦片，演示模式也不例外。",
    ],
    servicesTitle: "外部服务与浏览器存储",
    services: [
      "配置模型 API key 后，助手会把提交的对话消息和快照上下文发送给配置的服务商（默认为 DeepSeek）。按需翻译也会向该服务商发送待翻译文本和上下文，并适用服务商的数据条款与保留规则。未配置 key 时，回答在本地生成，供应商文本保持原文；生成建议的规则不调用模型。",
      "Telegram 是可选功能，启用后会将配置的建议或公共播报文本发送给 Telegram API。信号数据在服务端采集；坐标地图则由浏览器直接加载 OpenStreetMap 瓦片，将 IP 地址和浏览区域发送给地图服务。",
      "登录使用 HttpOnly 会话 cookie。语言、主题、所选城市和事件已读状态可保存在浏览器本地存储中，与账户保存的数据分开。",
    ],
    retentionTitle: "默认保留期限",
    retention:
      "启用数据保留清理后，原始观测默认保留 90 天，标准化事件保留 365 天。调度运行记录（90 天）和 Telegram webhook 记录（30 天）的清理不依赖该开关，由快照调度任务执行。这些设置不规定账户资料、保存的位置、快照或备份的自动删除期限；运营者需要说明其部署的保留与删除流程。",
    operatorTitle: "运营者责任",
    operator:
      "请为认证、数据库、指标、供应商和 Telegram secret 使用强度足够且彼此不同的值；在边缘层保护生产 API 与文档路径，保护备份，在怀疑泄露后轮换凭据，并且不要提交环境文件或生产数据。",
    footer: "ArkiWatch",
    back: "返回数据平台",
  },
} as const;

export default function PrivacyPage() {
  const [language, changeLanguage] = usePageLanguage();
  const copy = COPY[language];


  useDocumentTitle(copy.documentTitle);


  return (
    <main className="privacy-page">
      <div className="privacy-shell">
        <header className="privacy-nav">
          <Link className="privacy-brand" href="/" aria-label={copy.homeLabel}>
            <strong>ArkiWatch</strong>
          </Link>
          <div className="privacy-nav-actions">
            <PageLanguageToggle
              className="privacy-language"
              label={copy.language}
              language={language}
              onChange={changeLanguage}
            />
            <Link className="privacy-back-link" href="/about">
              {copy.about} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </header>

        <article className="privacy-content">
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
            <h2>{copy.servicesTitle}</h2>
            {copy.services.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
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
