// Public-route and authentication regressions retained through the console migration.
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test("localizes the public about capability table", async ({ page }) => {
  await page.goto("/about", { waitUntil: "networkidle" });
  await expect(page).toHaveTitle("About ArkiWatch");
  const proof = page.getByRole("region", { name: "ArkiWatch at a glance" });
  await expect(proof.getByText("24 / 36", { exact: true })).toBeVisible();
  await expect(
    proof.getByText("supported signal capabilities", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "中文" }).click();
  await expect(page).toHaveTitle("关于 ArkiWatch");
  await expect(
    page.getByRole("columnheader", { name: "城市", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "City", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText(
      "受支持表示这个城市已有数据接入能力，不代表当前部署已配置、已有数据或数据仍然新鲜。请在运行中的工作区查看实际状态。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "关于 ArkiWatch 的导航" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "ArkiWatch 主页" }),
  ).toBeVisible();
  const localizedProof = page.getByRole("region", { name: "ArkiWatch 概览" });
  await expect(
    localizedProof.getByText("24 / 36", { exact: true }),
  ).toBeVisible();
  await expect(
    localizedProof.getByText("项信号能力受支持", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "City", exact: true }),
  ).toBeVisible();
});

test("keeps the public demo CTA label consistent across the about page", async ({
  page,
}) => {
  await page.goto("/about", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("link", { name: "Open the demo", exact: true }),
  ).toHaveCount(3);

  await page.getByRole("button", { name: "中文" }).click();
  await expect(
    page.getByRole("link", { name: "打开演示", exact: true }),
  ).toHaveCount(3);
});

test("keeps the public about capability map keyboard reachable", async ({
  page,
}) => {
  await page.goto("/about", { waitUntil: "networkidle" });

  const coverageMap = page.locator(".about-coverage-scroll");
  await expect(coverageMap).toHaveAttribute("tabindex", "0");
  await expect(coverageMap).toHaveAttribute(
    "aria-describedby",
    "about-coverage-scroll-hint",
  );
  await coverageMap.focus();
  await expect(coverageMap).toBeFocused();

  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
});

test("keeps the about platform link easy to target on desktop", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "desktop-only touch-target audit",
  );

  await page.goto("/about", { waitUntil: "networkidle" });

  const link = page.locator(".about-nav-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveCSS("min-height", "34px");
  await expect(link).toHaveJSProperty("offsetHeight", 34);
});

test("explains the about capability map scroll on narrow screens", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "mobile-only scroll hint audit",
  );

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/about", { waitUntil: "networkidle" });

  await expect(page.locator("#about-coverage-scroll-hint")).toBeVisible();
  await expect(page.locator(".about-coverage-scroll")).toHaveAttribute(
    "aria-describedby",
    "about-coverage-scroll-hint",
  );
  await expect(page.locator("#about-coverage-scroll-hint")).toContainText(
    "Swipe horizontally",
  );

  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator("#about-coverage-scroll-hint")).toContainText(
    "横向滑动",
  );
});

test("explains the about capability map scroll at tablet widths", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "tablet-width scroll hint audit",
  );

  for (const width of [768, 900]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/about", { waitUntil: "networkidle" });

    const coverageMap = page.locator(".about-coverage-scroll");
    await expect(page.locator("#about-coverage-scroll-hint")).toBeVisible();
    await expect
      .poll(() =>
        coverageMap.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      )
      .toEqual({ clientWidth: 640, scrollWidth: 820 });
  }
});

test("keeps the about navigation inside a narrow mobile viewport", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "mobile-only narrow layout audit",
  );

  for (const width of [280, 320, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/about", { waitUntil: "networkidle" });

    const layout = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>(".about-nav");
      const actions = document.querySelector<HTMLElement>(".about-nav-actions");
      const cta = document.querySelector<HTMLElement>(".about-nav-cta");
      const language = document.querySelector<HTMLElement>(".about-language");
      const ctaStyle = cta ? window.getComputedStyle(cta) : null;
      return {
        navRight:
          nav?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        actionsRight:
          actions?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        ctaRight:
          cta?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        ctaScrollWidth: cta?.scrollWidth ?? Number.POSITIVE_INFINITY,
        ctaClientWidth: cta?.clientWidth ?? 0,
        languageScrollWidth: language?.scrollWidth ?? Number.POSITIVE_INFINITY,
        languageClientWidth: language?.clientWidth ?? 0,
        ctaWhiteSpace: ctaStyle?.whiteSpace ?? "",
        viewport: window.innerWidth,
      };
    });
    expect(layout.navRight).toBeLessThanOrEqual(layout.viewport);
    expect(layout.actionsRight).toBeLessThanOrEqual(layout.viewport);
    expect(layout.ctaRight).toBeLessThanOrEqual(layout.viewport);
    expect(layout.ctaScrollWidth).toBeLessThanOrEqual(
      layout.ctaClientWidth + 1,
    );
    expect(layout.languageScrollWidth).toBeLessThanOrEqual(
      layout.languageClientWidth + 1,
    );
    expect(layout.ctaWhiteSpace).toBe("nowrap");

    const languageButtons = await page
      .locator(".about-language button")
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          const style = window.getComputedStyle(button);
          return {
            right: rect.right,
            viewport: window.innerWidth,
            scrollWidth: button.scrollWidth,
            clientWidth: button.clientWidth,
            whiteSpace: style.whiteSpace,
          };
        }),
      );
    for (const button of languageButtons) {
      expect(button.right).toBeLessThanOrEqual(button.viewport);
      expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
      expect(button.whiteSpace).toBe("nowrap");
    }

    const workspaceCardBounds = await page
      .locator(".about-workspace-card")
      .evaluateAll((cards) =>
        cards.map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            viewport: window.innerWidth,
          };
        }),
      );
    for (const card of workspaceCardBounds) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(card.viewport);
    }
  }
});

test("keeps the about header controls easy to tap on narrow screens", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "mobile-only about header touch-target audit",
  );

  for (const language of ["en", "zh"] as const) {
    await page.setViewportSize({ width: 280, height: 740 });
    await page.goto("/about", { waitUntil: "networkidle" });
    if (language === "zh") {
      await page.getByRole("button", { name: "中文" }).click();
    }

    const controls = await page
      .locator(".about-brand, .about-language button")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            isLanguageButton: element.matches(".about-language button"),
            height: rect.height,
            width: rect.width,
            minHeight: Number.parseFloat(
              window.getComputedStyle(element).minHeight,
            ),
            minWidth: Number.parseFloat(
              window.getComputedStyle(element).minWidth,
            ),
          };
        }),
      );

    expect(controls).toHaveLength(3);
    for (const control of controls) {
      expect(control.width).toBeGreaterThanOrEqual(32);
      expect(control.height).toBeGreaterThanOrEqual(32);
      expect(control.minHeight).toBeGreaterThanOrEqual(32);
      if (control.isLanguageButton) {
        expect(control.minWidth).toBeGreaterThanOrEqual(32);
      }
    }
  }
});

test("keeps public text links comfortably tappable on narrow screens", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "mobile-only touch-target audit",
  );

  await page.setViewportSize({ width: 280, height: 740 });
  await page.goto("/", { waitUntil: "networkidle" });

  const overviewWidth = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));

  await page.goto("/about", { waitUntil: "networkidle" });
  const aboutLinkHeights = await page
    .locator(".about-card-link, .about-footer a")
    .evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().height),
    );
  const aboutWidth = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));

  expect(aboutLinkHeights.length).toBeGreaterThan(0);
  for (const height of aboutLinkHeights) {
    expect(height).toBeGreaterThanOrEqual(32);
  }
  expect(overviewWidth.document).toBeLessThanOrEqual(overviewWidth.viewport);
  expect(aboutWidth.document).toBeLessThanOrEqual(aboutWidth.viewport);
});

test("keeps the public about page accessible in dark mode", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "desktop-only theme audit");

  await page.goto("/about", { waitUntil: "networkidle" });
  await setPreference(page, "theme", "dark");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("keeps the admin entry point usable without credentials", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page).toHaveTitle("Admin sign in | ArkiWatch");
  await expect(
    page.getByRole("heading", { name: "Admin sign in" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Username" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to public data" }),
  ).toHaveAttribute("href", "/");
  const englishResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(englishResults.violations).toEqual([]);

  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page).toHaveTitle("管理员登录 | ArkiWatch");
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "用户名" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "密码" })).toBeVisible();
  const chineseResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(chineseResults.violations).toEqual([]);

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page).toHaveTitle("Admin sign in | ArkiWatch");
});

test("keeps the admin title readable at the narrowest phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 280, height: 740 });
  await page.goto("/login", { waitUntil: "networkidle" });

  const titleLayout = await page
    .getByRole("heading", { name: "Admin sign in" })
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        height: rect.height,
        right: rect.right,
        viewport: window.innerWidth,
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });

  expect(titleLayout.height).toBeLessThanOrEqual(titleLayout.lineHeight + 1);
  expect(titleLayout.right).toBeLessThanOrEqual(titleLayout.viewport - 16);

  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();
});

test("keeps public auth and recovery focus indicators visible", async ({
  page,
}) => {
  await page.goto("/login");

  const loginLanguage = page.getByRole("button", { name: "EN", exact: true });
  await loginLanguage.focus();
  await expect(loginLanguage).toHaveCSS("outline-style", "solid");
  await expect(loginLanguage).toHaveCSS("outline-width", "2px");

  const publicLink = page.getByRole("link", { name: "Back to public data" });
  await publicLink.focus();
  await expect(publicLink).toHaveCSS("outline-style", "solid");

  await page.goto("/this-route-does-not-exist");
  const recoveryLanguage = page.getByRole("button", {
    name: "EN",
    exact: true,
  });
  await recoveryLanguage.focus();
  await expect(recoveryLanguage).toHaveCSS("outline-style", "solid");
  await expect(recoveryLanguage).toHaveCSS("outline-width", "2px");
});

test("provides a branded recovery path for unknown routes", async ({
  page,
}) => {
  await page.goto("/this-route-does-not-exist");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to data platform" }),
  ).toHaveAttribute("href", "/?view=overview&city=helsinki");
  await expect(
    page.getByRole("link", { name: "About ArkiWatch" }),
  ).toHaveAttribute("href", "/about");
  const englishResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(englishResults.violations).toEqual([]);

  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page).toHaveTitle("页面不存在 | ArkiWatch");
  await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "返回数据平台" }),
  ).toHaveAttribute("href", "/?view=overview&city=helsinki");
  await expect(
    page.getByRole("link", { name: "关于 ArkiWatch" }),
  ).toHaveAttribute("href", "/about");
  const chineseResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(chineseResults.violations).toEqual([]);
});

test("exposes the privacy boundary from the public product pages", async ({
  page,
}) => {
  await page.goto("/about", { waitUntil: "networkidle" });

  await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveTitle("Privacy and data boundary | ArkiWatch");
  await expect(
    page.getByRole("heading", { name: "Privacy and data boundary" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Data boundaries" }),
  ).toBeVisible();
  await expect(
    page.getByText(/deterministic demo uses local fixtures/),
  ).toBeVisible();

  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page).toHaveTitle("隐私与数据边界 | ArkiWatch");
  await expect(
    page.getByRole("heading", { name: "隐私与数据边界" }),
  ).toBeVisible();
  await expect(page.getByText(/确定性演示使用本地数据/)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("moves focus to the login error after a failed submission", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  const error = page.locator(".login-error");
  await expect(error).toHaveText("Login failed.");
  await expect(error).toBeFocused();
});

test("renders the admin title in the language the request carries", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "arkiwatch-language", value: "zh", url: "http://127.0.0.1:3100" },
  ]);
  await page.goto("/login");

  await expect(page).toHaveTitle("管理员登录 | ArkiWatch");
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();
});

test("adopts a language held only in localStorage on the next load", async ({
  page,
  context,
}) => {
  // A visitor from before the language cookie existed. The interface is
  // localized immediately; the title follows once the seeded cookie reaches
  // the server, because streamed metadata can outrun any client correction.
  await page.addInitScript(() => {
    window.localStorage.setItem("arkiwatch-language", "zh");
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "arkiwatch-language",
    )?.value,
  ).toBe("zh");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page).toHaveTitle("管理员登录 | ArkiWatch");
});

async function setPreference(
  page: Page,
  preference: "language" | "theme",
  value: string,
) {
  await page.evaluate(
    ({ preference, value }) =>
      localStorage.setItem(`arkiwatch-${preference}`, value),
    { preference, value },
  );
}
