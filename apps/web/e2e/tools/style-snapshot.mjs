/**
 * Records the computed styling of every rendered element across the product's
 * routes, themes, and languages. Two snapshots taken around a stylesheet change
 * must be identical: that is what makes a cascade refactor verifiable instead
 * of a guess.
 *
 *   node e2e/tools/style-snapshot.mjs <output.json>
 *
 * Expects a server already running on BASE_URL (default http://127.0.0.1:3100).
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUTPUT = process.argv[2] ?? "style-snapshot.json";

const DEFAULT_ROUTES = [
  "/plan",
  "/?view=sources",
  "/?view=today",
  "/?view=overview",
  "/?view=weather",
  "/?view=air",
  "/?view=energy",
  "/?view=mobility",
  "/?view=water",
  "/?view=events",
  "/?view=city_services",
  "/?view=geospatial",
  "/?view=regional_profile",
  "/?view=overview&date=2026-08-08",
  "/about",
  "/privacy",
  "/login",
  "/settings",
  "/no-such-route",
];

const ROUTES = process.env.SNAPSHOT_ROUTES ? JSON.parse(process.env.SNAPSHOT_ROUTES) : DEFAULT_ROUTES;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const MODES = [
  { theme: "light", language: "en" },
  { theme: "dark", language: "en" },
  { theme: "light", language: "zh" },
];

/** Properties that carry the visual design. Layout metrics are included so a
 *  cascade change that silently drops a rule shows up as a size difference. */
const PROPERTIES = [
  "background-color", "border-bottom-color", "border-bottom-left-radius",
  "border-bottom-style", "border-bottom-width", "border-left-color",
  "border-left-style", "border-left-width", "border-right-color",
  "border-right-style", "border-right-width", "border-top-color",
  "border-top-left-radius", "border-top-right-radius", "border-top-style",
  "border-top-width", "box-shadow", "color", "column-gap", "display",
  "flex-basis", "flex-direction", "flex-grow", "flex-shrink", "font-family",
  "font-size", "font-style", "font-weight", "gap", "grid-template-columns",
  "height", "justify-content", "align-items", "letter-spacing", "line-height",
  "margin-bottom", "margin-left", "margin-right", "margin-top", "max-width",
  "min-height", "min-width", "opacity", "outline-color", "outline-width",
  "overflow-x", "overflow-y", "padding-bottom", "padding-left", "padding-right",
  "padding-top", "position", "row-gap", "text-align", "text-decoration-line",
  "text-transform", "visibility", "white-space", "width", "z-index",
];

/** Every design token the stylesheets define, read back as the browser
 *  resolves it. This is the authority on a token's effective value. */
const TOKEN_NAMES = process.env.TOKEN_NAMES ? process.env.TOKEN_NAMES.split(",") : [];

async function capture(page, properties, tokenNames) {
  return page.evaluate(
    ({ properties, tokenNames }) => {
      const rootStyle = getComputedStyle(document.documentElement);
      const tokens = {};
      for (const name of tokenNames) {
        tokens[name] = rootStyle.getPropertyValue(name).trim();
      }

      /** Stable address for an element: tag plus sibling index, root to node.
       *  Class names are deliberately excluded so a renamed class does not
       *  masquerade as a styling change. */
      const addressOf = (element) => {
        const segments = [];
        for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
          const siblings = node.parentElement
            ? [...node.parentElement.children].filter(
                (sibling) => !["SCRIPT", "STYLE", "LINK", "META", "TITLE", "NOSCRIPT"].includes(sibling.tagName),
              )
            : [node];
          segments.unshift(`${node.tagName.toLowerCase()}[${siblings.indexOf(node)}]`);
        }
        return segments.join("/");
      };

      /** Next injects head elements into the body in a non-stable order, and
       *  Leaflet appends tiles as they arrive. Neither carries product styling,
       *  and both would make an otherwise identical run look like a diff. */
      const NON_VISUAL = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "NOSCRIPT"]);
      const isVolatile = (element) =>
        NON_VISUAL.has(element.tagName) ||
        element.closest(".leaflet-container") !== null ||
        element.closest("[class*='map-frame']") !== null;

      const elements = {};
      for (const element of document.body.querySelectorAll("*")) {
        if (isVolatile(element)) {
          continue;
        }
        const style = getComputedStyle(element);
        const record = {};
        for (const property of properties) {
          record[property] = style.getPropertyValue(property);
        }
        elements[addressOf(element)] = record;
      }

      return { tokens, elements };
    },
    { properties, tokenNames },
  );
}

const browser = await chromium.launch();
const snapshot = {};

for (const viewport of VIEWPORTS) {
  for (const mode of MODES) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ theme, language }) => {
        window.localStorage.setItem("arkiwatch-theme", theme);
        window.localStorage.setItem("arkiwatch-language", language);
      },
      mode,
    );

    for (const route of ROUTES) {
      const key = `${viewport.name}|${mode.theme}|${mode.language}|${route}`;
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
      // Let lazily-loaded workspace panels settle before reading their styles.
      await page.waitForTimeout(600);
      snapshot[key] = await capture(page, PROPERTIES, TOKEN_NAMES);
      process.stderr.write(`${key} -> ${Object.keys(snapshot[key].elements).length} elements\n`);
    }

    await context.close();
  }
}

await browser.close();
writeFileSync(OUTPUT, JSON.stringify(snapshot, null, 2));
process.stderr.write(`\nwrote ${OUTPUT}\n`);
