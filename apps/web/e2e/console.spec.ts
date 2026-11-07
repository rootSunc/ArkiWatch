import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openScope(page: Page) {
  const trigger = page.getByRole("button", { name: "Data scope", exact: true });
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await expect(trigger).toBeVisible();
    await trigger.click();
  }
}
async function openNavigation(page: Page) {
  const trigger = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await expect(trigger).toBeVisible();
    await trigger.click();
  }
}
async function openAssistant(page: Page) {
  const desktop = page.getByRole("button", {
    name: "Open ArkiWatch assistant",
    exact: true,
  });
  if (await desktop.isVisible()) await desktop.click();
  else await page.locator(".mobile-bottom-nav-assistant").click();
}
const routes = [
  "weather",
  "air",
  "energy",
  "mobility",
  "water",
  "city_services",
  "geospatial",
  "regional_profile",
];

test("Home exposes six honest readings before secondary content", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".home-metrics > article")).toHaveCount(6);
  await expect(page.locator(".home-decision")).toContainText(
    "Leave a few minutes earlier",
  );
  await expect(page.locator(".home-metrics")).toContainText("16");
  await expect(page.locator(".demo-mode-banner")).toHaveCount(0);
  await expect(page.locator(".overview-search")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await page.locator(".home-metrics > article").first().boundingBox())
          ?.y ?? 100000,
    )
    .toBeLessThan(info.project.name.includes("mobile") ? 600 : 400);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
});

test("empty domains remain visible and cannot imply health", async ({
  page,
}) => {
  await page.goto("/");
  const tile = page
    .locator(".home-metrics > article")
    .filter({ hasText: "Water and snow" });
  await expect(tile).toContainText("Empty");
  await expect(tile).toContainText("No history");
  await expect(tile.locator("svg[role=img]")).toHaveCount(0);
});

for (const route of routes) {
  test(`${route} follows the shared workspace and retains detailed inspection`, async ({
    page,
  }) => {
    await page.goto(`/?view=${route}`);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator(".workspace-kpis")).toBeVisible();
    await expect(page.locator(".workspace-main-chart")).toBeVisible();
    await expect(page.getByRole("table", { name: "Breakdown" })).toBeVisible();
    await page.getByText("Detailed inspection", { exact: true }).click();
    await expect(page.locator(".workspace-inspection-content")).toBeVisible();
    await expect(page.locator("main h1")).toHaveCount(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  });
}

test("weather drilldown preserves the Home reading and exposes evidence by touch or hover", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".home-metrics")
    .getByRole("button", { name: "Weather", exact: true })
    .click();
  await expect(page).toHaveURL(/view=weather/);
  await expect(page.locator(".workspace-kpis > article").first()).toContainText(
    "16",
  );
  await page
    .locator(".workspace-kpis > article")
    .first()
    .getByRole("button", { name: "View evidence", exact: true })
    .click();
  await expect(
    page.getByText("Provider", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Licence", { exact: true }).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".workspace-kpis").getByText("Licence", { exact: true }),
  ).toHaveCount(0);
});

test("chart range changes explain insufficient history instead of drawing an empty panel", async ({
  page,
}) => {
  await page.goto("/?view=weather");
  await expect(page.locator(".workspace-main-chart svg")).toBeVisible();
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await expect(
    page.locator(".workspace-main-chart .trend-chart-insufficient"),
  ).toContainText("of 3 observations");
  await expect(page.locator(".workspace-main-chart svg")).toHaveCount(0);
});

test("breakdown filtering and CSV export use the visible rows", async ({
  page,
}) => {
  await page.goto("/?view=air");
  await page
    .getByRole("searchbox", { name: "Search", exact: true })
    .fill("kallio");
  await expect(
    page.getByRole("table", { name: "Breakdown" }).locator("tbody tr"),
  ).toHaveCount(1);
  await page.getByText("•••", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("air.csv");
  await expect(
    page.getByRole("status").filter({ hasText: "Export downloaded" }),
  ).toBeVisible();
});

test("events keep all filters usable through empty results and restore the list", async ({
  page,
}) => {
  await page.goto("/?view=events");
  await page
    .getByRole("searchbox", { name: "Search events" })
    .fill("no-match-123");
  await expect(page.getByText("No rows match these filters.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Severity" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search events" }).clear();
  await page
    .getByRole("combobox", { name: "Event type", exact: true })
    .selectOption("incidents");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ended", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").locator("tbody tr").first(),
  ).toBeVisible();
  await page.locator(".event-row-title").first().click();
  await expect(page.locator(".event-inspection")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Licence", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".event-inspection")).toHaveCount(0);
  await expect(page.locator(".event-row-title").first()).toBeFocused();
});

test("Sources & health exposes real collector rows and error provenance", async ({
  page,
}) => {
  await page.goto("/?view=sources");
  await expect(
    page.getByRole("heading", { name: "Sources & health" }),
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Sources & health" });
  await expect(table.locator("tbody tr")).toHaveCount(9);
  await table.locator("tbody button").first().click();
  await expect(page.getByText("Last error", { exact: true })).toBeVisible();
  await expect(page.getByText("Licence", { exact: true })).toBeVisible();
});

test("scope changes retain the URL and distinguish historical data", async ({
  page,
}) => {
  await page.goto("/?view=weather&city=helsinki");
  await openScope(page);
  await page
    .getByRole("button", { name: /^Selected date:/ })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Available historical data" }),
  ).toBeVisible();
  const day = page
    .locator(".date-calendar-day-has-data")
    .filter({ visible: true })
    .first();
  await day.click();
  await expect(page).toHaveURL(/date=2026-/);
  await expect(
    page
      .locator(".mobile-mode-strip, .context-scope")
      .filter({ visible: true }),
  ).toContainText("Historical");
});

test("unsupported scopes explain missing data and never borrow Helsinki recommendations", async ({
  page,
}) => {
  await page.goto("/?city=oulu");
  await expect(page.locator(".scope-limited-notice")).toBeVisible();
  await expect(page.locator(".home-decision")).not.toContainText(
    "Leave a few minutes earlier",
  );
});

test("sidebar owns preferences and persists its compact rail", async ({
  page,
}, info) => {
  await page.goto("/");
  await openNavigation(page);
  await page
    .getByRole("button", { name: "Switch to night theme", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "中文", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-language", "zh");
  if (info.project.name === "chromium") {
    await page.locator(".side-nav-collapse-button").click();
    await page.reload();
    await expect(page.locator(".dashboard-side-nav")).toHaveClass(
      /dashboard-side-nav-hidden/,
    );
    await expect(page.locator(".dashboard-side-nav")).toHaveCSS(
      "width",
      "56px",
    );
  }
});

test("command search navigates and keyboard shortcuts preserve scope", async ({
  page,
}, info) => {
  await page.goto("/?city=helsinki", { waitUntil: "networkidle" });
  if (info.project.name.includes("mobile")) {
    await openNavigation(page);
    await page.locator(".side-nav-search").click();
  } else await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Search ArkiWatch" });
  await expect(palette).toBeVisible();
  await palette.getByRole("textbox").fill("Weather");
  await palette.getByRole("button", { name: "Weather", exact: true }).click();
  await expect(page).toHaveURL(/view=weather/);
  await expect(page).toHaveURL(/city=helsinki/);
  if (info.project.name === "chromium") {
    await page.keyboard.press("g");
    await page.keyboard.press("s");
    await expect(page).toHaveURL(/view=sources/);
  }
});

test("assistant keeps data operable in a desktop dock and traps focus only on smaller screens", async ({
  page,
}, info) => {
  if (info.project.name === "chromium")
    await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=weather");
  await openAssistant(page);
  const panel = page.locator(".assistant-panel");
  await expect(panel).toBeVisible();
  if (info.project.name === "chromium") {
    await expect(panel).not.toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".dashboard-app")).not.toHaveAttribute("inert");
    await page
      .locator(".workspace-main-chart")
      .getByRole("button", { name: "7d", exact: true })
      .click();
    await expect(panel).toBeVisible();
    const resize = page.getByRole("separator", {
      name: "Resize assistant panel",
    });
    await resize.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(resize).toHaveAttribute("aria-valuenow", "440");
  } else {
    await expect(panel).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".dashboard-app")).toHaveAttribute("inert");
  }
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("contextual Ask prefills a string and preserves the conversation through citations", async ({
  page,
}, info) => {
  if (info.project.name === "chromium")
    await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ask about this", exact: true })
    .click();
  const input = page.locator(".assistant-panel input");
  await expect(input).toHaveValue("Leave a few minutes earlier");
  await input.fill("Explain weather");
  await input.press("Enter");
  await expect(
    page.locator(".assistant-turn-assistant").last(),
  ).not.toContainText("[object Object]");
  const citation = page.getByRole("button", { name: "Open Weather workspace" });
  await expect(citation).toBeVisible();
  await citation.click();
  await expect(page).toHaveURL(/view=weather/);
  if (info.project.name === "chromium") {
    await expect(page.locator(".assistant-panel")).toBeVisible();
    await expect(page.locator("[data-citation-highlight]")).toBeVisible();
  }
});

test("notifications preserve the workspace and return focus on close", async ({
  page,
}) => {
  await page.goto("/?view=energy");
  const trigger = page
    .getByRole("button", { name: /^Open recent events/ })
    .filter({ visible: true });
  await trigger.click();
  await expect(page.locator(".events-inbox")).toBeVisible();
  await expect(page).toHaveURL(/view=energy/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".events-inbox")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("optional context opens an editor boundary without interrupting the first visit", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("dialog").filter({ visible: true })).toHaveCount(
    0,
  );
  if (info.project.name === "chromium") {
    await page
      .getByRole("button", { name: "Edit context", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Edit context" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("dialog", { name: "Edit context" })
        .getByRole("link", { name: "Admin sign in" }),
    ).toHaveAttribute("href", "/login");
  }
  await page.goto("/plan");
  await expect(
    page.getByRole("heading", { name: "Your day", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".home-metrics")).toHaveCount(0);
  await expect(
    page.getByText("Build your day around your context", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit context", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit context" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/plan/);
});

for (const language of ["en", "zh"]) {
  test(`console routes stay inside narrow screens in ${language}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/");
    await page.evaluate(
      (l) => localStorage.setItem("arkiwatch-language", l),
      language,
    );
    for (const route of ["overview", ...routes, "events", "sources"]) {
      await page.goto(`/?view=${route}`);
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator("#main-content")).not.toContainText(
        /shell\.[a-zA-Z]|weather\.[a-zA-Z]/,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
    }
  });
}

test("no hydration errors or automated WCAG A/AA violations on the new surfaces", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const theme of ["light", "dark"]) {
    await page.goto("/");
    await page.evaluate(
      (t) => localStorage.setItem("arkiwatch-theme", t),
      theme,
    );
    for (const route of ["overview", "weather", "air", "events", "sources"]) {
      await page.goto(`/?view=${route}`, { waitUntil: "networkidle" });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(results.violations, `${theme} ${route}`).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});

test("snapshot export and per-reading Ask carry the selected data", async ({
  page,
}) => {
  await page.goto("/?view=air");
  await page.getByText("•••", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download public snapshot", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/arkiwatch-.*\.json$/);
  await page.getByText("•••", { exact: true }).click();
  await page
    .getByRole("table", { name: "Breakdown" })
    .getByRole("button", { name: "Ask about this", exact: true })
    .first()
    .click();
  await expect(page.locator(".assistant-panel input")).toHaveValue(
    /Air quality.*kallio/,
  );
});

test("event deep links keep evidence targets and the main heading unique", async ({
  page,
}) => {
  await page.goto("/");
  const notifications = page
    .getByRole("button", { name: /^Open recent events/ })
    .filter({ visible: true });
  await notifications.click();
  await page.locator(".inbox-item-button").first().click();
  await page.locator(".inbox-detail-footer button").click();
  await expect(page).toHaveURL(/event=/);
  await expect(page.locator("main h1")).toHaveCount(1);
  const duplicateIds = await page.locator("[id]").evaluateAll((nodes) => {
    const ids = nodes.map((node) => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
});

test("evidence links preserve date and city and select the provider drawer", async ({
  page,
}) => {
  await page.goto("/?view=weather&city=helsinki&date=2026-08-08");
  await page
    .locator(".workspace-kpis > article")
    .first()
    .getByRole("button", { name: "View evidence", exact: true })
    .click();
  await page.getByRole("link", { name: "Source page →", exact: true }).click();
  await expect(page).toHaveURL(/view=sources/);
  const url = new URL(page.url());
  expect(url.searchParams.get("source")).toBe("fmi");
  expect(url.searchParams.get("city")).toBe("helsinki");
  expect(url.searchParams.get("date")).toBe("2026-08-08");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "Finnish Meteorological",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page).not.toHaveURL(/source=fmi/);
});

test("Energy provider changes the primary reading, trend and breakdown together", async ({
  page,
}) => {
  await page.goto("/?view=energy");
  const price = await page
    .locator(".workspace-kpis > article")
    .first()
    .innerText();
  await expect(page.getByRole("table", { name: "Breakdown" })).toContainText(
    "PORSSISAHKO",
  );
  await page
    .getByRole("button", { name: "Fingrid system", exact: true })
    .click();
  await expect(page).toHaveURL(/energyTab=fingrid/);
  await expect(
    page.locator(".workspace-kpis > article").first(),
  ).not.toHaveText(price);
  await expect(page.getByRole("table", { name: "Breakdown" })).toContainText(
    "FINGRID",
  );
  await expect(
    page.getByRole("table", { name: "Breakdown" }),
  ).not.toContainText("PORSSISAHKO");
  await page
    .getByRole("button", { name: "Household prices", exact: true })
    .click();
  await expect(page.getByRole("table", { name: "Breakdown" })).toContainText(
    "PORSSISAHKO",
  );
});

test("event lifecycle and provider filters compose and export their visible results", async ({
  page,
}) => {
  await page.goto("/?view=events");
  const provider = page.getByRole("combobox", {
    name: "Provider",
    exact: true,
  });
  const source = await provider.locator("option").nth(1).getAttribute("value");
  await provider.selectOption(source!);
  const rows = page
    .getByRole("table", { name: "Events", exact: true })
    .locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  await expect
    .poll(async () => {
      const providers = await rows.locator("td:last-child").allTextContents();
      return (
        providers.length > 0 &&
        providers.every((text) => text.includes(source!.toUpperCase()))
      );
    })
    .toBe(true);
  await page.getByRole("button", { name: "Ended", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ended", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByText("•••", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("events.csv");
});
