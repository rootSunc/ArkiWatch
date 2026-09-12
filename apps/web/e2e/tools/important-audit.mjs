/**
 * Reports which `!important` declarations actually change what renders.
 *
 * For every element on every route it replays the cascade twice — once as
 * authored, once with `!important` ignored — and records the declarations whose
 * flag decides the winner. Everything it does not report is a flag that only
 * ever competed with itself.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const ROUTES = [
  "/?view=today", "/?view=overview", "/?view=weather", "/?view=air", "/?view=energy",
  "/?view=mobility", "/?view=water", "/?view=events", "/?view=city_services",
  "/?view=geospatial", "/?view=regional_profile", "/about", "/privacy", "/login",
  "/settings", "/no-such-route",
];
const MODES = [
  { theme: "light", language: "en" },
  { theme: "dark", language: "en" },
  { theme: "light", language: "zh" },
];

const browser = await chromium.launch();
const loadBearing = new Set();
const matched = new Set();
const seen = new Set();

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const mode of MODES) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(({ theme, language }) => {
      localStorage.setItem("arkiwatch-theme", theme);
      localStorage.setItem("arkiwatch-language", language);
    }, mode);

    for (const route of ROUTES) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const result = await page.evaluate(() => {
        /** Approximate CSS specificity: [ids, classes/attrs/pseudo-classes, types]. */
        const specificity = (selector) => {
          const ids = (selector.match(/#[\w-]+/g) || []).length;
          const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
          const types = (selector.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
          return ids * 10000 + classes * 100 + types;
        };

        const declarations = [];
        let order = 0;
        const walk = (rules, media) => {
          for (const rule of rules) {
            if (rule.media) { walk(rule.cssRules, rule.conditionText || rule.media.mediaText); continue; }
            if (rule.cssRules && rule.cssRules.length) { walk(rule.cssRules, media); continue; }
            if (!rule.selectorText || !rule.style) continue;
            // A rule inside an unmatched media query never applies here.
            if (media && !window.matchMedia(media).matches) continue;
            order += 1;
            for (const prop of rule.style) {
              const important = rule.style.getPropertyPriority(prop) === "important";
              declarations.push({
                selector: rule.selectorText,
                prop,
                value: rule.style.getPropertyValue(prop),
                important,
                order,
                spec: specificity(rule.selectorText),
              });
            }
          }
        };
        for (const sheet of document.styleSheets) {
          try { walk(sheet.cssRules, null); } catch { /* ignore */ }
        }

        const importantDecls = declarations.filter((d) => d.important);
        const found = new Set();
        // A declaration whose elements are absent right now (`.active`, hover
        // variants) proves nothing; only a rule we actually saw applied can be
        // called redundant.
        const matchedSomewhere = new Set();
        const all = new Set(importantDecls.map((d) => `${d.selector}|${d.prop}`));

        const elements = [document.documentElement, ...document.body.querySelectorAll("*")];
        for (const decl of importantDecls) {
          let matched;
          try { matched = elements.filter((el) => el.matches(decl.selector)); } catch { continue; }
          if (matched.length === 0) continue;
          matchedSomewhere.add(`${decl.selector}|${decl.prop}`);

          // Competitors: any other declaration of the same property that would
          // win if this one lost its flag.
          const rivals = declarations.filter(
            (other) => other !== decl && other.prop === decl.prop &&
              (other.important || other.spec > decl.spec ||
               (other.spec === decl.spec && other.order > decl.order)),
          );
          for (const el of matched) {
            const beats = rivals.some((other) => {
              try { return el.matches(other.selector) && other.value !== decl.value; }
              catch { return false; }
            });
            if (beats) { found.add(`${decl.selector}|${decl.prop}`); break; }
          }
        }
        return { loadBearing: [...found], matched: [...matchedSomewhere], all: [...all] };
      });

      result.loadBearing.forEach((k) => loadBearing.add(k));
      result.matched.forEach((k) => matched.add(k));
      result.all.forEach((k) => seen.add(k));
    }
    await context.close();
  }
}

await browser.close();
const redundant = [...matched].filter((k) => !loadBearing.has(k)).sort();
const unproven = [...seen].filter((k) => !matched.has(k)).sort();
writeFileSync("/tmp/important-audit.json", JSON.stringify({ loadBearing: [...loadBearing].sort(), redundant, unproven }, null, 2));
console.log(`declarations with !important: ${seen.size}`);
console.log(`  load-bearing: ${loadBearing.size}`);
console.log(`  redundant:    ${redundant.length}`);
console.log(`  never applied in any captured state (left alone): ${unproven.length}`);
