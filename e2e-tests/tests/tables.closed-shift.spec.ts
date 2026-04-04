import { expect, test } from "@playwright/test";

type ClosedSession = {
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  sessionId: number;
  closedAt: string;
  total: number;
  orderCount: number;
  orderIds: string[];
  orders: Array<{
    id: string;
    createdAt: string;
    items: Array<{
      id: string;
      menuItemId: string;
      name: string;
      category: string;
      price: number;
      quantity: number;
      served: boolean;
    }>;
  }>;
};

function createClosedSession(input: {
  tableNumber: number;
  sessionId: number;
  closedAt: string;
  total: number;
  itemName: string;
}): ClosedSession {
  return {
    restaurantSlug: "olive-bistro",
    restaurantName: "Olive Bistro",
    tableNumber: input.tableNumber,
    sessionId: input.sessionId,
    closedAt: input.closedAt,
    total: input.total,
    orderCount: 1,
    orderIds: [`order-${input.sessionId}`],
    orders: [
      {
        id: `order-${input.sessionId}`,
        createdAt: input.closedAt,
        items: [
          {
            id: `item-${input.sessionId}`,
            menuItemId: "menu-item-1",
            name: input.itemName,
            category: "mains",
            price: input.total,
            quantity: 1,
            served: true
          }
        ]
      }
    ]
  };
}

function getShiftStartForWorkingHours(from: string) {
  const now = new Date();
  const [hours, minutes] = from.split(":").map((value) => Number.parseInt(value, 10));
  const shiftStart = new Date(now);
  shiftStart.setHours(hours, minutes, 0, 0);

  if (now.getTime() < shiftStart.getTime()) {
    shiftStart.setDate(shiftStart.getDate() - 1);
  }

  return shiftStart;
}

test("closed tables list shows only current shift sessions", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("admin-tables-overview-cache-v1");
    window.sessionStorage.removeItem("admin-tables-overview-cache-v1");
    window.sessionStorage.removeItem("admin-tables-archives-cache-v1");
  });

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

  const workingHoursFrom = "09:00";
  const shiftStart = getShiftStartForWorkingHours(workingHoursFrom);
  const previousShiftClosedAt = new Date(
    shiftStart.getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const currentShiftClosedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  await page.route("**/api/menu-settings**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workingHoursFrom,
        workingHoursRules: [],
        happyHourEnabled: false,
        happyHourDiscountPercent: 0,
        happyHourCategories: [],
        happyHourStartsFrom: null,
        happyHourUntil: null
      })
    });
  });

  await page.route("**/api/orders", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route("**/api/orders-archive**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ archives: [] })
    });
  });

  await page.route("**/api/tables", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tables: [],
        closedSessions: [
          createClosedSession({
            tableNumber: 11,
            sessionId: 111,
            closedAt: previousShiftClosedAt,
            total: 44,
            itemName: "Previous shift item"
          }),
          createClosedSession({
            tableNumber: 22,
            sessionId: 222,
            closedAt: currentShiftClosedAt,
            total: 88,
            itemName: "Current shift item"
          })
        ]
      })
    });
  });

  await page.goto("/admin/tables");

  await expect(page.getByRole("heading", { name: "Closed tables" })).toBeVisible();
  await expect(page.locator(".closed-grid article.info-card h2", { hasText: "Table 22" })).toHaveCount(1);
  await expect(page.locator(".closed-grid article.info-card h2", { hasText: "Table 11" })).toHaveCount(0);
});
