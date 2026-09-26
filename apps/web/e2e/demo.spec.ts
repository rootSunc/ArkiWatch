import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const recentEventsButtonName = /^Open recent events(?: \(\d+\+?\))?$/;
const todayNavigationButtonName = /^Today(?: \(\d+\+?\))?$/;

test.describe("deterministic demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("shows the data platform overview and demo scope by default", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Signal observatory" })).toBeVisible();
    await expect(page.locator(".demo-mode-banner")).toContainText("static example data");
    await expect(page.getByRole("combobox", { name: "City" })).toHaveValue("helsinki");
    await expect(page.getByRole("region", { name: "Collector status" })).toBeVisible();
    await expect(page.getByRole("button", { name: /9 data sources, 9 recent successful collections/ })).toBeVisible();
    const catalog = page.locator(".overview-catalog");
    await expect(catalog).not.toHaveAttribute("open", "");
    await expect(catalog.locator(".overview-signal-grid-catalog")).not.toBeVisible();
    await catalog.locator("summary").click();
    await expect(catalog).toHaveAttribute("open", "");
    await expect(catalog.locator(".overview-signal-grid-catalog")).toBeVisible();
    await catalog.locator("summary").click();
    await expect(catalog).not.toHaveAttribute("open", "");
    await expect(catalog.locator(".overview-signal-grid-catalog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Leave a few minutes earlier/ }),
    ).toBeVisible();
    await expect(page.locator(".demo-mode-banner-link")).toHaveText("About ArkiWatch →");
    await expect(page.locator(".demo-mode-banner-link")).toHaveAttribute("href", "/about");
  });

  test("keeps Helsinki capability separate from collection and data", async ({ page }) => {
    await page.goto("/about", { waitUntil: "networkidle" });
    const helsinki = page.locator(".about-coverage-row").filter({ has: page.locator(".about-coverage-city strong", { hasText: "Helsinki" }) });
    await expect(helsinki.getByRole("cell", { name: "Supported" })).toHaveCount(6);
    await expect(page.locator(".about-coverage .about-section-heading p")).toContainText(
      "does not confirm a configured feed, available reading, or fresh data",
    );

    await page.goto("/?view=overview&city=helsinki", { waitUntil: "networkidle" });
    const collector = page.getByRole("region", { name: "Collector status" });
    await collector.getByRole("button").click();
    await expect(collector.getByText("Recent collection succeeded").first()).toBeVisible();
    await expect(page.locator(".demo-mode-banner")).toContainText("static example data");
  });

  test("explains an unavailable overview scope without confusing it with a search miss", async ({ page }, testInfo) => {
    const width = testInfo.project.name === "mobile-chromium" ? 280 : 1440;
    await page.setViewportSize({ width, height: 740 });

    for (const language of ["en", "zh"] as const) {
      await setPreference(page, "language", language);
      await page.goto("/?view=overview&city=tampere", { waitUntil: "networkidle" });

      const empty = page.locator(".dashboard-empty-state-rich");
      await expect(empty).toHaveCount(1);
      await expect(empty).toContainText(
        language === "en" ? "No usable signal data for this scope." : "当前范围暂无可用的信号数据。",
      );
      await expect(empty).toContainText(
        language === "en"
          ? "Sources may be missing, stale, or outside the selected city and date."
          : "数据可能缺失、过期，或不属于所选城市与日期。",
      );

      const layout = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        height: document.querySelector<HTMLElement>(".dashboard-empty-state-rich")?.getBoundingClientRect().height ?? 0,
      }));
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.height).toBeGreaterThanOrEqual(126);
    }

    await setPreference(page, "language", "en");
    await page.goto("/?view=overview", { waitUntil: "networkidle" });
    await page.locator("#overview-signal-search").fill("does-not-match");
    await expect(page.locator(".dashboard-empty-state-rich")).toHaveCount(0);
    await expect(page.locator(".dashboard-empty-state")).toHaveText(
      "No signal cards match the current search.",
    );
  });

  test("returns focus to the overview search after clearing a query", async ({ page }) => {
    const search = page.locator("#overview-signal-search");

    await search.fill("weather");
    await page.getByRole("button", { name: "Clear search" }).click();

    await expect(search).toBeFocused();
  });

  test("keeps a page heading when a direct workspace has no scoped data", async ({ page }) => {
    for (const path of [
      "/?view=today&date=2026-08-07",
      "/?view=weather&date=2026-08-07",
      "/?view=air&date=2026-08-07",
      "/?view=energy&date=2026-08-07",
    ]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator("main h1")).toBeVisible();

      const violations = await new AxeBuilder({ page }).analyze();
      expect(violations.violations.map((violation) => violation.id)).not.toContain("page-has-heading-one");
    }
  });

  test("keeps the main content anchor unique while a detail view loads", async ({ page }) => {
    await page.goto("/?view=energy", { waitUntil: "domcontentloaded" });

    const observedStates: Array<{ mainAnchorCount: number; skipLinkCount: number }> = [];
    for (const delay of [0, 50, 150, 400]) {
      if (delay > 0) {
        await page.waitForTimeout(delay);
      }
      observedStates.push({
        mainAnchorCount: await page.locator('[id="main-content"]').count(),
        skipLinkCount: await page.locator("a.skip-link").count(),
      });
    }

    expect(Math.max(...observedStates.map(({ mainAnchorCount }) => mainAnchorCount))).toBeLessThanOrEqual(1);
    expect(observedStates.every(({ mainAnchorCount, skipLinkCount }) => mainAnchorCount > 0 || skipLinkCount === 0)).toBe(true);
    await expect(page.locator('[id="main-content"]')).toHaveCount(1);
    await expect(page.locator("a.skip-link")).toHaveAttribute("href", "#main-content");
  });

  test("keeps catalog deep links on their requested workspace during first paint", async ({ page }) => {
    for (const [view, heading] of [
      ["city_services", "City services"],
      ["geospatial", "Geospatial base"],
      ["regional_profile", "Regional profile"],
    ] as const) {
      await page.goto(`/?view=${view}`, { waitUntil: "domcontentloaded" });

      // Read the first available heading instead of waiting for the eventual
      // settled state. This catches a loading-time fallback to Today.
      expect(await page.locator("main h1").first().textContent()).toBe(heading);
    }
  });

  test("keeps the city service field section flat and readable", async ({ page }) => {
    await page.goto("/?view=city_services", { waitUntil: "networkidle" });

    const fieldPanel = page.locator(".city-field-panel");
    await expect(fieldPanel).toBeVisible();
    await expect(fieldPanel).toHaveCSS("border-top-width", "0px");
    await expect(fieldPanel).toHaveCSS("border-radius", "0px");
    await expect(fieldPanel).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    const heading = fieldPanel.getByRole("heading", { level: 2, name: "Fields provided by the source" });
    await expect(heading).toBeVisible();
    const layout = await heading.evaluate((element) => {
      const panel = element.closest(".city-field-panel");
      const panelRect = panel?.getBoundingClientRect();
      const headingRect = element.getBoundingClientRect();
      return {
        panelTop: panelRect?.top ?? 0,
        headingTop: headingRect.top,
      };
    });
    expect(layout.headingTop).toBeGreaterThanOrEqual(layout.panelTop);
  });

  test("keeps the first mobile detail headings clear of the fixed navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only fixed-navigation overlap audit");

    for (const check of [
      { route: "/?view=city_services", selector: ".city-field-panel h2", viewports: [390, 280] },
      { route: "/?view=mobility&mobilityTab=transit", selector: ".transit-alert-panel > header h2", viewports: [390, 280, 320] },
    ]) {
      for (const width of check.viewports) {
        await page.setViewportSize({ width, height: 740 });
        await page.goto(check.route, { waitUntil: "networkidle" });

        const heading = page.locator(check.selector);
        const navigation = page.locator(".mobile-bottom-nav");
        await expect(heading).toBeVisible();
        const bounds = await Promise.all([heading.boundingBox(), navigation.boundingBox()]);
        expect(bounds[0]).not.toBeNull();
        expect(bounds[1]).not.toBeNull();
        expect(bounds[0]!.y + bounds[0]!.height).toBeLessThanOrEqual(bounds[1]!.y - 8);
      }
    }
  });

  test("switches language without losing the selected scope", async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile-chromium") {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    await page.getByRole("button", { name: "中文" }).filter({ visible: true }).first().click();
    if (testInfo.project.name === "mobile-chromium") {
      await page.keyboard.press("Escape");
    }

    await expect(page).toHaveTitle("ArkiWatch | 公开数据，服务日常决策");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator(".demo-mode-banner")).toContainText("静态示例");
    await expect(
      page.getByRole("combobox", { name: "城市" }).filter({ visible: true }).first(),
    ).toHaveValue("helsinki");

    if (testInfo.project.name === "mobile-chromium") {
      await page.getByRole("button", { name: "打开导航" }).click();
    }
    await page.getByRole("button", { name: "EN", exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveTitle("ArkiWatch | Public data. Practical decisions.");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("localizes the public about capability table", async ({ page }) => {
    await page.goto("/about", { waitUntil: "networkidle" });
    await expect(page).toHaveTitle("About ArkiWatch | Public data. Practical decisions.");
    const proof = page.getByRole("region", { name: "ArkiWatch at a glance" });
    await expect(proof.getByText("24 / 36", { exact: true })).toBeVisible();
    await expect(proof.getByText("live signal capabilities", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "中文" }).click();
    await expect(page).toHaveTitle("关于 ArkiWatch | 公开数据，服务日常决策");
    await expect(page.getByText("芬兰 / 公共数据", { exact: true })).toBeVisible();
    await expect(page.getByText("FINLAND / PUBLIC DATA", { exact: true })).not.toBeVisible();
    await expect(page.getByRole("columnheader", { name: "城市", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "City", exact: true })).not.toBeVisible();
    await expect(page.getByText("实时表示已配置数据流；规划中表示城市可选择，但该数据源还没有被标记为实时覆盖。", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "关于 ArkiWatch 的导航" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ArkiWatch 主页" })).toBeVisible();
    const localizedProof = page.getByRole("region", { name: "ArkiWatch 概览" });
    await expect(localizedProof.getByText("24 / 36", { exact: true })).toBeVisible();
    await expect(localizedProof.getByText("项信号能力已接入", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "EN" }).click();
    await expect(page.getByRole("columnheader", { name: "City", exact: true })).toBeVisible();
  });

  test("keeps the public demo CTA label consistent across the about page", async ({ page }) => {
    await page.goto("/about", { waitUntil: "networkidle" });

    await expect(page.getByRole("link", { name: "Open the demo", exact: true })).toHaveCount(3);

    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.getByRole("link", { name: "打开演示", exact: true })).toHaveCount(3);
  });

  test("opens historical data at the latest available demo month", async ({ page }) => {
    await page.getByRole("button", { name: "Selected date: Today" }).click();

    const calendar = page.getByRole("dialog", { name: "Available historical data" });
    await expect(calendar).toContainText("August 2026");
    await expect(calendar.locator("button:focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Selected date: Today" })).toBeFocused();
    await page.getByRole("button", { name: "Selected date: Today" }).click();
    const historicalDate = calendar.getByRole("button", { name: /08 Aug 2026: 42 records/ });
    await expect(historicalDate).toBeVisible();
    await historicalDate.click();

    const historicalBanner = page.locator(".historical-banner");
    await expect(historicalBanner).toContainText("08 Aug 2026");
    await expect(historicalBanner).not.toContainText("2026-08-08");
  });

  test("keeps both responsive date controls connected to their calendars", async ({ page }) => {
    const brokenReferences = await page.locator(".date-scope-trigger").evaluateAll((buttons) =>
      buttons.flatMap((button) => {
        const targetId = button.getAttribute("aria-controls");
        return targetId && !document.getElementById(targetId) ? [targetId] : [];
      }),
    );

    expect(brokenReferences).toEqual([]);
    await expect(page.locator(".date-calendar-popover")).toHaveCount(2);
    await expect(page.locator(".date-calendar-popover").nth(0)).not.toBeVisible();
    await expect(page.locator(".date-calendar-popover").nth(1)).not.toBeVisible();

    await page.getByRole("button", { name: "Selected date: Today" }).click();
    await expect(page.getByRole("dialog", { name: "Available historical data" })).toBeVisible();
  });

  test("keeps the historical date calendar inside a narrow mobile viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only narrow layout audit");

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Selected date: Today" }).click();

    const bounds = await page.getByRole("dialog", { name: "Available historical data" }).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
  });

  test("keeps the share action reachable and reports a successful copy", async ({ page }) => {
    const shareButton = page
      .getByRole("button", { name: "Copy view link" })
      .filter({ visible: true })
      .first();
    await expect(shareButton).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.resolve() },
      });
    });

    await shareButton.click();
    await expect(
      page.getByRole("button", { name: "Link copied" }).filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test("keeps filled-control labels readable in the dark theme", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only contrast audit");

    await setPreference(page, "theme", "dark");
    await page.reload({ waitUntil: "networkidle" });

    // The badge paints on --red, which is a light pink in the dark theme. A
    // label hard-coded to white here renders at about 1.8:1.
    const contrast = await page.locator(".notification-badge").first().evaluate((element) => {
      const channel = (value: number) => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (colour: string) => {
        const [r, g, b] = colour.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const style = getComputedStyle(element);
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      const [high, low] = foreground > background ? [foreground, background] : [background, foreground];
      return (high + 0.05) / (low + 0.05);
    });

    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  test("switches the desktop theme through the visible control", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only theme control audit");

    await setPreference(page, "theme", "light");
    await page.reload({ waitUntil: "networkidle" });
    const themeButton = page.getByRole("button", { name: "Switch to night theme" });
    await expect(themeButton).toBeVisible();

    await themeButton.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("button", { name: "Switch to day theme" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Switch to day theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("switches the mobile theme from navigation preferences", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only theme control audit");

    await setPreference(page, "theme", "light");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open navigation" }).click();

    const navigation = page.getByRole("dialog", { name: "Primary navigation" });
    await expect(navigation).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".dashboard-app")).toHaveAttribute("aria-hidden", "true");
    await expect.poll(() =>
      page.locator(".dashboard-app").evaluate((element) => (element as HTMLElement).inert),
    ).toBe(true);
    const themeButton = navigation.getByRole("button", { name: "Switch to night theme" });
    await expect(themeButton).toBeVisible();

    await themeButton.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      navigation.getByRole("button", { name: "Switch to day theme" }),
    ).toBeVisible();

    await navigation.getByRole("button", { name: "Switch to day theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
    await expect(page.locator(".dashboard-app")).not.toHaveAttribute("aria-hidden", "true");
    await expect.poll(() =>
      page.locator(".dashboard-app").evaluate((element) => (element as HTMLElement).inert),
    ).toBe(false);
  });

  test("keeps filter states theme-safe in the dark theme", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only theme contrast audit");

    await setPreference(page, "theme", "dark");

    for (const [route, selector] of [
      ["/?view=mobility&mobilityTab=transit", ".transit-filter-chip-active"],
      ["/?view=mobility&mobilityTab=traffic", ".road-rail-filter-chip-active"],
      ["/?view=events", ".linked-events-filter-active"],
    ] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      const activeFilter = page.locator(selector).first();
      await expect(activeFilter).toHaveCount(1);

      const colors = await activeFilter.evaluate((element) => {
        const control = getComputedStyle(element);
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--btn-fill)";
        probe.style.color = "var(--btn-label)";
        document.body.appendChild(probe);
        const expectedBackground = getComputedStyle(probe).backgroundColor;
        const expectedLabel = getComputedStyle(probe).color;
        probe.remove();
        return {
          background: control.backgroundColor,
          border: control.borderTopColor,
          color: control.color,
          expectedBackground,
          expectedLabel,
        };
      });

      expect(colors.background).toBe(colors.expectedBackground);
      expect(colors.border).toBe(colors.expectedBackground);
      expect(colors.color).toBe(colors.expectedLabel);
    }
  });

  test("keeps linked-event filter hover feedback valid in both themes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only hover audit");

    const filter = page.locator(".linked-events-filter:not(.linked-events-filter-active)").first();
    await page.goto("/?view=events", { waitUntil: "networkidle" });

    for (const theme of ["light", "dark"] as const) {
      await setPreference(page, "theme", theme);
      await page.reload({ waitUntil: "networkidle" });
      await expect(filter).toHaveCount(1);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(50);

      const before = await filter.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, border: style.borderTopColor };
      });
      await filter.hover();
      await page.waitForTimeout(300);
      const after = await filter.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, border: style.borderTopColor };
      });

      expect(after.background).not.toBe(before.background);
      expect(after.border).not.toBe(before.border);
    }
  });

  test("does not reuse Helsinki recommendations for an unsupported demo city", async ({ page }) => {
    const citySelector = page
      .getByRole("combobox", { name: "City" })
      .filter({ visible: true })
      .first();

    await citySelector.selectOption("espoo");

    await expect(page.locator(".demo-mode-banner")).toContainText(
      "covers Helsinki / Uusimaa only",
    );
    await expect(
      page.getByRole("button", { name: /Leave a few minutes earlier/ }),
    ).not.toBeVisible();
    await expect(page.getByText("No signal data is available for this scope.")).toBeVisible();

    await citySelector.selectOption("helsinki");
    await expect(
      page.getByRole("button", { name: /Leave a few minutes earlier/ }),
    ).toBeVisible();
  });

  test("does not present live recommendations for an unavailable historical date", async ({ page }) => {
    await page.getByRole("button", { name: "Selected date: Today" }).click();

    const calendar = page.getByRole("dialog", { name: "Available historical data" });
    await calendar.getByRole("button", { name: "07 Aug 2026" }).click();

    await expect(
      page.getByRole("button", { name: /Leave a few minutes earlier/ }),
    ).not.toBeVisible();
    await expect(page.getByText("No signal data is available for this scope.")).toBeVisible();
  });

  test("opens life assistant from the workspace navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only smoke");

    await expect(page.getByRole("heading", { name: "Signal observatory" })).toBeVisible();

    await page
      .getByRole("complementary", { name: "Primary navigation" })
      .getByRole("button", { name: todayNavigationButtonName })
      .click();

    await expect(page.getByRole("heading", { name: "Leave a few minutes earlier" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review action" })).toBeVisible();
  });

  test("preserves workspace navigation in browser history", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only navigation audit");

    const primaryNavigation = page.getByRole("complementary", { name: "Primary navigation" });
    await primaryNavigation.getByRole("button", { name: "Weather", exact: true }).click();
    await expect(page).toHaveURL(/view=weather/);

    await primaryNavigation.getByRole("button", { name: "Weather", exact: true }).click();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      primaryNavigation.getByRole("button", { name: "Signal observatory", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    await primaryNavigation.getByRole("button", { name: "Weather", exact: true }).click();
    await expect(page).toHaveURL(/view=weather/);

    await primaryNavigation.getByRole("button", { name: "Energy", exact: true }).click();
    await expect(page).toHaveURL(/view=energy/);

    await page.goBack();
    await expect(page).toHaveURL(/view=weather/);
    await expect(
      primaryNavigation.getByRole("button", { name: "Weather", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("keeps the desktop workspace navigation intact at short viewport heights", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only short-sidebar audit");

    await page.setViewportSize({ width: 1024, height: 740 });
    await page.goto("/?view=overview", { waitUntil: "networkidle" });

    const primaryNavigation = page.getByRole("complementary", { name: "Primary navigation" });
    await expect(primaryNavigation).toBeVisible();
    await expect(primaryNavigation.getByRole("button", { name: "Water and snow", exact: true })).toBeVisible();
    await expect(primaryNavigation.getByRole("button", { name: "Linked events", exact: true })).toBeVisible();

    const layout = await primaryNavigation.evaluate((navigation) => {
      const workspace = navigation.querySelector<HTMLElement>(".side-nav-list");
      const catalog = navigation.querySelector<HTMLElement>(".side-nav-catalog");
      const workspaceRows = [...navigation.querySelectorAll<HTMLElement>(".side-nav-list .nav-row")];
      if (!workspace || !catalog) {
        return null;
      }
      const workspaceRect = workspace.getBoundingClientRect();
      const catalogRect = catalog.getBoundingClientRect();
      const lastWorkspaceRow = workspaceRows.at(-1)?.getBoundingClientRect();
      return {
        workspaceBottom: workspaceRect.bottom,
        catalogTop: catalogRect.top,
        lastWorkspaceRowBottom: lastWorkspaceRow?.bottom ?? 0,
        railScrollHeight: navigation.scrollHeight,
        railClientHeight: navigation.clientHeight,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.lastWorkspaceRowBottom).toBeLessThanOrEqual(layout!.catalogTop + 1);
    expect(layout!.workspaceBottom).toBeLessThanOrEqual(layout!.catalogTop + 1);
    expect(layout!.railScrollHeight).toBeGreaterThan(layout!.railClientHeight);
  });

  test("resets the mobile workspace scroll on navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only scroll audit");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=geospatial", { waitUntil: "networkidle" });

    const main = page.locator("#main-content");
    await page.waitForFunction(() => {
      const element = document.querySelector("#main-content");
      return Boolean(element && element.scrollHeight > element.clientHeight);
    });
    await main.evaluate((element) => {
      element.scrollTop = 500;
    });
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(500);

    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Energy", exact: true }).click();
    await expect(page).toHaveURL(/view=energy/);
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);
  });

  test("opens a recent mobility event on its matching source record", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only event deep-link audit");

    await page.getByRole("button", { name: recentEventsButtonName }).click();
    await page
      .locator(".timeline-item-content")
      .filter({ hasText: "Allow a few extra minutes" })
      .click();
    await page.getByRole("button", { name: "Open workspace" }).click();

    await expect(page).toHaveURL(/view=mobility.*mobilityTab=transit.*event=demo-alert-4/);
    await expect(page.locator("#platform-event-demo-alert-4")).toHaveClass(
      /transit-alert-selected/,
    );
  });

  test("keeps recent events accessible when expanded and inspected", async ({ page }) => {
    await page.getByRole("button", { name: recentEventsButtonName }).click();

    const expandedResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(expandedResults.violations).toEqual([]);

    await page.locator(".timeline-item-content").first().click();

    const detailResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(detailResults.violations).toEqual([]);
  });

  test("reveals recent events after opening notifications on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only notification reveal audit");

    await page.getByRole("button", { name: recentEventsButtonName }).click();

    const panel = page.locator(".events-panel-expanded");
    await expect(panel).toBeVisible();
    await expect.poll(async () =>
      panel.evaluate((element) => {
        const scroller = element.closest<HTMLElement>(".dashboard-content");
        const panelRect = element.getBoundingClientRect();
        const scrollerRect = scroller?.getBoundingClientRect();
        if (!scrollerRect) {
          return false;
        }
        return panelRect.top >= scrollerRect.top - 1 && panelRect.bottom <= scrollerRect.bottom + 1;
      }),
    ).toBe(true);
  });

  test("returns focus to notifications when the recent events panel collapses", async ({ page }) => {
    const notificationButton = page
      .locator(".notification-button")
      .filter({ visible: true })
      .first();

    await notificationButton.click();
    await page.getByRole("button", { name: "Collapse recent events" }).click();

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
      .toMatch(recentEventsButtonName);
  });

  test("keeps the recent events panel above the mobile navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only event panel layout audit");

    await page.setViewportSize({ width: 280, height: 740 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: recentEventsButtonName }).click();

    const layout = await page.locator(".events-panel-expanded").evaluate((panel) => {
      const panelRect = panel.getBoundingClientRect();
      const footerRect = document.querySelector<HTMLElement>(".mobile-dashboard-footer")?.getBoundingClientRect();
      return {
        panelLeft: panelRect.left,
        panelRight: panelRect.right,
        panelBottom: panelRect.bottom,
        footerTop: footerRect?.top ?? Number.POSITIVE_INFINITY,
        viewport: window.innerWidth,
      };
    });

    expect(layout.panelLeft).toBeGreaterThanOrEqual(0);
    expect(layout.panelRight).toBeLessThanOrEqual(layout.viewport);
    expect(layout.panelBottom).toBeLessThanOrEqual(layout.footerTop);
  });

  test("localizes transit alert enum details", async ({ page }) => {
    await setPreference(page, "language", "zh");
    await page.goto("/?view=mobility&mobilityTab=transit&event=demo-alert-4", {
      waitUntil: "networkidle",
    });

    const detail = page.locator(".transit-alert-detail").first();
    await expect(detail).toContainText("公共交通延误");
    await expect(detail).toContainText("交通拥堵");
    await expect(detail).toContainText("明显延误");
    await expect(detail).not.toContainText(/TRAFFIC JAM|SIGNIFICANT DELAYS|类型 delay/);
  });

  test("keeps transit alert copy readable on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only layout audit");

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/?view=mobility&mobilityTab=transit", { waitUntil: "networkidle" });

    const layout = await page.locator(".transit-alert-card").first().evaluate((element) => {
      const main = element.querySelector<HTMLElement>(".transit-alert-main");
      const title = main?.querySelector<HTMLElement>("strong");
      const description = main?.querySelector<HTMLElement>("p");
      return {
        columnCount: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
        title: title?.textContent,
        titleWidth: title?.clientWidth ?? 0,
        titleScrollWidth: title?.scrollWidth ?? 0,
        descriptionWidth: description?.clientWidth ?? 0,
        descriptionScrollWidth: description?.scrollWidth ?? 0,
      };
    });

    expect(layout.columnCount).toBe(1);
    expect(layout.title).toContain("Westbound tram service is slower");
    expect(layout.titleScrollWidth).toBeLessThanOrEqual(layout.titleWidth + 1);
    expect(layout.descriptionScrollWidth).toBeLessThanOrEqual(layout.descriptionWidth + 1);

    const headerLayout = await page.locator(".transit-alert-panel > header").evaluate((header) => {
      const title = header.querySelector<HTMLElement>("h2");
      const note = header.querySelector<HTMLElement>("strong");
      const headerRect = header.getBoundingClientRect();
      const titleRect = title?.getBoundingClientRect();
      const noteRect = note?.getBoundingClientRect();
      return {
        direction: getComputedStyle(header).flexDirection,
        width: headerRect.width,
        titleRight: titleRect?.right ?? Number.POSITIVE_INFINITY,
        noteRight: noteRect?.right ?? Number.POSITIVE_INFINITY,
        noteTop: noteRect?.top ?? Number.NEGATIVE_INFINITY,
        titleBottom: titleRect?.bottom ?? Number.POSITIVE_INFINITY,
      };
    });

    expect(headerLayout.direction).toBe("column");
    expect(headerLayout.titleRight).toBeLessThanOrEqual(headerLayout.width + 16 + 1);
    expect(headerLayout.noteRight).toBeLessThanOrEqual(headerLayout.width + 16 + 1);
    expect(headerLayout.noteTop).toBeGreaterThanOrEqual(headerLayout.titleBottom - 1);
  });

  test("opens a recent road event on its matching incident record", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only event deep-link audit");

    await page.getByRole("button", { name: recentEventsButtonName }).click();
    await page
      .locator(".timeline-item-content")
      .filter({ hasText: "Road surfaces may be slippery" })
      .click();
    await page.getByRole("button", { name: "Open workspace" }).click();

    await expect(page).toHaveURL(/view=mobility.*mobilityTab=traffic.*event=demo-road-1/);
    await expect(page.locator("#platform-event-demo-road-1")).toHaveClass(
      /road-rail-incident-selected/,
    );
  });

  test("localizes demo road locations", async ({ page }) => {
    await setPreference(page, "language", "zh");
    await page.goto("/?view=mobility&mobilityTab=traffic&event=demo-road-1", {
      waitUntil: "networkidle",
    });

    const main = page.locator("#main-content");
    await expect(main).toContainText("赫尔辛基西向通道");
    await expect(main).toContainText("赫尔辛基西向路段");
    await expect(main).not.toContainText("Helsinki westbound approach");
  });

  test("uses instant event deep-link scrolling when motion is reduced", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const originalScrollIntoView = Element.prototype.scrollIntoView;
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        value: function (options?: ScrollIntoViewOptions) {
          const state = window as Window & {
            __arkiwatchScrollCalls?: Array<ScrollIntoViewOptions | undefined>;
          };
          state.__arkiwatchScrollCalls = [
            ...(state.__arkiwatchScrollCalls ?? []),
            options,
          ];
          return originalScrollIntoView.call(this, options);
        },
      });
    });

    await page.goto("/?view=mobility&mobilityTab=transit&event=demo-alert-4", {
      waitUntil: "networkidle",
    });
    await expect(page.locator("#platform-event-demo-alert-4")).toHaveClass(
      /transit-alert-selected/,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & {
              __arkiwatchScrollCalls?: Array<ScrollIntoViewOptions | undefined>;
            }).__arkiwatchScrollCalls ?? [],
        ),
      )
      .toContainEqual({ behavior: "auto", block: "center" });
  });

  test("clears inline event state when returning from a workspace", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only event-state audit");

    await page.getByRole("button", { name: recentEventsButtonName }).click();
    await page.locator(".timeline-item-content").first().click();
    await expect(page.locator(".event-detail-panel")).toBeVisible();

    await page.getByRole("button", { name: "Open workspace" }).click();
    await expect(page).toHaveURL(/view=/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("button", { name: recentEventsButtonName }).click();

    await expect(page.locator(".event-detail-panel")).toHaveCount(0);
    await expect(page.locator(".timeline-item-selected")).toHaveCount(0);
  });

  test("clears inline event state when the data scope changes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only event-state audit");

    await page.getByRole("button", { name: recentEventsButtonName }).click();
    await page.locator(".timeline-item-content").first().click();
    await expect(page.locator(".event-detail-panel")).toBeVisible();

    const citySelector = page
      .getByRole("combobox", { name: "City" })
      .filter({ visible: true })
      .first();
    await citySelector.selectOption("espoo");
    await expect(page.getByText("No signal data is available for this scope.")).toBeVisible();
    await expect(page.locator(".event-detail-panel")).toHaveCount(0);
  });

  test("keeps the mobile navigation reachable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only smoke");

    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
    await expect(page.getByRole("contentinfo", { name: "Mobile navigation" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Signal shortcuts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible();
  });

  test("keeps the first overview recommendation above the short-screen navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only short viewport audit");

    for (const [width, height] of [
      [390, 600],
      [768, 600],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/?view=overview", { waitUntil: "networkidle" });

      const layout = await page.evaluate(() => {
        const title = document.querySelector<HTMLElement>(".today-digest-strip-copy strong");
        const footer = document.querySelector<HTMLElement>(".mobile-dashboard-footer");
        const titleRect = title?.getBoundingClientRect();
        const footerRect = footer?.getBoundingClientRect();
        return {
          titleBottom: titleRect?.bottom ?? Number.POSITIVE_INFINITY,
          footerTop: footerRect?.top ?? Number.NEGATIVE_INFINITY,
        };
      });

      expect(layout.titleBottom).toBeLessThanOrEqual(layout.footerTop + 1);
    }
  });

  test("keeps the overview search above the shortest mobile navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only short-screen search audit");

    await page.setViewportSize({ width: 280, height: 480 });
    await page.goto("/?view=overview", { waitUntil: "networkidle" });

    const search = page.locator(".overview-search");
    const navigation = page.locator(".mobile-bottom-nav");
    await expect(search).toBeVisible();
    const bounds = await Promise.all([search.boundingBox(), navigation.boundingBox()]);
    expect(bounds[0]).not.toBeNull();
    expect(bounds[1]).not.toBeNull();
    expect(bounds[0]!.y + bounds[0]!.height).toBeLessThanOrEqual(bounds[1]!.y - 8);
  });

  test("keeps short-screen decision controls clear of the fixed navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only short-screen control audit");

    await page.setViewportSize({ width: 280, height: 480 });
    for (const check of [
      { route: "/?view=today", selector: ".today-assistant-action" },
      { route: "/?view=energy", selector: ".energy-tab-list" },
      { route: "/?view=mobility&mobilityTab=transit", selector: ".mobility-tab-list" },
    ]) {
      await page.goto(check.route, { waitUntil: "networkidle" });

      const control = page.locator(check.selector);
      const navigation = page.locator(".mobile-bottom-nav");
      await expect(control).toBeVisible();
      const bounds = await Promise.all([control.boundingBox(), navigation.boundingBox()]);
      expect(bounds[0]).not.toBeNull();
      expect(bounds[1]).not.toBeNull();
      expect(bounds[0]!.y + bounds[0]!.height).toBeLessThanOrEqual(bounds[1]!.y - 8);
    }

    await page.goto("/?view=mobility&mobilityTab=traffic", { waitUntil: "networkidle" });
    const scope = page.locator(".road-rail-scope-tile > strong");
    const scopeLayout = await scope.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(scopeLayout.scrollWidth).toBeLessThanOrEqual(scopeLayout.clientWidth + 1);
  });

  test("keeps viewport-bound layers aligned with the dynamic mobile viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only viewport stability audit");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });

    const shellBounds = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".dashboard-shell");
      const app = document.querySelector<HTMLElement>(".dashboard-app");
      return {
        viewportHeight: window.innerHeight,
        shellHeight: shell?.getBoundingClientRect().height ?? 0,
        appHeight: app?.getBoundingClientRect().height ?? 0,
      };
    });

    expect(Math.abs(shellBounds.shellHeight - shellBounds.viewportHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(shellBounds.appHeight - shellBounds.viewportHeight)).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Open navigation" }).click();
    const backdropBounds = await page.locator(".mobile-side-nav-backdrop").evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }));
    expect(Math.abs(backdropBounds.height - backdropBounds.viewportHeight)).toBeLessThanOrEqual(1);
  });

  test("keeps every mobile shortcut visible at the narrowest width", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only bottom navigation audit");

    await page.setViewportSize({ width: 280, height: 740 });
    for (const language of ["en", "zh"] as const) {
      await setPreference(page, "language", language);
      await page.reload({ waitUntil: "networkidle" });

      const layout = await page.locator(".mobile-bottom-nav").evaluate((element) => {
        const navRect = element.getBoundingClientRect();
        const items = Array.from(element.querySelectorAll<HTMLElement>("button"));
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          itemCount: items.length,
          itemsInside: items.every((item) => {
            const rect = item.getBoundingClientRect();
            return rect.left >= navRect.left - 1 && rect.right <= navRect.right + 1;
          }),
          labelsFit: items.every((item) => {
            const label = item.querySelector<HTMLElement>("span:last-child");
            return label != null && label.scrollWidth <= label.clientWidth + 1;
          }),
        };
      });

      expect(layout.itemCount).toBe(5);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
      expect(layout.itemsInside).toBe(true);
      expect(layout.labelsFit).toBe(true);
    }
  });

  test("keeps the demo notice readable at the narrowest width", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only demo notice audit");

    await page.setViewportSize({ width: 280, height: 740 });
    await page.goto("/?view=overview", { waitUntil: "networkidle" });

    const layout = await page.locator(".demo-mode-banner").evaluate((banner) => {
      const copy = banner.querySelector<HTMLElement>(".demo-mode-banner-copy");
      const link = banner.querySelector<HTMLElement>(".demo-mode-banner-link");
      if (!copy || !link) {
        return null;
      }

      const bannerRect = banner.getBoundingClientRect();
      const copyRect = copy.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      return {
        display: getComputedStyle(banner).display,
        copyWidth: copyRect.width,
        copyBottom: copyRect.bottom,
        linkTop: linkRect.top,
        linkRight: linkRect.right,
        bannerRight: bannerRect.right,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout?.display).toBe("grid");
    expect(layout?.copyWidth).toBeGreaterThanOrEqual(180);
    expect(layout?.linkTop).toBeGreaterThanOrEqual((layout?.copyBottom ?? 0) - 1);
    expect(layout?.linkRight).toBeLessThanOrEqual((layout?.bannerRight ?? 0) + 1);
  });

  test("keeps mobile drawer language controls easy to tap", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only drawer control audit");

    await page.setViewportSize({ width: 280, height: 740 });
    for (const language of ["en", "zh"] as const) {
      await setPreference(page, "language", language);
      await page.reload({ waitUntil: "networkidle" });

      await page
        .getByRole("button", { name: language === "en" ? "Open navigation" : "打开导航" })
        .click();
      const drawer = page.getByRole("dialog", {
        name: language === "en" ? "Primary navigation" : "主导航",
      });
      await expect(drawer).toBeVisible();

      const layout = await drawer.locator(".side-nav-mobile-preferences .language-option").evaluateAll(
        (buttons) =>
          buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return {
              width: rect.width,
              height: rect.height,
              right: rect.right,
              viewport: window.innerWidth,
            };
          }),
      );

      expect(layout).toHaveLength(2);
      for (const button of layout) {
        expect(button.width).toBeGreaterThanOrEqual(36);
        expect(button.height).toBeGreaterThanOrEqual(36);
        expect(button.right).toBeLessThanOrEqual(button.viewport);
      }

      await page.keyboard.press("Escape");
    }
  });

  test("keeps the narrow mobile context labels readable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only context-row audit");

    await page.setViewportSize({ width: 280, height: 740 });
    for (const language of ["en", "zh"] as const) {
      await setPreference(page, "language", language);
      await page.reload({ waitUntil: "networkidle" });

      const layout = await page.locator(".mobile-context-row").evaluate((row) => {
        const dateLabel = row.querySelector<HTMLElement>(".date-scope-value-short");
        return {
          rowWidth: row.clientWidth,
          rowScrollWidth: row.scrollWidth,
          dateWidth: dateLabel?.clientWidth ?? 0,
          dateScrollWidth: dateLabel?.scrollWidth ?? 0,
        };
      });

      expect(layout.rowScrollWidth).toBeLessThanOrEqual(layout.rowWidth + 1);
      expect(layout.dateWidth).toBeGreaterThanOrEqual(layout.dateScrollWidth - 1);
    }
  });

  test("keeps tablet context controls easy to tap", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only tablet context audit");

    for (const width of [641, 768, 1023]) {
      await page.setViewportSize({ width, height: 740 });
      await page.goto("/?view=today", { waitUntil: "networkidle" });

      const controls = await page.locator(
        ".mobile-context-row .city-scope-control, .mobile-context-row .date-scope-trigger",
      ).evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, right: rect.right, viewport: window.innerWidth };
        }),
      );

      expect(controls).toHaveLength(2);
      expect(controls.every(({ height, right, viewport }) => height >= 32 && right <= viewport + 1)).toBe(true);
    }
  });

  test("keeps the overview recommendation detail readable in the compact shell", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only tablet overview audit");

    await page.setViewportSize({ width: 641, height: 844 });
    await page.goto("/?view=overview", { waitUntil: "networkidle" });

    const detail = await page.locator(".today-digest-strip-detail").evaluate((element) => ({
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }));

    expect(detail.whiteSpace).toBe("normal");
    expect(detail.scrollHeight).toBeLessThanOrEqual(detail.clientHeight + 1);
    expect(detail.scrollWidth).toBeLessThanOrEqual(detail.clientWidth + 1);
  });

  test("keeps the mobile city selector easy to tap", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only city selector audit");

    await page.setViewportSize({ width: 280, height: 740 });
    for (const language of ["en", "zh"] as const) {
      await setPreference(page, "language", language);
      await page.reload({ waitUntil: "networkidle" });

      const layout = await page.locator(".mobile-context-row .city-scope-control").evaluate((control) => {
        const controlRect = control.getBoundingClientRect();
        const select = control.querySelector<HTMLSelectElement>("select");
        const selectRect = select?.getBoundingClientRect();
        return {
          controlHeight: controlRect.height,
          selectHeight: selectRect?.height ?? 0,
          selectRight: selectRect?.right ?? Number.POSITIVE_INFINITY,
          viewport: window.innerWidth,
        };
      });

      expect(layout.controlHeight).toBeGreaterThanOrEqual(32);
      expect(layout.selectHeight).toBeGreaterThanOrEqual(32);
      expect(layout.selectRight).toBeLessThanOrEqual(layout.viewport);
    }
  });

  test("keeps mobile date controls easy to tap", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only date control audit");

    await page.setViewportSize({ width: 280, height: 740 });
    for (const language of ["en", "zh"] as const) {
      await setPreference(page, "language", language);
      await page.reload({ waitUntil: "networkidle" });

      const dateControl = page.locator(".mobile-context-row .date-scope-control");
      const triggerLayout = await dateControl.evaluate((control) => {
        const controlRect = control.getBoundingClientRect();
        const trigger = control.querySelector<HTMLButtonElement>(".date-scope-trigger");
        const triggerRect = trigger?.getBoundingClientRect();
        return {
          controlHeight: controlRect.height,
          triggerHeight: triggerRect?.height ?? 0,
          triggerRight: triggerRect?.right ?? Number.POSITIVE_INFINITY,
          viewport: window.innerWidth,
        };
      });
      expect(triggerLayout.controlHeight).toBeGreaterThanOrEqual(32);
      expect(triggerLayout.triggerHeight).toBeGreaterThanOrEqual(32);
      expect(triggerLayout.triggerRight).toBeLessThanOrEqual(triggerLayout.viewport);

      await page.locator(".date-scope-trigger:visible").first().click();
      const calendar = page.locator(".date-calendar-popover:visible").first();
      await expect(calendar).toBeVisible();

      const calendarLayout = await calendar.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const sizes = (selector: string) =>
          Array.from(element.querySelectorAll<HTMLElement>(selector)).map((control) => {
            const controlRect = control.getBoundingClientRect();
            return { width: controlRect.width, height: controlRect.height };
          });
        return {
          left: rect.left,
          right: rect.right,
          viewport: window.innerWidth,
          navigation: sizes(".date-calendar-nav button"),
          days: sizes(".date-calendar-day"),
          actions: sizes(".date-calendar-actions button"),
        };
      });

      expect(calendarLayout.left).toBeGreaterThanOrEqual(0);
      expect(calendarLayout.right).toBeLessThanOrEqual(calendarLayout.viewport);
      expect(calendarLayout.navigation.every(({ width, height }) => width >= 32 && height >= 32)).toBe(true);
      expect(calendarLayout.days.every(({ width, height }) => width >= 32 && height >= 36)).toBe(true);
      expect(calendarLayout.actions.every(({ height }) => height >= 36)).toBe(true);

      await page.keyboard.press("Escape");
    }
  });

  test("keeps short mobile date and assistant actions inside the viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only short overlay audit");

    for (const width of [280, 390] as const) {
      await page.setViewportSize({ width, height: 360 });
      for (const language of ["en", "zh"] as const) {
        await setPreference(page, "language", language);
        await page.goto("/?view=overview", { waitUntil: "networkidle" });

        await page.locator(".date-scope-trigger:visible").first().click();
        const calendar = page.locator(".date-calendar-popover:visible").first();
        await expect(calendar).toBeVisible();
        const calendarLayout = await calendar.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          element.scrollTop = element.scrollHeight;
          const action = element.querySelector<HTMLElement>(".date-calendar-actions button:last-child");
          const actionRect = action?.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            viewport: window.innerHeight,
            overflowY: getComputedStyle(element).overflowY,
            actionTop: actionRect?.top ?? Number.POSITIVE_INFINITY,
            actionBottom: actionRect?.bottom ?? Number.NEGATIVE_INFINITY,
            surfaceTop: rect.top,
            surfaceBottom: rect.bottom,
          };
        });

        expect(calendarLayout.bottom).toBeLessThanOrEqual(calendarLayout.viewport + 1);
        expect(calendarLayout.overflowY).toBe("auto");
        expect(calendarLayout.actionTop).toBeGreaterThanOrEqual(calendarLayout.surfaceTop - 1);
        expect(calendarLayout.actionBottom).toBeLessThanOrEqual(calendarLayout.surfaceBottom + 1);
        await page.keyboard.press("Escape");

        await page.locator(".mobile-bottom-nav-assistant").click();
        const input = page.locator(".assistant-composer-field input");
        await expect(input).toBeVisible();
        const inputLayout = await input.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const suggestions = document.querySelector<HTMLElement>(".assistant-suggestions");
          const note = document.querySelector<HTMLElement>(".assistant-composer-note");
          return {
            bottom: rect.bottom,
            viewport: window.innerHeight,
            suggestionsHeight: suggestions?.getBoundingClientRect().height ?? 0,
            noteDisplay: note ? getComputedStyle(note).display : "none",
          };
        });

        expect(inputLayout.bottom).toBeLessThanOrEqual(inputLayout.viewport + 1);
        expect(inputLayout.suggestionsHeight).toBeLessThanOrEqual(72);
        expect(inputLayout.noteDisplay).toBe("none");
        await page.keyboard.press("Escape");
      }
    }
  });

  test("keeps keyboard focus above the fixed mobile navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only focus-scroll audit");

    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 740 });
      await page.goto("/?view=today", { waitUntil: "networkidle" });

      const timelineButton = page.locator(".day-plan-timeline-button").first();
      let focused = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await page.keyboard.press("Tab");
        if (await timelineButton.evaluate((element) => element === document.activeElement)) {
          focused = true;
          break;
        }
      }

      expect(focused).toBe(true);
      const bounds = await page.evaluate(() => {
        const target = document.querySelector<HTMLElement>(".day-plan-timeline-button");
        const footer = document.querySelector<HTMLElement>(".mobile-dashboard-footer");
        const targetRect = target?.getBoundingClientRect();
        const footerRect = footer?.getBoundingClientRect();
        return {
          targetBottom: targetRect?.bottom ?? Number.POSITIVE_INFINITY,
          footerTop: footerRect?.top ?? Number.NEGATIVE_INFINITY,
        };
      });

      expect(bounds.targetBottom).toBeLessThanOrEqual(bounds.footerTop);
    }
  });

  test("opens the assistant as an accessible reduced-motion dialog", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByRole("heading", { name: "Signal observatory" })).toBeVisible();

    const askButton = page
      .locator(".topbar-assistant, .mobile-bottom-nav-assistant")
      .filter({ visible: true })
      .first();
    await expect(askButton).toBeEnabled();
    await askButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("input").first()).toBeFocused();
    await expect(page.locator(".dashboard-app")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#arkiwatch-mobile-navigation")).toHaveAttribute("aria-hidden", "true");
    await expect.poll(() =>
      page.locator(".dashboard-app").evaluate((element) => (element as HTMLElement).inert),
    ).toBe(true);
    await expect.poll(() =>
      page.locator("#arkiwatch-mobile-navigation").evaluate((element) => (element as HTMLElement).inert),
    ).toBe(true);

    const animatedElements = await page.locator(".assistant-widget-open").evaluate((widget) =>
      [widget, ...Array.from(widget.querySelectorAll<HTMLElement>("*"))].filter((element) => {
        const style = window.getComputedStyle(element);
        return style.animationName !== "none" || style.transitionDuration !== "0s";
      }).length,
    );
    expect(animatedElements).toBe(0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(askButton).toBeFocused();
    await expect(page.locator(".dashboard-app")).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#arkiwatch-mobile-navigation")).not.toHaveAttribute("aria-hidden", "true");
    await expect.poll(() =>
      page.locator(".dashboard-app").evaluate((element) => (element as HTMLElement).inert),
    ).toBe(false);
    await expect.poll(() =>
      page.locator("#arkiwatch-mobile-navigation").evaluate((element) => (element as HTMLElement).inert),
    ).toBe(false);
  });

  test("locks the desktop document while the assistant is open", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only assistant scroll-lock audit");

    await page.evaluate(() => window.scrollTo(0, 420));
    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);
    expect(scrollBeforeOpen).toBeGreaterThan(0);

    await page.locator(".topbar-assistant:visible").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.mouse.wheel(0, 1000);

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBeforeOpen);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("keeps assistant text contrast during its entrance", async ({ page }) => {
    const askButton = page
      .locator(".topbar-assistant, .mobile-bottom-nav-assistant")
      .filter({ visible: true })
      .first();
    await askButton.click();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("keeps the public about capability map keyboard reachable", async ({ page }) => {
    await page.goto("/about", { waitUntil: "networkidle" });

    const coverageMap = page.locator(".about-coverage-scroll");
    await expect(coverageMap).toHaveAttribute("tabindex", "0");
    await expect(coverageMap).toHaveAttribute("aria-describedby", "about-coverage-scroll-hint");
    await coverageMap.focus();
    await expect(coverageMap).toBeFocused();

    const widths = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  });

  test("keeps the about platform link easy to target on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only touch-target audit");

    await page.goto("/about", { waitUntil: "networkidle" });

    const link = page.locator(".about-nav-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveCSS("min-height", "34px");
    await expect(link).toHaveJSProperty("offsetHeight", 34);
  });

  test("keeps desktop scope and Today actions easy to target", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only touch-target audit");

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });

    const scopeControls = await page.locator(
      ".detail-topbar .city-scope-control select, .detail-topbar .language-option",
    ).evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
    expect(scopeControls.length).toBeGreaterThanOrEqual(3);
    for (const control of scopeControls) {
      expect(control.width).toBeGreaterThanOrEqual(32);
      expect(control.height).toBeGreaterThanOrEqual(32);
    }

    await page.goto("/?view=today", { waitUntil: "networkidle" });
    const todayControls = await page.locator(
      ".today-provenance-link, .today-action-card-main",
    ).evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(todayControls.length).toBeGreaterThan(0);
    for (const height of todayControls) {
      expect(height).toBeGreaterThanOrEqual(32);
    }

    const assistantControls = page.locator(".today-action-card-assistant");
    await expect(assistantControls).toHaveCount(4);
    await expect(assistantControls.first()).toBeVisible();
    const assistantLayouts = await assistantControls.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
    for (const control of assistantLayouts) {
      expect(control.width).toBeGreaterThanOrEqual(32);
      expect(control.height).toBeGreaterThanOrEqual(32);
    }

    const assistantAction = page.locator(".today-action-card-assistant").first();
    await assistantAction.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(assistantAction).toBeFocused();
    const focusedAssistantLayout = await assistantAction.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width,
        focused: document.activeElement === element,
      };
    });
    expect(focusedAssistantLayout.focused).toBe(true);
    expect(focusedAssistantLayout.width).toBeGreaterThanOrEqual(32);
    expect(focusedAssistantLayout.height).toBeGreaterThanOrEqual(32);
  });

  test("explains the about capability map scroll on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only scroll hint audit");

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/about", { waitUntil: "networkidle" });

    await expect(page.locator("#about-coverage-scroll-hint")).toBeVisible();
    await expect(page.locator(".about-coverage-scroll")).toHaveAttribute(
      "aria-describedby",
      "about-coverage-scroll-hint",
    );
    await expect(page.locator("#about-coverage-scroll-hint")).toContainText("Swipe horizontally");

    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.locator("#about-coverage-scroll-hint")).toContainText("横向滑动");
  });

  test("explains the about capability map scroll at tablet widths", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "tablet-width scroll hint audit");

    for (const width of [768, 900]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/about", { waitUntil: "networkidle" });

      const coverageMap = page.locator(".about-coverage-scroll");
      await expect(page.locator("#about-coverage-scroll-hint")).toBeVisible();
      await expect.poll(() => coverageMap.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))).toEqual({ clientWidth: 640, scrollWidth: 820 });
    }
  });

  test("keeps the about navigation inside a narrow mobile viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only narrow layout audit");

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
          navRight: nav?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
          actionsRight: actions?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
          ctaRight: cta?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
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
      expect(layout.ctaScrollWidth).toBeLessThanOrEqual(layout.ctaClientWidth + 1);
      expect(layout.languageScrollWidth).toBeLessThanOrEqual(layout.languageClientWidth + 1);
      expect(layout.ctaWhiteSpace).toBe("nowrap");

      const languageButtons = await page.locator(".about-language button").evaluateAll((buttons) =>
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

      const workspaceCardBounds = await page.locator(".about-workspace-card").evaluateAll((cards) =>
        cards.map((card) => {
          const rect = card.getBoundingClientRect();
          return { left: rect.left, right: rect.right, viewport: window.innerWidth };
        }),
      );
      for (const card of workspaceCardBounds) {
        expect(card.left).toBeGreaterThanOrEqual(0);
        expect(card.right).toBeLessThanOrEqual(card.viewport);
      }
    }
  });

  test("keeps the about header controls easy to tap on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only about header touch-target audit");

    for (const language of ["en", "zh"] as const) {
      await page.setViewportSize({ width: 280, height: 740 });
      await page.goto("/about", { waitUntil: "networkidle" });
      if (language === "zh") {
        await page.getByRole("button", { name: "中文" }).click();
      }

      const controls = await page.locator(".about-brand, .about-language button").evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            isLanguageButton: element.matches(".about-language button"),
            height: rect.height,
            width: rect.width,
            minHeight: Number.parseFloat(window.getComputedStyle(element).minHeight),
            minWidth: Number.parseFloat(window.getComputedStyle(element).minWidth),
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

  test("keeps public text links comfortably tappable on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only touch-target audit");

    await page.setViewportSize({ width: 280, height: 740 });
    await page.goto("/", { waitUntil: "networkidle" });

    const demoLink = page.locator(".demo-mode-banner-link");
    await expect(demoLink).toBeVisible();

    const publicLinkHeights = await demoLink.evaluate((element) => {
      const banner = element.getBoundingClientRect();
      return { demo: banner.height };
    });
    const overviewWidth = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));

    await page.goto("/about", { waitUntil: "networkidle" });
    const aboutLinkHeights = await page.locator(".about-card-link, .about-footer a").evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().height),
    );
    const aboutWidth = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));

    expect(publicLinkHeights.demo).toBeGreaterThanOrEqual(32);
    expect(aboutLinkHeights.length).toBeGreaterThan(0);
    for (const height of aboutLinkHeights) {
      expect(height).toBeGreaterThanOrEqual(32);
    }
    expect(overviewWidth.document).toBeLessThanOrEqual(overviewWidth.viewport);
    expect(aboutWidth.document).toBeLessThanOrEqual(aboutWidth.viewport);
  });

  test("keeps compact search and disclosure controls tappable on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only touch-target audit");

    await page.setViewportSize({ width: 280, height: 740 });
    await page.goto("/", { waitUntil: "networkidle" });

    const overviewSearch = page.locator("#overview-signal-search");
    await expect(overviewSearch).toBeVisible();
    await overviewSearch.fill("weather");
    const clearSearch = page.locator(".overview-search-clear");
    await expect(clearSearch).toBeVisible();

    const overviewControls = await page.evaluate(() => ({
      input: document.querySelector("#overview-signal-search")?.getBoundingClientRect().height ?? 0,
      clear: document.querySelector(".overview-search-clear")?.getBoundingClientRect().height ?? 0,
    }));

    await page.goto("/?view=weather", { waitUntil: "networkidle" });
    const evidenceSummary = page.locator(".workspace-evidence-extra summary");
    await expect(evidenceSummary).toBeVisible();
    const evidenceHeight = await evidenceSummary.evaluate((element) => element.getBoundingClientRect().height);

    await page.goto("/?view=events", { waitUntil: "networkidle" });
    const eventsSearch = page.locator(".linked-events-search input");
    await expect(eventsSearch).toBeVisible();
    const eventsHeight = await eventsSearch.evaluate((element) => element.getBoundingClientRect().height);

    expect(overviewControls.input).toBeGreaterThanOrEqual(40);
    expect(overviewControls.clear).toBeGreaterThanOrEqual(32);
    expect(evidenceHeight).toBeGreaterThanOrEqual(32);
    expect(eventsHeight).toBeGreaterThanOrEqual(40);
  });

  test("keeps data controls visibly focused for keyboard users", async ({ page }) => {
    await page.goto("/?view=events", { waitUntil: "networkidle" });

    const activeFilter = page.locator(".linked-events-filter-active").first();
    let focused = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await page.keyboard.press("Tab");
      if (await activeFilter.evaluate((element) => element === document.activeElement)) {
        focused = true;
        break;
      }
    }

    expect(focused).toBe(true);
    const focusState = await activeFilter.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });

    expect(focusState.focusVisible).toBe(true);
    expect(focusState.outlineStyle).toBe("solid");
    expect(focusState.outlineWidth).toBeGreaterThanOrEqual(2);
  });

  test("exposes linked-event filter selection to assistive technology", async ({ page }) => {
    await page.goto("/?view=events", { waitUntil: "networkidle" });

    const activeFilter = page.locator(".linked-events-filter-active");
    const activeCategory = page.locator(".linked-events-category-chip.active");
    await expect(activeFilter).toHaveAttribute("aria-pressed", "true");
    await expect(activeCategory).toHaveAttribute("aria-pressed", "true");

    await page.locator(".linked-events-filter").filter({ hasText: "Today" }).click();
    await expect(page.locator(".linked-events-filter-active")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".linked-events-filter").filter({ hasText: "All" })).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "Culture" }).click();
    await expect(page.locator(".linked-events-category-chip.active")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".linked-events-category-chip").filter({ hasText: "All activities" })).toHaveAttribute("aria-pressed", "false");
  });

  test("offers a recovery action when a linked-event time filter is empty", async ({ page }) => {
    await page.goto("/?view=events", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Today: 0" }).click();
    await expect(page.locator(".linked-events-empty-state-copy")).toContainText(
      "No activities are available",
    );

    const clearFilters = page.getByRole("button", { name: "Clear Filters" });
    await expect(clearFilters).toHaveCount(1);
    await clearFilters.click();

    await expect(page.getByRole("button", { name: "All: 0" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Clear Filters" })).toHaveCount(0);
  });

  test("keeps the linked-event empty explanation above mobile navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only empty-state visibility audit");

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 280, height: 740 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/?view=events", { waitUntil: "networkidle" });

      const emptyStatus = page.locator(".linked-events-empty-state-copy");
      const mobileNavigation = page.locator(".mobile-bottom-nav");
      await expect(emptyStatus).toBeVisible();
      await expect(page.locator(".linked-events-page-empty")).toHaveCount(1);

      const bounds = await Promise.all([
        emptyStatus.boundingBox(),
        mobileNavigation.boundingBox(),
      ]);
      expect(bounds[0]).not.toBeNull();
      expect(bounds[1]).not.toBeNull();
      expect(bounds[0]!.y + bounds[0]!.height).toBeLessThanOrEqual(bounds[1]!.y - 8);
    }
  });

  test("keeps narrow catalog columns inside the mobile viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only narrow layout audit");

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/?view=geospatial", { waitUntil: "networkidle" });

    const columnBounds = await page.locator(".geo-catalog-grid > div").evaluateAll((columns) =>
      columns.map((column) => {
        const rect = column.getBoundingClientRect();
        return { left: rect.left, right: rect.right, viewport: window.innerWidth };
      }),
    );
    for (const column of columnBounds) {
      expect(column.left).toBeGreaterThanOrEqual(0);
      expect(column.right).toBeLessThanOrEqual(column.viewport);
    }
  });

  test("keeps expanded catalog cards above the mobile navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only bottom navigation audit");

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/?view=overview", { waitUntil: "networkidle" });

    const catalog = page.locator(".overview-catalog");
    await catalog.locator("summary").click();
    const main = page.locator("#main-content");
    await main.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const bounds = await page.evaluate(() => {
      const card = document.querySelector(".overview-signal-grid-catalog .signal-card:last-child");
      const nav = document.querySelector(".mobile-bottom-nav");
      if (!(card instanceof HTMLElement) || !(nav instanceof HTMLElement)) {
        return { cardBottom: 0, navTop: 0 };
      }
      return {
        cardBottom: card.getBoundingClientRect().bottom,
        navTop: nav.getBoundingClientRect().top,
      };
    });

    expect(bounds.cardBottom).toBeLessThanOrEqual(bounds.navTop + 1);
  });

  test("keeps the regional profile table reachable on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only table scroll audit");

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/?view=regional_profile", { waitUntil: "networkidle" });

    const tableWrapper = page.locator(".regional-table-wrapper").first();
    await expect(tableWrapper).toHaveAttribute("aria-describedby", "regional-profile-city-indicators-note");
    await expect(page.locator("#regional-profile-city-indicators-note")).toContainText("scroll horizontally");
    await tableWrapper.focus();
    await expect(tableWrapper).toBeFocused();

    const scrollAudit = await tableWrapper.evaluate((wrapper) => {
      const table = wrapper.querySelector("table");
      const lastHeader = table?.querySelector("th:last-child");
      const wrapperRect = wrapper.getBoundingClientRect();
      if (!table || !lastHeader) {
        return { hasOverflow: false, lastColumnVisible: false };
      }

      const hasOverflow = wrapper.scrollWidth > wrapper.clientWidth;
      wrapper.scrollLeft = wrapper.scrollWidth;
      const headerRect = lastHeader.getBoundingClientRect();
      const lastColumnVisible = headerRect.left >= wrapperRect.left - 1 && headerRect.right <= wrapperRect.right + 1;
      return { hasOverflow, lastColumnVisible };
    });

    expect(scrollAudit.hasOverflow).toBe(true);
    expect(scrollAudit.lastColumnVisible).toBe(true);
  });

  test("keeps the regional profile table focus target above the mobile navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only short table focus audit");

    await page.setViewportSize({ width: 320, height: 740 });
    for (const language of ["en", "zh"] as const) {
      await setPreference(page, "language", language);
      await page.goto("/?view=regional_profile", { waitUntil: "networkidle" });

      const tableWrapper = page.locator(".regional-table-wrapper");
      await tableWrapper.focus();
      const layout = await page.evaluate(() => {
        const table = document.querySelector<HTMLElement>(".regional-table-wrapper");
        const footer = document.querySelector<HTMLElement>(".mobile-dashboard-footer");
        const tableRect = table?.getBoundingClientRect();
        const footerRect = footer?.getBoundingClientRect();
        return {
          tableBottom: tableRect?.bottom ?? Number.POSITIVE_INFINITY,
          footerTop: footerRect?.top ?? Number.NEGATIVE_INFINITY,
        };
      });

      expect(layout.tableBottom).toBeLessThanOrEqual(layout.footerTop + 1);
    }
  });

  test("keeps mobile source details inside the viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only popover audit");

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/?view=weather", { waitUntil: "networkidle" });

    const sourceDetails = page.locator(".workspace-evidence-extra");
    const content = sourceDetails.locator(".workspace-evidence-extra-content");
    await expect(sourceDetails).not.toHaveAttribute("open", "");
    await expect(content).not.toBeVisible();
    await sourceDetails.locator("summary").click();
    const bounds = await content.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth };
    });

    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
    await expect(content).toBeVisible();
    await expect(content).toContainText("LAT 60.1699");
  });

  test("does not double-space the weather detail header on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only detail rhythm audit");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=weather", { waitUntil: "networkidle" });

    const spacing = await page.locator(".weather-detail-page").evaluate((root) => {
      const header = root.querySelector<HTMLElement>(".weather-detail-header");
      const content = root.querySelector<HTMLElement>(".weather-bento-grid");
      if (!header || !content) {
        return null;
      }

      const headerRect = header.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      return {
        headerMarginBottom: Number.parseFloat(getComputedStyle(header).marginBottom),
        contentGap: contentRect.top - headerRect.bottom,
      };
    });

    expect(spacing).not.toBeNull();
    expect(spacing?.headerMarginBottom).toBe(0);
    expect(spacing?.contentGap).toBeLessThanOrEqual(96);
  });

  test("keeps water coverage labels in complete readable rows", async ({ page }, testInfo) => {
    await page.goto("/?view=water", { waitUntil: "networkidle" });

    const layout = await page.locator(".water-coverage-list").evaluate((element) => ({
      columnCount: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
      labels: Array.from(element.querySelectorAll<HTMLElement>(".water-coverage-row > span:first-child"))
        .map((label) => ({ clientWidth: label.clientWidth, scrollWidth: label.scrollWidth })),
    }));

    expect(layout.columnCount).toBe(testInfo.project.name === "mobile-chromium" ? 1 : 2);
    expect(layout.labels.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth)).toBe(true);

    if (testInfo.project.name === "mobile-chromium") {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.goto("/?view=water", { waitUntil: "networkidle" });

      const narrowSummary = await page.locator(".water-summary-strip").evaluate((element) => {
        const values = Array.from(element.querySelectorAll<HTMLElement>("article strong"));
        return {
          columnCount: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
          values: values.map((value) => ({
            clientWidth: value.clientWidth,
            scrollWidth: value.scrollWidth,
          })),
        };
      });

      expect(narrowSummary.columnCount).toBe(1);
      expect(narrowSummary.values.every(({ scrollWidth, clientWidth }) => scrollWidth <= clientWidth)).toBe(true);
    }
  });

  test("keeps energy provider names readable on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only layout audit");

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/?view=energy", { waitUntil: "networkidle" });

      const layout = await page.locator(".energy-summary-strip").evaluate((element) => {
        const providerValue = element.querySelector<HTMLElement>("article.energy-summary-compact strong");
        const textNode = providerValue?.firstChild;
        const firstWordEnd = textNode?.textContent?.indexOf(" ") ?? -1;
        const wordRange = document.createRange();
        if (textNode && firstWordEnd > 0) {
          wordRange.setStart(textNode, 0);
          wordRange.setEnd(textNode, firstWordEnd);
        }
        const providerStyle = providerValue ? getComputedStyle(providerValue) : null;
        const providerRect = providerValue?.getBoundingClientRect();

        return {
          columnCount: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
          provider: providerValue?.textContent,
          contentWidth: providerValue?.clientWidth ?? 0,
          scrollWidth: providerValue?.scrollWidth ?? 0,
          overflowWrap: providerStyle?.overflowWrap,
          firstWordLineCount: textNode && firstWordEnd > 0 ? wordRange.getClientRects().length : 0,
          providerHeight: providerRect?.height ?? 0,
          lineHeight: providerStyle ? Number.parseFloat(providerStyle.lineHeight) : 0,
        };
      });

      expect(layout.provider).toBe("Pörssisähkö API");
      expect(layout.columnCount).toBe(width <= 360 ? 1 : 2);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.contentWidth + 1);
      expect(layout.overflowWrap).toBe("normal");
      expect(layout.firstWordLineCount).toBe(1);
      expect(layout.providerHeight).toBeLessThanOrEqual(layout.lineHeight * 2 + 2);
    }
  });

  test("gives the energy chart a localized accessible name", async ({ page }) => {
    await page.goto("/?view=energy", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("group", { name: "Household electricity price forecast" }),
    ).toBeVisible();
    const chart = page.locator(".energy-price-line");
    await expect(chart).toHaveAttribute("role", "img");
    await expect(chart).toHaveAttribute("aria-label", /Household electricity price forecast/);
  });

  test("keeps Today provenance readable at the narrow desktop breakpoint", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only compact-card audit");

    await page.setViewportSize({ width: 1024, height: 740 });
    await page.goto("/?view=today", { waitUntil: "networkidle" });

    const provenance = await page.locator(".today-action-card-meta > span").evaluateAll((elements) =>
      elements.map((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        whiteSpace: getComputedStyle(element).whiteSpace,
      })),
    );

    expect(provenance.length).toBeGreaterThan(0);
    expect(provenance.every(({ clientWidth, scrollWidth, whiteSpace }) =>
      scrollWidth <= clientWidth + 1 && whiteSpace === "normal",
    )).toBe(true);
  });

  test("gives the visible weather history chart a localized accessible name", async ({ page }, testInfo) => {
    await page.goto("/?view=weather", { waitUntil: "networkidle" });

    const chart = page.locator("svg.trend-chart-svg");
    await expect(chart).toHaveAttribute("role", "img");
    await expect(chart).toHaveAttribute("aria-label", /Daily average temperature: /);
    await expect(page.locator(".trend-chart-single-note")).toHaveText(
      "Only one saved snapshot is available. A trend needs at least two observations.",
    );

    const languageButton =
      testInfo.project.name === "mobile-chromium"
        ? (await page.getByRole("button", { name: "Open navigation" }).click(),
          page.getByRole("dialog", { name: "Primary navigation" }).getByRole("button", { name: "中文" }))
        : page.getByRole("button", { name: "中文" });
    await languageButton.click();
    await expect(chart).toHaveAttribute("aria-label", /日均温度: /);
    await expect(page.locator(".trend-chart-single-note")).toHaveText(
      "目前只有一个已保存快照，至少需要两次观测才能显示趋势。",
    );
  });

  test("keeps today plan titles readable on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only layout audit");

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/?view=today", { waitUntil: "networkidle" });

      const layout = await page.locator(".day-plan-timeline-button").first().evaluate((element) => {
        const title = element.querySelector<HTMLElement>(".day-plan-timeline-top strong");
        const titleText = title?.firstChild;
        const titleRange = document.createRange();
        if (titleText) {
          titleRange.selectNodeContents(titleText);
        }
        return {
          columnCount: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
          title: title?.textContent,
          titleWidth: title?.clientWidth ?? 0,
          titleScrollWidth: title?.scrollWidth ?? 0,
          titleLineCount: titleText ? titleRange.getClientRects().length : 0,
        };
      });

      expect(layout.columnCount).toBe(1);
      expect(layout.title).toContain("Late morning");
      expect(layout.titleScrollWidth).toBeLessThanOrEqual(layout.titleWidth + 1);
      expect(layout.titleLineCount).toBeLessThanOrEqual(2);
    }
  });

  test("keeps the Today contextual assistant action available on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only contextual assistant audit");

    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/?view=today", { waitUntil: "networkidle" });

      const assistant = page.getByRole("button", { name: "Ask about Commute" });
      await expect(assistant).toBeVisible();

      const box = await assistant.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThan(0);

      await assistant.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").locator("input").first()).toHaveValue(
        "Analyze Commute data",
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
  });

  test("keeps today plan time windows readable on narrow screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only time-window audit");

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/?view=today", { waitUntil: "networkidle" });

      const windows = await page.locator(".day-plan-timeline-button time").evaluateAll((elements) =>
        elements.map((element) => ({
          height: element.getBoundingClientRect().height,
          innerText: (element as HTMLElement).innerText,
          scrollHeight: element.scrollHeight,
        })),
      );

      expect(windows.length).toBeGreaterThan(0);
      expect(
        windows.every(({ height, innerText, scrollHeight }) =>
          innerText.split("\n").filter(Boolean).length >= 2 &&
          height >= scrollHeight - 1 &&
          height > 20,
        ),
      ).toBe(true);
    }
  });

  test("keeps Today timeline titles readable at the desktop breakpoint", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only breakpoint audit");

    await page.setViewportSize({ width: 1024, height: 844 });
    await page.goto("/?view=today", { waitUntil: "networkidle" });

    const titles = await page.locator(".day-plan-timeline-top strong").evaluateAll((elements) =>
      elements.map((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        text: element.textContent,
      })),
    );

    expect(titles.length).toBeGreaterThan(0);
    expect(
      titles.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth + 1),
    ).toBe(true);
  });

  test("keeps narrow catalog workspaces keyboard-accessible", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only accessibility audit");

    await page.setViewportSize({ width: 320, height: 740 });
    for (const view of ["water", "city_services", "geospatial"]) {
      await page.goto(`/?view=${view}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("main")).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    }
  });

  test("keeps narrow mobile header actions touch-sized", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only touch target audit");

    await page.setViewportSize({ width: 280, height: 740 });

    for (const language of ["en", "zh"] as const) {
      await setPreference(page, "language", language);
      for (const view of ["overview", "weather", "mobility", "events"] as const) {
        await page.goto(`/?view=${view}`, { waitUntil: "networkidle" });

        const controls = await page.locator(
          ".mobile-dashboard-header .icon-button, .mobile-context-row .icon-button",
        ).evaluateAll((elements) =>
          elements
            .filter((element) => {
              const style = window.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
            })
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "unnamed",
                width: rect.width,
                height: rect.height,
              };
            }),
        );

        expect(controls.length, `${language}/${view} should expose mobile header actions`).toBeGreaterThan(0);
        for (const control of controls) {
          expect(
            Math.min(control.width, control.height),
            `${language}/${view} ${control.label} should keep a 40px touch target`,
          ).toBeGreaterThanOrEqual(40);
        }

        const layout = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(layout.scrollWidth, `${language}/${view} should not overflow after enlarging actions`).toBeLessThanOrEqual(
          layout.clientWidth + 1,
        );
      }
    }
  });

  test("keeps the public about page accessible in dark mode", async ({ page }, testInfo) => {
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

  test("respects reduced motion across animated workspaces", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const view of ["weather", "energy", "water", "city_services", "geospatial", "regional_profile"]) {
      await page.goto(`/?view=${view}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("main")).toBeVisible();

      const animatedElements = await page.locator(".dashboard-shell").evaluate((shell) =>
        Array.from(shell.querySelectorAll<HTMLElement>("*")).filter((element) => {
          const style = window.getComputedStyle(element);
          return style.animationName !== "none" || style.transitionDuration !== "0s";
        }).length,
      );

      expect(animatedElements, `${view} should have no active motion`).toBe(0);
    }
  });

  test("keeps horizontal detail tabs visible when keyboard navigation moves focus", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only tab overflow audit");

    await page.setViewportSize({ width: 320, height: 740 });
    for (const [view, tabId] of [
      ["energy", "energy-workspace-tab-fingrid"],
      ["mobility", "mobility-workspace-tab-traffic"],
    ] as const) {
      await page.goto(`/?view=${view}`, { waitUntil: "networkidle" });
      const tabList = page.getByRole("tablist");
      const tabLayout = await tabList.evaluate((element) => ({
        right: element.getBoundingClientRect().right,
        viewport: window.innerWidth,
        tabs: Array.from(element.querySelectorAll<HTMLElement>("[role='tab']")).map((tab) => ({
          clientWidth: tab.clientWidth,
          scrollWidth: tab.scrollWidth,
        })),
      }));
      expect(tabLayout.right).toBeLessThanOrEqual(tabLayout.viewport + 1);
      for (const tab of tabLayout.tabs) {
        expect(tab.scrollWidth).toBeLessThanOrEqual(tab.clientWidth + 1);
      }
      const activeTab = tabList.getByRole("tab", { selected: true });
      await activeTab.focus();
      await page.keyboard.press("ArrowRight");

      const nextTab = page.locator(`#${tabId}`);
      await expect(nextTab).toBeFocused();
      await expect(page.locator(`#${view}-workspace-panel`)).toHaveAttribute("tabindex", "-1");
      const bounds = await nextTab.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const list = element.parentElement?.getBoundingClientRect();
        return { right: rect.right, listRight: list?.right ?? 0 };
      });
      expect(bounds.right).toBeLessThanOrEqual(bounds.listRight + 1);
    }

    await page.goto("/?view=mobility", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /Road and rail/ }).click();
    const scopeValue = page.locator(".road-rail-scope-tile > strong");
    await expect(scopeValue).toHaveText("National");
    const scopeLayout = await scopeValue.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        height: rect.height,
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });
    expect(scopeLayout.scrollWidth).toBeLessThanOrEqual(scopeLayout.clientWidth);
    expect(scopeLayout.height).toBeLessThanOrEqual(scopeLayout.lineHeight + 1);
  });

  test("keeps translated narrow content inside its readable frame", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only translated narrow layout audit");

    await page.setViewportSize({ width: 280, height: 740 });
    await setPreference(page, "language", "zh");

    for (const [route, selectors] of [
      ["/?view=air", [".air-detail-page", ".air-detail-header", ".air-main-grid", ".air-pipeline-panel > div"]],
      ["/?view=city_services", [".city-detail-page", ".city-summary-strip"]],
      ["/?view=events", [".linked-events-filter-panel", ".linked-events-search"]],
      ["/about", [".about-shell", ".about-flow-grid"]],
    ] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      const widths = await page.locator(selectors.join(", ")).evaluateAll((elements) =>
        elements.map((element) => ({
          className: typeof element.className === "string" ? element.className : "",
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      );

      for (const width of widths) {
        expect(width.scrollWidth, `${route} ${width.className} should not clip translated content`).toBeLessThanOrEqual(
          width.clientWidth + 1,
        );
      }
    }
  });

  test("keeps the assistant header readable in a narrow mobile drawer", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only assistant layout audit");

    await page.setViewportSize({ width: 280, height: 740 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("button.mobile-bottom-nav-assistant").click();

    const headerLayout = await page.locator(".assistant-panel-header").evaluate((element) => {
      const title = element.querySelector<HTMLElement>(".assistant-panel-identity h2");
      const style = title ? window.getComputedStyle(title) : null;
      const titleRect = title?.getBoundingClientRect();
      return {
        headerClientWidth: element.clientWidth,
        headerScrollWidth: element.scrollWidth,
        titleWidth: titleRect?.width ?? 0,
        titleHeight: titleRect?.height ?? 0,
        titleLineHeight: style && style.lineHeight !== "normal"
          ? Number.parseFloat(style.lineHeight)
          : 24,
      };
    });

    expect(headerLayout.headerScrollWidth).toBeLessThanOrEqual(headerLayout.headerClientWidth + 1);
    expect(headerLayout.titleWidth).toBeGreaterThan(100);
    expect(headerLayout.titleHeight).toBeLessThanOrEqual(headerLayout.titleLineHeight + 1);

    const assistantControls = await page.locator(
      ".assistant-panel-header button, .assistant-suggestions button, .assistant-composer-field input, .assistant-composer-field button",
    ).evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute("aria-label") ?? element.getAttribute("placeholder") ?? element.textContent?.trim() ?? "unnamed",
            width: rect.width,
            height: rect.height,
          };
        }),
    );

    for (const control of assistantControls) {
      expect(
        Math.min(control.width, control.height),
        `${control.label} should keep a 40px touch target in the assistant drawer`,
      ).toBeGreaterThanOrEqual(40);
    }
  });

  test("keeps detail workspaces accessible after client navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop-only detail audit");

    const nav = page.getByRole("complementary", { name: "Primary navigation" });
    for (const label of [
      "Weather",
      "Air quality",
      "Energy",
      "Mobility",
      "Water and snow",
      "Linked events",
      "City services",
      "Geospatial base",
      "Regional profile",
    ]) {
      await nav.getByRole("button", { name: new RegExp(label, "i") }).click();
      await expect(page.locator("main .workspace-evidence-header h1").first()).toBeVisible();
      await expect(page).toHaveTitle("ArkiWatch | Public data. Practical decisions.");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    }
  });

  test("keeps one hierarchical heading outline on every demo route", async ({ page }) => {
    for (const view of [
      "overview",
      "today",
      "weather",
      "air",
      "energy",
      "mobility",
      "water",
      "events",
      "city_services",
      "geospatial",
      "regional_profile",
    ]) {
      await page.goto(`/?view=${view}`, { waitUntil: "networkidle" });

      const outline = await page.locator("h1, h2, h3, h4, h5, h6").evaluateAll((headings) =>
        headings
          .filter((heading) => {
            const element = heading as HTMLElement;
            return element.getClientRects().length > 0 && !element.closest(".sr-only");
          })
          .map((heading) => Number(heading.tagName.slice(1))),
      );

      expect(outline[0], `${view} should start with its page heading`).toBe(1);
      expect(outline.filter((level) => level === 1), `${view} should have one page heading`).toHaveLength(1);
      expect(
        outline.every((level, index) => index === 0 || level - outline[index - 1] <= 1),
        `${view} should not skip heading levels`,
      ).toBe(true);
    }
  });

  test("keeps route focus keyboard-accessible without a page outline", async ({ page }) => {
    const main = page.locator("#main-content");

    await page.getByRole("button", { name: /^Weather$/ }).click();
    await expect(main).toBeFocused();
    await expect(main).toHaveAttribute("tabindex", "0");
    await expect(main).toHaveCSS("outline-style", "none");
  });

  test("does not emit hydration errors on direct demo routes", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    for (const view of [
      "overview",
      "today",
      "weather",
      "air",
      "energy",
      "mobility",
      "water",
      "events",
      "city_services",
      "geospatial",
      "regional_profile",
    ]) {
      await page.goto(`/?view=${view}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("main")).toBeVisible();
    }

    expect(pageErrors).toEqual([]);
  });

  test("keeps visible data separators and unavailable markers readable", async ({ page }) => {
    test.setTimeout(60_000);

    const routes = [
      "/?view=today",
      "/?view=weather",
      "/?view=air",
      "/?view=energy",
      "/?view=mobility&mobilityTab=transit&event=demo-alert-4",
      "/?view=mobility&mobilityTab=traffic&event=demo-road-1",
      "/?view=water",
      "/?view=events",
    ];

    for (const language of ["en", "zh"] as const) {
      await setPreference(page, "language", language);

      for (const route of routes) {
        await page.goto(route, { waitUntil: "networkidle" });

        const mainText = await page.locator("#main-content").innerText();
        expect(mainText, `${language}/${route} should not expose typographic dash placeholders`).not.toMatch(/[—–]/);
      }
    }
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

  await expect(page).toHaveTitle("Admin sign in | ArkiWatch");
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Username" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to public data" })).toHaveAttribute("href", "/");
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

test("keeps the admin title readable at the narrowest phone width", async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 740 });
  await page.goto("/login", { waitUntil: "networkidle" });

  const titleLayout = await page.getByRole("heading", { name: "Admin sign in" }).evaluate((element) => {
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

test("keeps public auth and recovery focus indicators visible", async ({ page }) => {
  await page.goto("/login");

  const loginLanguage = page.getByRole("button", { name: "EN", exact: true });
  await loginLanguage.focus();
  await expect(loginLanguage).toHaveCSS("outline-style", "solid");
  await expect(loginLanguage).toHaveCSS("outline-width", "2px");

  const publicLink = page.getByRole("link", { name: "Back to public data" });
  await publicLink.focus();
  await expect(publicLink).toHaveCSS("outline-style", "solid");

  await page.goto("/this-route-does-not-exist");
  const recoveryLanguage = page.getByRole("button", { name: "EN", exact: true });
  await recoveryLanguage.focus();
  await expect(recoveryLanguage).toHaveCSS("outline-style", "solid");
  await expect(recoveryLanguage).toHaveCSS("outline-width", "2px");
});

test("provides a branded recovery path for unknown routes", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to data platform" })).toHaveAttribute(
    "href",
    "/?view=overview&city=helsinki",
  );
  await expect(page.getByRole("link", { name: "About ArkiWatch" })).toHaveAttribute(
    "href",
    "/about",
  );
  const englishResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(englishResults.violations).toEqual([]);

  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page).toHaveTitle("页面不存在 | ArkiWatch");
  await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回数据平台" })).toHaveAttribute(
    "href",
    "/?view=overview&city=helsinki",
  );
  await expect(page.getByRole("link", { name: "关于 ArkiWatch" })).toHaveAttribute("href", "/about");
  const chineseResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(chineseResults.violations).toEqual([]);
});

test("exposes the privacy boundary from the public product pages", async ({ page }) => {
  await page.goto("/about", { waitUntil: "networkidle" });

  await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveTitle("Privacy and data boundary | ArkiWatch");
  await expect(page.getByRole("heading", { name: "Privacy and data boundary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data boundaries" })).toBeVisible();
  await expect(page.getByText(/deterministic demo uses local fixtures/)).toBeVisible();

  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page).toHaveTitle("隐私与数据边界 | ArkiWatch");
  await expect(page.getByRole("heading", { name: "隐私与数据边界" })).toBeVisible();
  await expect(page.getByText(/确定性演示使用本地 fixture/)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("moves focus to the login error after a failed submission", async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  const error = page.locator(".login-error");
  await expect(error).toHaveText("Login failed.");
  await expect(error).toBeFocused();
});

test("renders the admin title in the language the request carries", async ({ page, context }) => {
  await context.addCookies([
    { name: "arkiwatch-language", value: "zh", url: "http://127.0.0.1:3100" },
  ]);
  await page.goto("/login");

  await expect(page).toHaveTitle("管理员登录 | ArkiWatch");
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();
});

test("adopts a language held only in localStorage on the next load", async ({ page, context }) => {
  // A visitor from before the language cookie existed. The interface is
  // localized immediately; the title follows once the seeded cookie reaches
  // the server, because streamed metadata can outrun any client correction.
  await page.addInitScript(() => {
    window.localStorage.setItem("arkiwatch-language", "zh");
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "arkiwatch-language")?.value,
  ).toBe("zh");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page).toHaveTitle("管理员登录 | ArkiWatch");
});

async function setPreference(page: Page, preference: "language" | "theme", value: string) {
  await page.evaluate(({ preference, value }) => localStorage.setItem(`arkiwatch-${preference}`, value), { preference, value });
}
