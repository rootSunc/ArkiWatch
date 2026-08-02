"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  applyLanguageMode,
  preferredLanguageMode,
  saveLanguageMode,
  storedLanguageMode,
  type LanguageMode,
} from "@/features/data-platform/i18n";
import { CITY_PACKS, type CitySignalKey, type CitySignalAvailability } from "@/features/data-platform/city-coverage";
import {
  PROJECT_GITHUB_ISSUES_URL,
  PROJECT_GITHUB_URL,
} from "@/features/shared/project-links";
import { MaterialIcon } from "@/features/shared/material-icon";

import "./about.css";

const COPY = {
  en: {
    language: "Language",
    navData: "Open data platform",
    navDemo: "Try live demo",
    eyebrow: "Open-source public data for Finland",
    heroTitle: "Make everyday decisions with better evidence.",
    heroLead:
      "ArkiWatch turns weather, air, mobility, energy, and city signals into a calm daily brief — then lets you inspect every source behind it.",
    heroPrimary: "Try the Helsinki demo",
    heroSecondary: "View on GitHub",
    heroNote: "Demo data is clearly labelled. Connect the API for live public feeds.",
    proof: [
      ["10+", "public signal families"],
      ["2", "focused workspaces"],
      ["100%", "source-aware answers"],
    ],
    workspaceEyebrow: "One product, two jobs",
    workspaceTitle: "Start with a decision. Keep the evidence.",
    workspaceLead:
      "The interface stays quiet until you need detail. Today helps you decide; Data helps you verify.",
    todayTitle: "Today / life assistant",
    todayLead: "A short, personal brief for the next few hours.",
    todayPoints: ["One focus recommendation", "Plan-aware timeline", "Ask the assistant from the same signal"],
    todayCta: "Open Today",
    dataTitle: "Data / public observatory",
    dataLead: "Structured workspaces for checking freshness, scope, and source evidence.",
    dataPoints: ["Clear source health", "City and date scope", "Evidence before interpretation"],
    dataCta: "Explore the data",
    coverageEyebrow: "Coverage you can see",
    coverageTitle: "Every city has an honest capability map.",
    coverageLead: "Live means the feed is configured; planned means the city is visible but that source pack is not claimed as live yet.",
    coverageRecommendation: "Recommendations",
    coverageColumns: ["Weather", "Air", "Transit", "Water", "City services", "Events"],
    coverageLive: "Live",
    coveragePlanned: "Planned",
    coverageRegional: "Regional",
    flowEyebrow: "Designed for trust",
    flowTitle: "From signal to next step in three moves.",
    flow: [
      ["01", "Choose your scope", "Start with a city and a time window that make sense for your life."],
      ["02", "Inspect the signal", "See what is fresh, what is regional, and what is unavailable before acting."],
      ["03", "Ask for context", "Use the assistant to explain the evidence, with citations that open the source workspace."],
    ],
    ctaEyebrow: "Built in public",
    ctaTitle: "Help make Finnish public data more useful.",
    ctaLead:
      "Star the project, try the demo, or contribute a collector. The architecture is intentionally open so more everyday use cases can be grounded in data.",
    ctaDemo: "Open the demo",
    ctaGithub: "Star on GitHub",
    ctaIssue: "Report a data issue",
    footer: "ArkiWatch · Finnish public data, made practical.",
  },
  zh: {
    language: "语言",
    navData: "打开数据平台",
    navDemo: "体验演示",
    eyebrow: "面向芬兰的开源公共数据",
    heroTitle: "用更可靠的证据，做日常决定。",
    heroLead:
      "ArkiWatch 把天气、空气、出行、能源和城市信号整理成安静清晰的每日简报，也让你随时查看每条结论背后的数据来源。",
    heroPrimary: "体验赫尔辛基演示",
    heroSecondary: "在 GitHub 查看",
    heroNote: "演示数据会明确标注；连接 API 后即可使用实时公共数据。",
    proof: [
      ["10+", "类公共信号"],
      ["2", "个专注工作区"],
      ["100%", "回答带依据"],
    ],
    workspaceEyebrow: "一个产品，两种工作",
    workspaceTitle: "从一个决定开始，把证据留在手边。",
    workspaceLead: "界面只在需要时展开细节：Today 帮你决定，Data 帮你核验。",
    todayTitle: "Today / 生活助手",
    todayLead: "面向接下来几小时的简短、个人化提示。",
    todayPoints: ["一个重点建议", "结合计划的时间线", "从同一条信号直接询问助手"],
    todayCta: "打开 Today",
    dataTitle: "Data / 公共数据观测台",
    dataLead: "用结构化工作区检查数据新鲜度、范围和来源依据。",
    dataPoints: ["清晰的来源健康度", "城市与日期范围", "先看证据，再看解释"],
    dataCta: "探索数据",
    coverageEyebrow: "可见的覆盖范围",
    coverageTitle: "每座城市都有诚实的能力地图。",
    coverageLead: "Live 表示已配置数据流；Planned 表示城市可选择，但该数据源还没有被标记为实时覆盖。",
    coverageRecommendation: "建议范围",
    coverageColumns: ["天气", "空气", "出行", "水文", "城市服务", "活动"],
    coverageLive: "实时",
    coveragePlanned: "规划中",
    coverageRegional: "区域级",
    flowEyebrow: "为信任而设计",
    flowTitle: "三步，从信号走到下一步行动。",
    flow: [
      ["01", "选择范围", "从与你生活相关的城市和时间窗口开始。"],
      ["02", "检查信号", "行动前先看清数据是否新鲜、是否为区域数据、是否暂不可用。"],
      ["03", "询问上下文", "让助手解释证据；回答中的引用可以直接打开来源工作区。"],
    ],
    ctaEyebrow: "开放构建",
    ctaTitle: "一起让芬兰公共数据更有用。",
    ctaLead:
      "欢迎 Star 项目、体验演示或贡献一个数据采集器。架构保持开放，让更多日常场景建立在真实数据之上。",
    ctaDemo: "打开演示",
    ctaGithub: "在 GitHub 点 Star",
    ctaIssue: "报告数据问题",
    footer: "ArkiWatch · 让芬兰公共数据真正服务日常。",
  },
} as const;

const COVERAGE_KEYS: CitySignalKey[] = ["weather", "air", "transit", "water", "city_services", "events"];

function coverageStateLabel(
  state: CitySignalAvailability,
  copy: (typeof COPY)[keyof typeof COPY],
): string {
  return state === "live" ? copy.coverageLive : state === "regional" ? copy.coverageRegional : copy.coveragePlanned;
}

export default function AboutPage() {
  const [language, setLanguage] = useState<LanguageMode>("en");
  const copy = COPY[language];

  useEffect(() => {
    const nextLanguage = storedLanguageMode() ?? preferredLanguageMode();
    setLanguage(nextLanguage);
    applyLanguageMode(nextLanguage);
  }, []);

  function changeLanguage(nextLanguage: LanguageMode): void {
    setLanguage(nextLanguage);
    saveLanguageMode(nextLanguage);
    applyLanguageMode(nextLanguage);
  }

  return (
    <main className="about-page">
      <div className="about-shell">
        <header className="about-nav">
          <Link className="about-brand" href="/" aria-label="ArkiWatch home">
            <Image src="/brand/logo-mark.png" alt="" width={34} height={34} priority />
            <span>
              <strong>ArkiWatch</strong>
              <small>FINLAND / PUBLIC DATA</small>
            </span>
          </Link>
          <nav className="about-nav-actions" aria-label="About navigation">
            <Link className="about-nav-link" href="/?view=overview&city=helsinki">
              {copy.navData}
            </Link>
            <div className="about-language" aria-label={copy.language} role="group">
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
            <Link className="about-nav-cta" href="/?city=helsinki">
              {copy.navDemo}
              <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </Link>
          </nav>
        </header>

        <section className="about-hero">
          <div className="about-hero-copy">
            <p className="about-eyebrow"><span />{copy.eyebrow}</p>
            <h1>{copy.heroTitle}</h1>
            <p className="about-hero-lead">{copy.heroLead}</p>
            <div className="about-hero-actions">
              <Link className="about-button about-button-primary" href="/?city=helsinki">
                {copy.heroPrimary}
                <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
              </Link>
              <a className="about-button about-button-secondary" href={PROJECT_GITHUB_URL} rel="noreferrer" target="_blank">
                {copy.heroSecondary}
                <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>
              </a>
            </div>
            <p className="about-hero-note"><span className="material-symbols-outlined" aria-hidden="true">info</span>{copy.heroNote}</p>
          </div>
          <div className="about-hero-art" aria-label="ArkiWatch workspaces preview">
            <div className="about-art-orbit about-art-orbit-one" />
            <div className="about-art-orbit about-art-orbit-two" />
            <div className="about-art-panel about-art-panel-main">
              <span className="about-art-kicker">TODAY / HELSINKI</span>
              <strong>{language === "zh" ? "适合出门" : "Good window to go out"}</strong>
              <span className="about-art-reading"><b>14°</b><small>· 42% rain</small></span>
              <span className="about-art-line"><i style={{ width: "78%" }} /></span>
              <span className="about-art-foot">{language === "zh" ? "天气 · 空气 · 出行" : "Weather · air · mobility"}</span>
            </div>
            <div className="about-art-panel about-art-panel-source">
              <span className="material-symbols-outlined" aria-hidden="true">check</span>
              <span><strong>{language === "zh" ? "来源已核验" : "Source checked"}</strong><small>FMI · 08:10 EET</small></span>
            </div>
            <div className="about-art-chip"><span className="material-symbols-outlined" aria-hidden="true">info</span>{language === "zh" ? "询问助手" : "Ask the assistant"}</div>
          </div>
        </section>

        <section className="about-proof" aria-label="ArkiWatch at a glance">
          {copy.proof.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </section>

        <section className="about-workspaces">
          <div className="about-section-heading">
            <p className="about-eyebrow"><span />{copy.workspaceEyebrow}</p>
            <h2>{copy.workspaceTitle}</h2>
            <p>{copy.workspaceLead}</p>
          </div>
          <div className="about-workspace-grid">
            <article className="about-workspace-card about-workspace-card-today">
              <div className="about-card-icon"><span className="material-symbols-outlined" aria-hidden="true">calendar_today</span></div>
              <span className="about-card-label">01 / {copy.todayTitle}</span>
              <h3>{copy.todayLead}</h3>
              <ul>{copy.todayPoints.map((point) => <li key={point}><span className="material-symbols-outlined" aria-hidden="true">check</span>{point}</li>)}</ul>
              <Link href="/?city=helsinki" className="about-card-link">{copy.todayCta}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></Link>
            </article>
            <article className="about-workspace-card about-workspace-card-data">
              <div className="about-card-icon"><span className="material-symbols-outlined" aria-hidden="true">monitoring</span></div>
              <span className="about-card-label">02 / {copy.dataTitle}</span>
              <h3>{copy.dataLead}</h3>
              <ul>{copy.dataPoints.map((point) => <li key={point}><span className="material-symbols-outlined" aria-hidden="true">check</span>{point}</li>)}</ul>
              <Link href="/?view=overview&city=helsinki" className="about-card-link">{copy.dataCta}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></Link>
            </article>
          </div>
        </section>

        <section className="about-coverage">
          <div className="about-section-heading">
            <p className="about-eyebrow"><span />{copy.coverageEyebrow}</p>
            <h2>{copy.coverageTitle}</h2>
            <p>{copy.coverageLead}</p>
          </div>
          <div className="about-coverage-scroll">
            <div className="about-coverage-table" role="table" aria-label={copy.coverageTitle}>
              <div className="about-coverage-row about-coverage-header" role="row">
                <span role="columnheader">City</span>
                {copy.coverageColumns.map((column) => <span key={column} role="columnheader">{column}</span>)}
                <span role="columnheader">{copy.coverageRecommendation}</span>
              </div>
              {CITY_PACKS.map((pack) => (
                <div className="about-coverage-row" key={pack.value} role="row">
                  <span className="about-coverage-city" role="cell"><strong>{pack.label}</strong><small>{pack.region}</small></span>
                  {COVERAGE_KEYS.map((key) => (
                    <span className={`about-coverage-state about-coverage-state-${pack.signals[key]}`} key={key} role="cell">
                      <i aria-hidden="true" />{coverageStateLabel(pack.signals[key], copy)}
                    </span>
                  ))}
                  <span className="about-coverage-recommendation" role="cell">
                    {pack.recommendationScope === "regional" ? copy.coverageRegional : copy.coveragePlanned}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="about-flow">
          <div className="about-section-heading">
            <p className="about-eyebrow"><span />{copy.flowEyebrow}</p>
            <h2>{copy.flowTitle}</h2>
          </div>
          <div className="about-flow-grid">
            {copy.flow.map(([number, title, detail]) => (
              <article key={number}><span>{number}</span><h3>{title}</h3><p>{detail}</p></article>
            ))}
          </div>
        </section>

        <section className="about-cta">
          <div><p className="about-eyebrow"><span />{copy.ctaEyebrow}</p><h2>{copy.ctaTitle}</h2><p>{copy.ctaLead}</p></div>
          <div className="about-cta-actions"><Link className="about-button about-button-primary" href="/?city=helsinki">{copy.ctaDemo}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></Link><a className="about-button about-button-secondary" href={PROJECT_GITHUB_URL} rel="noreferrer" target="_blank">{copy.ctaGithub}<span className="material-symbols-outlined" aria-hidden="true">check</span></a><a className="about-button about-button-quiet" href={PROJECT_GITHUB_ISSUES_URL} rel="noreferrer" target="_blank">{copy.ctaIssue}<span className="material-symbols-outlined" aria-hidden="true">info</span></a></div>
        </section>

        <footer className="about-footer"><span>{copy.footer}</span><a href={PROJECT_GITHUB_URL} rel="noreferrer" target="_blank">GitHub <MaterialIcon name="arrow_outward" /></a></footer>
      </div>
    </main>
  );
}
