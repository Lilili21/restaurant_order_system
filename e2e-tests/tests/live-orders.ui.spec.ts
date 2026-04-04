import { expect, test } from "@playwright/test";

import { createMockOrder } from "./fixtures";

test.describe("Live Orders UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("admin-orders-filters-v1");
      window.localStorage.removeItem("admin-waiter-calls-v2");
      window.sessionStorage.removeItem("admin-orders-cache-v1");
    });

    await page.route("**/api/orders", async (route, request) => {
      if (request.method() !== "GET") {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([createMockOrder()])
      });
    });
  });

  test("renames Hall button to Floor and keeps top chips larger", async ({ page }) => {
    await page.goto("/admin/orders");

    const floorButton = page.getByRole("button", { name: "Floor" });
    const allTablesButton = page.getByRole("button", { name: "All tables" });

    await expect(floorButton).toBeVisible();
    await expect(page.getByRole("button", { name: "Hall" })).toHaveCount(0);
    await expect(allTablesButton).toBeVisible();

    const floorHeight = await floorButton.evaluate((element) =>
      Math.round(element.getBoundingClientRect().height)
    );
    const allTablesHeight = await allTablesButton.evaluate((element) =>
      Math.round(element.getBoundingClientRect().height)
    );

    expect(floorHeight).toBeGreaterThan(allTablesHeight);
  });
});
