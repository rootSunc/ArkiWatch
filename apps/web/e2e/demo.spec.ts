import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("deterministic demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("shows a grounded daily decision and demo scope", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Leave a few minutes earlier" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Static example data");
    await expect(page.getByRole("combobox", { name: "City" })).toHaveValue("helsinki");
    await expect(page.getByRole("button", { name: "Review action" })).toBeVisible();
  });

  test("switches language without losing the selected scope", async ({ page }) => {
    await page.getByRole("button", { name: "中文" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("status")).toContainText("静态示例");
    await expect(page.getByRole("combobox", { name: "城市" })).toHaveValue("helsinki");

    await page.getByRole("button", { name: "EN" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("opens the data observatory from the workspace navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only smoke");

    await page
      .getByRole("button", { name: /Data platform Inspect public signals/ })
      .click();

    await expect(page.getByRole("heading", { name: "Signal observatory" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Source health" })).toBeVisible();
    await expect(page.getByRole("button", { name: /9 data sources · 9 healthy/ })).toBeVisible();
  });

  test("keeps the mobile navigation reachable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only smoke");

    await expect(page.getByRole("contentinfo", { name: "Mobile navigation" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Signal navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Assistant", exact: true })).toBeVisible();
  });

  test("has no automated WCAG A/AA violations on the demo shell", async ({ page }, testInfo) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);

    if (testInfo.project.name === "chromium") {
      const themeToggle = page.getByRole("button", { name: "Switch to night theme" }).first();
      await themeToggle.click();
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
  await expect(page.getByRole("link", { name: "Continue as demo" })).toHaveAttribute("href", "/");
});
