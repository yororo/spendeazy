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
