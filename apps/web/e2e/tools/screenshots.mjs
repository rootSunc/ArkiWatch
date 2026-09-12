/**
 * Regenerates the README screenshots from a running demo build.
 *
 *   pnpm run build:web && node e2e/tools/screenshots.mjs
 *
 * Expects a server on BASE_URL (default http://127.0.0.1:3100) started with
 * NEXT_PUBLIC_DEMO_MODE=true, so the fixtures are deterministic and every shot
 * shows the same Helsinki snapshot.
 */
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUT_DIR = "public/screenshots";

const SHOTS = [
  { file: "today-workspace-en.jpg", route: "/?view=today" },
  { file: "data-platform-overview-en.jpg", route: "/?view=overview" },
  { file: "weather-workspace-en.jpg", route: "/?view=weather" },
  { file: "assistant-chat-en.jpg", route: "/?view=today", openAssistant: true },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const page = await context.newPage();

await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("arkiwatch-theme", "light");
  localStorage.setItem("arkiwatch-language", "en");
});

for (const shot of SHOTS) {
  await page.goto(`${BASE_URL}${shot.route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  if (shot.openAssistant) {
    await page.getByRole("button", { name: "Open ArkiWatch assistant" }).click();
    await page.getByRole("dialog").waitFor();
    // Ask something, so the shot shows an answer with its citation rather
    // than an empty thread.
    await page.getByRole("button", { name: "What should I pay attention to today?" }).click();
    await page.waitForTimeout(2500);
  }

  await page.screenshot({
    path: `${OUT_DIR}/${shot.file}`,
    type: "jpeg",
    quality: 82,
  });
  process.stderr.write(`${shot.file}\n`);
}

await browser.close();
