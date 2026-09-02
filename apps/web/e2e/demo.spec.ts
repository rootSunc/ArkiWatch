import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("deterministic demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("shows the data platform overview and demo scope by default", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Signal observatory" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("static example data");
    await expect(page.getByRole("combobox", { name: "City" })).toHaveValue("helsinki");
    await expect(page.getByRole("region", { name: "Source health" })).toBeVisible();
    await expect(page.getByRole("button", { name: /9 data sources · 9 healthy/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Leave a few minutes earlier/ }),
    ).toBeVisible();
  });

  test("switches language without losing the selected scope", async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile-chromium") {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    await page.getByRole("button", { name: "中文" }).filter({ visible: true }).first().click();

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("status").first()).toContainText("静态示例");
    await expect(
      page.getByRole("combobox", { name: "城市" }).filter({ visible: true }).first(),
    ).toHaveValue("helsinki");

    await page.getByRole("button", { name: "EN", exact: true }).filter({ visible: true }).first().click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("opens life assistant from the workspace navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only smoke");

    await expect(page.getByRole("heading", { name: "Signal observatory" })).toBeVisible();

    await page
      .getByRole("complementary", { name: "Primary navigation" })
      .getByRole("button", { name: "Today", exact: true })
      .click();

    await expect(page.getByRole("heading", { name: "Leave a few minutes earlier" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review action" })).toBeVisible();
  });

  test("keeps the mobile navigation reachable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only smoke");

    await expect(page.getByRole("contentinfo", { name: "Mobile navigation" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Signal shortcuts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible();
  });

  test("has no automated WCAG A/AA violations on the demo shell", async ({ page }, testInfo) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);

    if (testInfo.project.name === "chromium") {
      await page.evaluate(() => {
        localStorage.setItem("arkiwatch-theme", "dark");
      });
      await page.reload();
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.waitForTimeout(250);

      const darkResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      expect(darkResults.violations).toEqual([]);
    }
  });
});

test("keeps the admin entry point usable without credentials", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Username" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to public data" })).toHaveAttribute("href", "/");
});
