import { expect, test } from "@playwright/test";

import { createMockOrder } from "./fixtures";

test("live orders list refreshes from polling without manual reload", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("admin-orders-filters-v1");
    window.localStorage.removeItem("admin-waiter-calls-v2");
    window.sessionStorage.removeItem("admin-orders-cache-v1");
  });

  const snapshots = [
    [createMockOrder({ id: "order-first", tableNumber: 1 })],
    [createMockOrder({ id: "order-second", tableNumber: 8 })]
  ];

  let getOrdersCallCount = 0;

  await page.route("**/api/orders", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    const snapshotIndex = Math.min(getOrdersCallCount, snapshots.length - 1);
    const body = JSON.stringify(snapshots[snapshotIndex]);
    getOrdersCallCount += 1;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body
    });
  });

  await page.goto("/admin/orders");

  await expect(page.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Table 8" })).toHaveCount(0);

  await expect
    .poll(() => getOrdersCallCount, { timeout: 12_000 })
    .toBeGreaterThan(1);

  await expect(page.getByRole("heading", { name: "Table 8" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Table 1" })).toHaveCount(0);
});
