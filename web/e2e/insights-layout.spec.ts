import { expect, test } from "@playwright/test";

test("keeps desktop Insights scrolling inside the content pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/insights");

  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
  await page.getByRole("button", { name: "Monthly view" }).click();
  await expect(
    page.getByRole("heading", { name: "Frequently over Budget" }),
  ).toBeVisible();

  const layout = await page.evaluate(() => {
    const pageScroller = document.querySelector(".mobile-navigation-content");
    const sidebar = document.querySelector(
      'aside nav[aria-label="Primary navigation"]',
    )?.closest("aside");
    const navigation = sidebar?.querySelector(
      'nav[aria-label="Primary navigation"]',
    );

    if (!pageScroller || !sidebar || !navigation) {
      throw new Error("The desktop application layout was not rendered.");
    }

    return {
      documentOverflowY: getComputedStyle(document.documentElement).overflowY,
      pageOverflowY: getComputedStyle(pageScroller).overflowY,
      pageScrollHeight: pageScroller.scrollHeight,
      pageClientHeight: pageScroller.clientHeight,
      navigationScrollHeight: navigation.scrollHeight,
      navigationClientHeight: navigation.clientHeight,
      sidebarBottom: sidebar.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(layout.documentOverflowY).toBe("hidden");
  expect(layout.pageOverflowY).toBe("auto");
  expect(layout.pageScrollHeight).toBeGreaterThan(layout.pageClientHeight);
  expect(layout.navigationScrollHeight).toBeLessThanOrEqual(
    layout.navigationClientHeight,
  );
  expect(layout.sidebarBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
});

test("fits rolling-month Category trend labels across desktop and mobile plot widths", async ({
  page,
  request,
}) => {
  const testClock =
    process.env.SPENDEAZY_E2E_TEST_CLOCK ?? "2026-09-19T12:00:00.000Z";
  const purchaseDate =
    process.env.SPENDEAZY_E2E_TEST_DATE ?? testClock.slice(0, 10);
  const apiBaseUrl = requireEnvironment("SPENDEAZY_E2E_API_BASE_URL");
  const token = requireEnvironment("VITE_LOCAL_TEST_SESSION_TOKEN");
  await page.clock.install({ time: testClock });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/categories");
  await expect(
    page.getByRole("heading", { name: "Budget overview" }),
  ).toBeVisible();

  const authorizationHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const categoriesResponse = await request.get(
    `${apiBaseUrl}/api/v1/users/me/categories`,
    { headers: authorizationHeaders },
  );
  expect(categoriesResponse.status()).toBe(200);
  const categories = (await categoriesResponse.json()) as readonly {
    readonly id?: unknown;
  }[];
  const categoryId = categories[0]?.id;
  if (typeof categoryId !== "string") {
    throw new Error("The local test User has no Category for the chart fixture.");
  }

  const transactionResponse = await request.post(
    `${apiBaseUrl}/api/v1/users/me/transactions`,
    {
      headers: { ...authorizationHeaders, "Content-Type": "application/json" },
      data: {
        purchaseDate,
        description: "Insights chart layout fixture",
        amount: "123.45",
        categoryId,
      },
    },
  );
  expect(transactionResponse.status()).toBe(201);
  const transaction = (await transactionResponse.json()) as {
    readonly id?: unknown;
  };
  if (typeof transaction.id !== "string") {
    throw new Error("The local test API did not return the chart fixture ID.");
  }

  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
  await page.getByRole("button", { name: "Monthly view" }).click();
  await expect(
    page.getByRole("table", { name: /category spending values/i }),
  ).toBeVisible();

  const axisLabels = page.getByTestId("insights-category-trend-month-labels");
  await expect(axisLabels).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await axisLabels.evaluate((element) => {
      const chart = element.parentElement;
      const plot = chart?.querySelector(
        ":scope > div.absolute > div.relative.min-w-0.flex-1",
      );

      if (!plot) {
        throw new Error("The Category trend plot was not rendered.");
      }

      const visibleLabels = Array.from(element.children).map((month) => {
        const label = Array.from(month.children).find(
          (child) => child.getClientRects().length > 0,
        );

        if (!label) {
          throw new Error("A rolling-month label was not rendered.");
        }

        const rect = label.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      const labelsRect = element.getBoundingClientRect();
      const plotRect = plot.getBoundingClientRect();

      return {
        labelsLeft: labelsRect.left,
        labelsRight: labelsRect.right,
        plotLeft: plotRect.left,
        plotRight: plotRect.right,
        visibleLabels,
      };
    });

    expect(layout.labelsLeft).toBeCloseTo(layout.plotLeft, 0);
    expect(layout.labelsRight).toBeCloseTo(layout.plotRight, 0);
    expect(layout.visibleLabels).toHaveLength(12);
    for (let index = 1; index < layout.visibleLabels.length; index += 1) {
      expect(layout.visibleLabels[index]!.left).toBeGreaterThanOrEqual(
        layout.visibleLabels[index - 1]!.right - 0.5,
      );
    }
  }

  const deleteResponse = await request.delete(
    `${apiBaseUrl}/api/v1/users/me/transactions/${transaction.id}`,
    { headers: authorizationHeaders },
  );
  expect(deleteResponse.status()).toBe(204);
});

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
