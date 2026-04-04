import { expect, Page, test } from "@playwright/test";

import { createMockOrder } from "./fixtures";

type MockOrder = ReturnType<typeof createMockOrder>;

async function setupAdminAuth(page: Page) {
  await page.route("**/api/admin-auth**", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authorized: true })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });
}

async function clearAdminOrdersCache(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem("admin-orders-filters-v1");
    window.localStorage.removeItem("admin-waiter-calls-v2");
    window.sessionStorage.removeItem("admin-orders-cache-v1");
  });
}

async function setupOrdersApi(
  page: Page,
  options: {
    snapshots: MockOrder[][];
    onPatch?: (payload: Record<string, unknown>) => {
      status: number;
      body: unknown;
    };
  }
) {
  let getOrdersCallCount = 0;
  const patchPayloads: Array<Record<string, unknown>> = [];

  await page.route("**/api/orders", async (route, request) => {
    if (request.method() === "GET") {
      const snapshotIndex = Math.min(
        getOrdersCallCount,
        Math.max(options.snapshots.length - 1, 0)
      );
      const snapshot = options.snapshots[snapshotIndex] ?? [];
      getOrdersCallCount += 1;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(snapshot)
      });
      return;
    }

    if (request.method() === "PATCH") {
      const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      patchPayloads.push(payload);

      const result = options.onPatch
        ? options.onPatch(payload)
        : { status: 200, body: { ok: true } };

      await route.fulfill({
        status: result.status,
        contentType: "application/json",
        body: JSON.stringify(result.body)
      });
      return;
    }

    await route.continue();
  });

  return {
    getOrdersCallCount: () => getOrdersCallCount,
    patchPayloads
  };
}

function withOffset(minutesOffset: number) {
  return new Date(Date.now() + minutesOffset * 60_000).toISOString();
}

test.describe("Live Orders expanded top-10", () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page);
    await clearAdminOrdersCache(page);
  });

  test("LIVE-01 list loads and shows incoming order", async ({ page }) => {
    await setupOrdersApi(page, {
      snapshots: [[createMockOrder({ id: "live-01", tableNumber: 1 })]]
    });

    await page.goto("/admin/orders");

    await expect(page.getByRole("heading", { name: "Table 1" })).toBeVisible();
    await expect(page.getByText("No incoming orders yet.")).toHaveCount(0);
  });

  test("LIVE-02 dish order appears in Kitchen zone", async ({ page }) => {
    const dishOrder = createMockOrder({
      id: "live-02-dish",
      tableNumber: 2,
      items: [
        {
          id: "dish-item-1",
          menuItemId: "dish-item-1",
          name: "Dish item",
          category: "mains",
          price: 42,
          quantity: 1,
          served: false
        }
      ]
    });

    await setupOrdersApi(page, {
      snapshots: [[dishOrder]]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Kitchen" }).click();

    await expect(page.getByRole("heading", { name: "Table 2" })).toBeVisible();
  });

  test("LIVE-03 drink order appears in Bar zone and not in Kitchen zone", async ({ page }) => {
    const drinkOrder = createMockOrder({
      id: "live-03-drink",
      tableNumber: 3,
      items: [
        {
          id: "drink-item-1",
          menuItemId: "drink-item-1",
          name: "Drink item",
          category: "drinks",
          price: 30,
          quantity: 1,
          served: false
        }
      ]
    });

    await setupOrdersApi(page, {
      snapshots: [[drinkOrder]]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Kitchen" }).click();
    await expect(page.getByRole("heading", { name: "Table 3" })).toHaveCount(0);

    await page.getByRole("button", { name: "Bar" }).click();
    await expect(page.getByRole("heading", { name: "Table 3" })).toBeVisible();
  });

  test("LIVE-04 switching filters does not lose or duplicate orders", async ({ page }) => {
    const dishOrder = createMockOrder({
      id: "live-04-dish",
      tableNumber: 4,
      items: [
        {
          id: "dish-item-4",
          menuItemId: "dish-item-4",
          name: "Dish 4",
          category: "mains",
          price: 40,
          quantity: 1,
          served: false
        }
      ]
    });
    const drinkOrder = createMockOrder({
      id: "live-04-drink",
      tableNumber: 5,
      items: [
        {
          id: "drink-item-5",
          menuItemId: "drink-item-5",
          name: "Drink 5",
          category: "drinks",
          price: 22,
          quantity: 1,
          served: false
        }
      ]
    });

    await setupOrdersApi(page, {
      snapshots: [[dishOrder, drinkOrder]]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Kitchen" }).click();
    await expect(page.getByRole("heading", { name: "Table 4" })).toHaveCount(1);

    await page.getByRole("button", { name: "Bar" }).click();
    await expect(page.getByRole("heading", { name: "Table 5" })).toHaveCount(1);

    await page.getByRole("button", { name: "Floor" }).click();
    await expect(page.getByRole("heading", { name: "Table 4" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Table 5" })).toHaveCount(1);
  });

  test("LIVE-05 polling updates list without manual reload", async ({ page }) => {
    const snapshots = [
      [createMockOrder({ id: "live-05-first", tableNumber: 6 })],
      [
        createMockOrder({ id: "live-05-first", tableNumber: 6 }),
        createMockOrder({ id: "live-05-second", tableNumber: 7 })
      ]
    ];

    const tracker = await setupOrdersApi(page, { snapshots });

    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: "Table 6" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Table 7" })).toHaveCount(0);

    await expect
      .poll(() => tracker.getOrdersCallCount(), { timeout: 12_000 })
      .toBeGreaterThan(1);

    await expect(page.getByRole("heading", { name: "Table 7" })).toBeVisible();
  });

  test("LIVE-06 repeated polling does not create duplicate cards", async ({ page }) => {
    const singleOrder = createMockOrder({ id: "live-06", tableNumber: 8 });

    const tracker = await setupOrdersApi(page, {
      snapshots: [[singleOrder], [singleOrder], [singleOrder]]
    });

    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: "Table 8" })).toHaveCount(1);

    await expect
      .poll(() => tracker.getOrdersCallCount(), { timeout: 12_000 })
      .toBeGreaterThan(2);

    await expect(page.getByRole("heading", { name: "Table 8" })).toHaveCount(1);
    await expect(page.locator("article.order-card")).toHaveCount(1);
  });

  test("LIVE-07 older orders are displayed above newer ones", async ({ page }) => {
    const older = createMockOrder({
      id: "live-07-old",
      tableNumber: 9,
      createdAt: withOffset(-60),
      updatedAt: withOffset(-60)
    });
    const newer = createMockOrder({
      id: "live-07-new",
      tableNumber: 10,
      createdAt: withOffset(-1),
      updatedAt: withOffset(-1)
    });

    await setupOrdersApi(page, {
      snapshots: [[older, newer]]
    });

    await page.goto("/admin/orders");

    const firstCardTitle = page.locator("article.order-card h3").first();
    const lastCardTitle = page.locator("article.order-card h3").last();
    await expect(firstCardTitle).toContainText("Table 9");
    await expect(lastCardTitle).toContainText("Table 10");
  });

  test("LIVE-08 kitchen timers show New / On time / Late correctly", async ({ page }) => {
    const orderNew = createMockOrder({
      id: "live-08-new",
      tableNumber: 12,
      createdAt: withOffset(-1),
      updatedAt: withOffset(-1)
    });
    const orderOnTime = createMockOrder({
      id: "live-08-on-time",
      tableNumber: 13,
      createdAt: withOffset(-5),
      updatedAt: withOffset(-5)
    });
    const orderLate = createMockOrder({
      id: "live-08-late",
      tableNumber: 14,
      createdAt: withOffset(-12),
      updatedAt: withOffset(-12)
    });

    await setupOrdersApi(page, {
      snapshots: [[orderNew, orderOnTime, orderLate]]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Kitchen" }).click();

    await expect(page.locator(".order-kitchen-timer__status--neutral")).toHaveCount(1);
    await expect(page.locator(".order-kitchen-timer__status--orange")).toHaveCount(1);
    await expect(page.locator(".order-kitchen-timer__status--danger")).toHaveCount(1);
  });

  test("LIVE-09 failed status PATCH keeps order visible", async ({ page }) => {
    const order = createMockOrder({
      id: "live-09-order",
      tableNumber: 15
    });

    await setupOrdersApi(page, {
      snapshots: [[order]],
      onPatch: () => ({
        status: 500,
        body: { message: "Failed to update order status" }
      })
    });

    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: "Table 15" })).toBeVisible();

    await page.getByRole("button", { name: "Served" }).click();
    await expect(page.getByRole("heading", { name: "Table 15" })).toBeVisible();
  });

  test("LIVE-10 successful Served action removes order from list", async ({ page }) => {
    const order = createMockOrder({
      id: "live-10-order",
      tableNumber: 16
    });

    await setupOrdersApi(page, {
      snapshots: [[order]],
      onPatch: (payload) => ({
        status: 200,
        body: {
          ...order,
          status: String(payload.status ?? "served"),
          updatedAt: new Date().toISOString()
        }
      })
    });

    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: "Table 16" })).toBeVisible();

    await page.getByRole("button", { name: "Served" }).click();
    await expect(page.getByRole("heading", { name: "Table 16" })).toHaveCount(0);
    await expect(page.getByText("No incoming orders yet.")).toBeVisible();
  });
});
