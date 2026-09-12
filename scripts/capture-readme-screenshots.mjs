import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const require = createRequire(path.resolve(import.meta.dirname, "../apps/web/package.json"));
const { chromium } = require("@playwright/test");

const baseURL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const outDir = path.resolve(import.meta.dirname, "../apps/web/public/screenshots");

const hideChrome = `
  nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay] {
    display: none !important;
  }
`;

async function waitForWorkspace(page, heading) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator(".data-platform-shell, .life-assistant, main").first().waitFor({ timeout: 20_000 });
  if (heading) {
    await page.getByRole("heading", { name: heading }).first().waitFor({ timeout: 20_000 });
  }
  await page.waitForTimeout(800);
}

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({
    path: file,
    type: "jpeg",
    quality: 82,
    animations: "disabled",
  });
  console.log(`wrote ${file}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: "en-US",
});

await mkdir(outDir, { recursive: true });

await page.goto(`${baseURL}/?view=today&city=helsinki`, { waitUntil: "domcontentloaded" });
await page.addStyleTag({ content: hideChrome });
await waitForWorkspace(page, "Leave a few minutes earlier");
await shot(page, "today-workspace-en.jpg");

// The launcher moved into the top bar during the minimal refactor; the old
// .assistant-launcher class no longer exists.
const launcher = page.locator(".topbar-assistant");
await launcher.click();
const suggested = page.getByRole("button", { name: "What should I pay attention to today?" });
await suggested.waitFor({ timeout: 10_000 });
await suggested.click();
await page.locator(".assistant-message, [data-role='assistant']").last().waitFor({ timeout: 15_000 }).catch(async () => {
  await page.getByText(/16 °C|outdoor|electricity|decision cards/i).first().waitFor({ timeout: 15_000 });
});
await page.waitForTimeout(600);
await shot(page, "assistant-chat-en.jpg");

await page.goto(`${baseURL}/?view=overview&city=helsinki`, { waitUntil: "domcontentloaded" });
await page.addStyleTag({ content: hideChrome });
await waitForWorkspace(page, "Signal observatory");
await shot(page, "data-platform-overview-en.jpg");

await page.goto(`${baseURL}/?view=weather&city=helsinki`, { waitUntil: "domcontentloaded" });
await page.addStyleTag({ content: hideChrome });
await waitForWorkspace(page);
await page.getByText(/Meteorological|CURRENT CONDITION|FMI/i).first().waitFor({ timeout: 20_000 });
await page.waitForTimeout(400);
await shot(page, "weather-workspace-en.jpg");

await browser.close();
