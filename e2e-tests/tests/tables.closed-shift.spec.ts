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

  await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
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

  await page.route("**/api/tables**", async (route, request) => {
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

test("closed tables list does not show duplicate cards for the same closed session", async ({
  page
}) => {
  test.skip(
    process.env.E2E_USE_WEB_SERVER !== "true",
    "Run in local mode (E2E_USE_WEB_SERVER=true) to verify duplicate-guard against latest frontend code."
  );

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

  await page.route("**/api/menu-settings**", async (route) => {
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
        happyHourUntil: null
      })
    });
  });

  await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
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

  const sharedClosedAt = new Date().toISOString();
  const duplicateClosedAt = sharedClosedAt.replace("Z", "+00:00");

  await page.route("**/api/tables**", async (route, request) => {
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
            tableNumber: 33,
            sessionId: 333,
            closedAt: sharedClosedAt,
            total: 96,
            itemName: "Closed item A"
          }),
          createClosedSession({
            tableNumber: 33,
            sessionId: 333,
            closedAt: duplicateClosedAt,
            total: 96,
            itemName: "Closed item A duplicate"
          })
        ]
      })
    });
  });

  await page.goto("/admin/tables");

  await expect(page.getByRole("heading", { name: "Closed tables" })).toBeVisible();
  await expect(page.locator(".closed-grid article.info-card h2", { hasText: "Table 33" })).toHaveCount(1);
});

test("tables view keeps existing tables when a polling request fails", async ({ page }) => {
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

  await page.route("**/api/menu-settings**", async (route) => {
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
        happyHourUntil: null
      })
    });
  });

  await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
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

  let tablesCalls = 0;
  await page.route("**/api/tables**", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    tablesCalls += 1;

    if (tablesCalls === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tables: [
            {
              restaurantSlug: "olive-bistro",
              restaurantName: "Olive Bistro",
              tableNumber: 44,
              currentSessionId: 4401,
              orderCount: 1,
              total: 54,
              statuses: ["new"],
              orders: [
                {
                  id: "order-44",
                  restaurantSlug: "olive-bistro",
                  restaurantName: "Olive Bistro",
                  tableNumber: 44,
                  sessionId: 4401,
                  status: "new",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  total: 54,
                  kind: "order",
                  items: [
                    {
                      id: "item-44",
                      menuItemId: "menu-item-44",
                      name: "Shawarma plate",
                      category: "mains",
                      price: 54,
                      quantity: 1,
                      served: false
                    }
                  ]
                }
              ]
            }
          ],
          closedSessions: []
        })
      });
      return;
    }

    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Temporary failure" })
    });
  });

  await page.goto("/admin/tables");
  await expect(page.locator(".tables-grid h3", { hasText: "Table 44" })).toBeVisible();

  await page.waitForTimeout(4500);
  await expect(page.locator(".tables-grid h3", { hasText: "Table 44" })).toBeVisible();
});

test("closed tables list hides empty sessions without order items", async ({ page }) => {
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

  await page.route("**/api/menu-settings**", async (route) => {
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
        happyHourUntil: null
      })
    });
  });

  await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
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

  const nowIso = new Date().toISOString();

  await page.route("**/api/tables**", async (route, request) => {
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
          {
            restaurantSlug: "olive-bistro",
            restaurantName: "Olive Bistro",
            tableNumber: 50,
            sessionId: 5001,
            closedAt: nowIso,
            total: 32,
            orderCount: 1,
            orderIds: ["empty-50"],
            orders: []
          },
          createClosedSession({
            tableNumber: 51,
            sessionId: 5101,
            closedAt: nowIso,
            total: 96,
            itemName: "Kanafeh"
          })
        ]
      })
    });
  });

  await page.goto("/admin/tables");
  await expect(page.getByRole("heading", { name: "Closed tables" })).toBeVisible();
  await expect(page.locator(".closed-grid article.info-card h2", { hasText: "Table 50" })).toHaveCount(0);
  await expect(page.locator(".closed-grid article.info-card h2", { hasText: "Table 51" })).toHaveCount(1);
});

test("restaurant tables page requests tables, orders, settings and export strictly for current restaurant", async ({
  page
}) => {
  test.skip(
    process.env.E2E_USE_WEB_SERVER !== "true",
    "Run in local mode (E2E_USE_WEB_SERVER=true) to verify restaurant-scoped table APIs."
  );

  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const seenTablesSlugs: string[] = [];
  const seenOrdersSlugs: string[] = [];
  const seenSettingsSlugs: string[] = [];
  const seenArchiveSlugs: string[] = [];
  const nowIso = new Date().toISOString();

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

  await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
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

  await page.route("**/api/tables**", async (route, request) => {
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
        closedSessions: [
          createClosedSession({
            tableNumber: 77,
            sessionId: 7701,
            closedAt: nowIso,
            total: 72,
            itemName: "Restaurant-scoped session"
          })
        ]
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

  await expect
    .poll(() => seenTablesSlugs.length + seenOrdersSlugs.length + seenSettingsSlugs.length)
    .toBeGreaterThan(2);
  expect(seenTablesSlugs).toContain("olive-bistro");
  expect(seenOrdersSlugs).toContain("olive-bistro");
  expect(seenSettingsSlugs).toContain("olive-bistro");

  await page.getByRole("button", { name: /^Download / }).first().click();
  await expect.poll(() => seenArchiveSlugs.length).toBeGreaterThan(0);
  expect(seenArchiveSlugs).toContain("olive-bistro");
});
