import { expect, Page, test } from "@playwright/test";

import { createMockOrder } from "./fixtures";

type OrderRecord = ReturnType<typeof createMockOrder>;

function cloneOrders(input: OrderRecord[]) {
  return input.map((order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item }))
  }));
}

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

test.describe("Restaurant order scoping", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      process.env.E2E_USE_WEB_SERVER !== "true",
      "Run in local mode (E2E_USE_WEB_SERVER=true) to validate restaurant data isolation."
    );

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await setupAdminAuth(page);
  });

  test("SCOPE-01 each restaurant waiter page reads only its own orders", async ({
    page
  }) => {
    const ordersByRestaurant: Record<string, OrderRecord[]> = {
      "olive-bistro": [
        createMockOrder({
          id: "olive-order-1",
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 11,
          items: [
            {
              id: "olive-item-1",
              menuItemId: "olive-menu-1",
              name: "Olive only dish",
              category: "mains",
              price: 64,
              quantity: 1,
              served: false
            }
          ],
          total: 64
        })
      ],
      beerabar: [
        createMockOrder({
          id: "beer-order-1",
          restaurantSlug: "beerabar",
          restaurantName: "BeeraBar",
          tableNumber: 22,
          items: [
            {
              id: "beer-item-1",
              menuItemId: "beer-menu-1",
              name: "Beer only dish",
              category: "mains",
              price: 52,
              quantity: 1,
              served: false
            }
          ],
          total: 52
        })
      ]
    };

    const seenGetSlugs: string[] = [];

    await page.route("**/api/orders**", async (route, request) => {
      if (request.method() !== "GET") {
        await route.continue();
        return;
      }

      const url = new URL(request.url());
      const restaurantSlug = (url.searchParams.get("restaurantSlug") ?? "").toLowerCase();
      seenGetSlugs.push(restaurantSlug);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(cloneOrders(ordersByRestaurant[restaurantSlug] ?? []))
      });
    });

    await page.goto("/olive-bistro/waiter/orders");
    await expect(page.getByText("Olive only dish")).toBeVisible();
    await expect(page.getByText("Beer only dish")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Incoming orders|Counter queue/i })).toBeVisible();
    expect(seenGetSlugs).toContain("olive-bistro");

    await page.goto("/beerabar/waiter/orders");
    await expect(page.getByText("Beer only dish")).toBeVisible();
    await expect(page.getByText("Olive only dish")).toHaveCount(0);
    expect(seenGetSlugs).toContain("beerabar");
  });

  test("SCOPE-02 status change is written only inside current restaurant scope", async ({
    page
  }) => {
    const ordersByRestaurant: Record<string, OrderRecord[]> = {
      "olive-bistro": [
        createMockOrder({
          id: "olive-order-2",
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 7,
          items: [
            {
              id: "olive-item-2",
              menuItemId: "olive-menu-2",
              name: "Scope patch dish",
              category: "mains",
              price: 44,
              quantity: 1,
              served: false
            }
          ],
          total: 44
        })
      ],
      beerabar: [
        createMockOrder({
          id: "beer-order-2",
          restaurantSlug: "beerabar",
          restaurantName: "BeeraBar",
          tableNumber: 8,
          items: [
            {
              id: "beer-item-2",
              menuItemId: "beer-menu-2",
              name: "Beer untouched dish",
              category: "mains",
              price: 51,
              quantity: 1,
              served: false
            }
          ],
          total: 51
        })
      ]
    };
    const seenPatchSlugs: string[] = [];

    await page.route("**/api/orders**", async (route, request) => {
      const url = new URL(request.url());
      const restaurantSlug = (url.searchParams.get("restaurantSlug") ?? "").toLowerCase();

      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(cloneOrders(ordersByRestaurant[restaurantSlug] ?? []))
        });
        return;
      }

      if (request.method() === "PATCH") {
        seenPatchSlugs.push(restaurantSlug);
        const payload = request.postDataJSON() as { orderId?: string; status?: string };
        const scopedOrders = ordersByRestaurant[restaurantSlug] ?? [];
        const targetIndex = scopedOrders.findIndex((order) => order.id === payload.orderId);

        if (targetIndex < 0 || payload.status !== "served") {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ message: "Invalid scoped patch payload" })
          });
          return;
        }

        const target = scopedOrders[targetIndex];
        const updatedOrder = {
          ...target,
          status: "served" as const,
          updatedAt: new Date().toISOString()
        };
        scopedOrders[targetIndex] = updatedOrder;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(updatedOrder)
        });
        return;
      }

      await route.continue();
    });

    await page.goto("/olive-bistro/waiter/orders");
    await expect(page.getByText("Scope patch dish")).toBeVisible();

    await page.getByRole("button", { name: "Served" }).first().click();
    await expect(page.getByText("Scope patch dish")).toHaveCount(0);
    expect(seenPatchSlugs).toContain("olive-bistro");
    expect(seenPatchSlugs).not.toContain("beerabar");

    await page.goto("/beerabar/waiter/orders");
    await expect(page.getByText("Beer untouched dish")).toBeVisible();
  });

  test("SCOPE-03 tables page and range export read only current restaurant data", async ({
    page
  }) => {
    const seenTablesSlugs: string[] = [];
    const seenOrdersSlugs: string[] = [];
    const seenSettingsSlugs: string[] = [];
    const seenArchiveSlugs: string[] = [];

    await page.route("**/api/menu-settings**", async (route, request) => {
      if (request.method() !== "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      const url = new URL(request.url());
      seenSettingsSlugs.push(url.searchParams.get("restaurantSlug") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workingHoursFrom: "09:00",
          workingHoursRules: [],
          happyHourEnabled: false,
          happyHourDiscountPercent: 0,
          happyHourCategories: [],
          happyHourStartsFrom: null,
          happyHourUntil: null,
          orderMode: "tables"
        })
      });
    });

    await page.route("**/api/orders", async (route, request) => {
      if (request.method() !== "GET") {
        await route.continue();
        return;
      }

      const url = new URL(request.url());
      seenOrdersSlugs.push(url.searchParams.get("restaurantSlug") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
    });

    await page.route("**/api/tables", async (route, request) => {
      if (request.method() !== "GET") {
        await route.continue();
        return;
      }

      const url = new URL(request.url());
      seenTablesSlugs.push(url.searchParams.get("restaurantSlug") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tables: [],
          closedSessions: []
        })
      });
    });

    await page.route("**/api/orders-archive**", async (route, request) => {
      const url = new URL(request.url());
      seenArchiveSlugs.push(url.searchParams.get("restaurantSlug") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          start: url.searchParams.get("start"),
          end: url.searchParams.get("end"),
          closedTableSummaries: []
        })
      });
    });

    await page.goto("/olive-bistro/waiter/tables");
    await expect(page.getByRole("heading", { name: "Closed tables" })).toBeVisible();
    expect(seenTablesSlugs).toContain("olive-bistro");
    expect(seenOrdersSlugs).toContain("olive-bistro");
    expect(seenSettingsSlugs).toContain("olive-bistro");

    await page.getByRole("button", { name: /^Download / }).first().click();
    await expect.poll(() => seenArchiveSlugs.length).toBeGreaterThan(0);
    expect(seenArchiveSlugs).toContain("olive-bistro");
  });
});
