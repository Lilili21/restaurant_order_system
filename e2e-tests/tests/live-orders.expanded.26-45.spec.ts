import { expect, Page, test } from "@playwright/test";

import { createMockOrder } from "./fixtures";

type MockOrder = ReturnType<typeof createMockOrder>;

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
      note?: string;
      volumeLabel?: string;
    }>;
  }>;
};

type TableOverviewFixture = {
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  currentSessionId: number;
  orderCount: number;
  total: number;
  statuses: Array<"new" | "preparing" | "served" | "cancelled">;
  orders: MockOrder[];
};

type TablesState = {
  tables: TableOverviewFixture[];
  closedSessions: ClosedSession[];
};

function withOffset(minutesOffset: number) {
  return new Date(Date.now() + minutesOffset * 60_000).toISOString();
}

function createSequentialOrders(count: number, startTable: number) {
  return Array.from({ length: count }, (_, index) =>
    createMockOrder({
      id: `live-26-45-order-${index + 1}`,
      tableNumber: startTable + index,
      sessionId: 10_000 + index,
      createdAt: withOffset(-(count - index + 1)),
      updatedAt: withOffset(-(count - index + 1))
    })
  );
}

async function clearAdminCaches(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem("admin-orders-filters-v1");
    window.localStorage.removeItem("admin-waiter-calls-v2");
    window.localStorage.removeItem("admin-tables-overview-cache-v1");
    window.sessionStorage.removeItem("admin-orders-cache-v1");
    window.sessionStorage.removeItem("admin-tables-overview-cache-v1");
    window.sessionStorage.removeItem("admin-tables-archives-cache-v1");
  });
}

async function setupAdminAuth(
  page: Page,
  options?: {
    secondaryAuthOk?: boolean;
    secondaryAuthErrorMessage?: string;
  }
) {
  const secondaryAuthOk = options?.secondaryAuthOk ?? true;
  const secondaryAuthErrorMessage =
    options?.secondaryAuthErrorMessage ?? "Invalid login or password.";

  await page.route("**/api/admin-auth**", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authorized: true })
      });
      return;
    }

    if (!secondaryAuthOk) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: secondaryAuthErrorMessage })
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
  const patchPayloads: Array<Record<string, unknown>> = [];
  let getOrdersCallCount = 0;

  const readJsonPayload = (request: { postDataJSON: () => unknown }) => {
    try {
      const parsed = request.postDataJSON();
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };

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
      const payload = readJsonPayload(request);
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
    patchPayloads,
    getOrdersCallCount: () => getOrdersCallCount
  };
}

function createTableOverview(input: {
  tableNumber: number;
  sessionId: number;
  total: number;
  itemName?: string;
  category?: string;
}): TableOverviewFixture {
  const order = createMockOrder({
    id: `table-order-${input.sessionId}`,
    sessionId: input.sessionId,
    tableNumber: input.tableNumber,
    total: input.total,
    items: [
      {
        id: `table-order-item-${input.sessionId}`,
        menuItemId: "table-menu-item-1",
        name: input.itemName ?? "Table item",
        category: input.category ?? "mains",
        price: input.total,
        quantity: 1,
        served: false
      }
    ]
  });

  return {
    restaurantSlug: "olive-bistro",
    restaurantName: "Olive Bistro",
    tableNumber: input.tableNumber,
    currentSessionId: input.sessionId,
    orderCount: 1,
    total: input.total,
    statuses: ["new"],
    orders: [order]
  };
}

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
    orderIds: [`closed-order-${input.sessionId}`],
    orders: [
      {
        id: `closed-order-${input.sessionId}`,
        createdAt: input.closedAt,
        items: [
          {
            id: `closed-item-${input.sessionId}`,
            menuItemId: "closed-menu-item-1",
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

async function setupTablesApi(
  page: Page,
  options: {
    initialState: TablesState;
    serviceRequests?: MockOrder[];
    onTablesPatch?: (
      payload: Record<string, unknown>,
      currentState: TablesState
    ) => {
      status: number;
      body: unknown;
      nextState?: TablesState;
    };
    workingHoursFrom?: string;
  }
) {
  let state = options.initialState;
  const tablePatchPayloads: Array<Record<string, unknown>> = [];

  await page.route("**/api/menu-settings**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workingHoursFrom: options.workingHoursFrom ?? "00:00",
        workingHoursRules: [],
        happyHourEnabled: false,
        happyHourDiscountPercent: 0,
        happyHourCategories: [],
        happyHourStartsFrom: null,
        happyHourUntil: null
      })
    });
  });

  await page.route("**/api/orders-archive**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ archives: [] })
    });
  });

  await page.route("**/api/orders", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(options.serviceRequests ?? [])
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.route("**/api/tables", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state)
      });
      return;
    }

    if (request.method() === "PATCH") {
      const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      tablePatchPayloads.push(payload);

      const result = options.onTablesPatch
        ? options.onTablesPatch(payload, state)
        : { status: 400, body: { message: "Unhandled tables PATCH in test" } };

      if (result.nextState) {
        state = result.nextState;
      }

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
    tablePatchPayloads
  };
}

test.describe("Live Orders expanded 26-45", () => {
  test.beforeEach(async ({ page }) => {
    await clearAdminCaches(page);
  });

  test("LIVE-26 hall card shows order time for regular order", async ({ page }) => {
    await setupAdminAuth(page);
    await setupOrdersApi(page, {
      snapshots: [[createMockOrder({ id: "live-26", tableNumber: 46 })]]
    });

    await page.goto("/admin/orders");
    const card = page.locator("article.order-card", { hasText: "Table 46" });

    await expect(card.locator(".order-time__label")).toHaveText("Order time");
    await expect(card.locator(".order-time__value")).toBeVisible();
  });

  test("LIVE-27 waiter call still shows order-time block in hall view", async ({
    page
  }) => {
    await setupAdminAuth(page);
    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-27",
            kind: "waiter_call",
            tableNumber: 47,
            total: 0,
            items: []
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    const card = page.locator("article.order-card", { hasText: "Table 47" });
    await expect(card.locator(".order-time__label")).toHaveText("Order time");
    await expect(card.locator(".order-time__value")).toBeVisible();
  });

  test("LIVE-28 hall card shows WhatsApp link for guest phone", async ({ page }) => {
    await setupAdminAuth(page);
    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-28",
            tableNumber: 48,
            guestContactName: "Alice",
            guestContactPhone: "+1 (555) 123-45"
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    const link = page.locator("article.order-card", { hasText: "Table 48" }).getByRole("link", {
      name: "WhatsApp"
    });

    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /https:\/\/wa\.me\/155512345\?text=/);
  });

  test("LIVE-29 guest contact block is hidden when no contact provided", async ({
    page
  }) => {
    await setupAdminAuth(page);
    await setupOrdersApi(page, {
      snapshots: [[createMockOrder({ id: "live-29", tableNumber: 49 })]]
    });

    await page.goto("/admin/orders");
    const card = page.locator("article.order-card", { hasText: "Table 49" });
    await expect(card.locator(".order-guest-contact")).toHaveCount(0);
  });

  test("LIVE-30 bar view groups drink variants by item name", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-30",
            tableNumber: 50,
            items: [
              {
                id: "drink-30-1",
                menuItemId: "drink-30-1",
                name: "Gin Tonic",
                category: "drinks",
                volumeLabel: "250 ml",
                price: 28,
                quantity: 1,
                served: false
              },
              {
                id: "drink-30-2",
                menuItemId: "drink-30-2",
                name: "Gin Tonic",
                category: "drinks",
                volumeLabel: "500 ml",
                price: 46,
                quantity: 1,
                served: false
              }
            ]
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Bar" }).click();

    const card = page.locator("article.order-card", { hasText: "Table 50" });
    await expect(card.locator(".order-bar-group__title")).toContainText(["Gin Tonic:"]);
    await expect(card.locator(".order-bar-group__variant-label")).toContainText([
      "250 ml",
      "500 ml"
    ]);
  });

  test("LIVE-31 bar view merges quantities when drink has no volumes", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-31",
            tableNumber: 51,
            items: [
              {
                id: "drink-31-1",
                menuItemId: "drink-31-1",
                name: "Cola",
                category: "drinks",
                price: 14,
                quantity: 1,
                served: false
              },
              {
                id: "drink-31-2",
                menuItemId: "drink-31-2",
                name: "Cola",
                category: "drinks",
                price: 14,
                quantity: 2,
                served: false
              }
            ]
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Bar" }).click();

    const card = page.locator("article.order-card", { hasText: "Table 51" });
    await expect(card.locator(".order-bar-group__single-line")).toContainText("Cola");
    await expect(card.locator(".order-bar-group__single-line")).toContainText("x3");
  });

  test("LIVE-32 cooked order is hidden in kitchen view", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-32-cooked",
            tableNumber: 52,
            items: [
              {
                id: "live-32-item",
                menuItemId: "live-32-item",
                name: "Cooked dish",
                category: "mains",
                price: 20,
                quantity: 1,
                served: false,
                note: "__menu_order_cooked__"
              }
            ]
          }),
          createMockOrder({
            id: "live-32-new",
            tableNumber: 53,
            items: [
              {
                id: "live-32-item-new",
                menuItemId: "live-32-item-new",
                name: "New dish",
                category: "mains",
                price: 24,
                quantity: 1,
                served: false
              }
            ]
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Kitchen" }).click();

    await expect(page.getByRole("heading", { name: "Table 52" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Table 53" })).toBeVisible();
  });

  test("LIVE-33 hall cooked order gets cooked-highlight class", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-33",
            tableNumber: 54,
            updatedAt: withOffset(-1),
            items: [
              {
                id: "live-33-item",
                menuItemId: "live-33-item",
                name: "Cooked dish",
                category: "mains",
                price: 33,
                quantity: 1,
                served: false,
                note: "__menu_order_cooked__"
              }
            ]
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    const card = page.locator("article.order-card", { hasText: "Table 54" });
    await expect(card).toHaveClass(/order-card--cooked-highlight/);
  });

  test("LIVE-34 hall fresh order gets fresh-new class", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-34",
            tableNumber: 55,
            status: "new",
            updatedAt: withOffset(-1)
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    const card = page.locator("article.order-card", { hasText: "Table 55" });
    await expect(card).toHaveClass(/order-card--fresh-new/);
  });

  test("LIVE-35 hall card renders serve mode label", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-35",
            tableNumber: 56,
            serveMode: "as_ready"
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    await expect(page.locator("article.order-card", { hasText: "Table 56" })).toContainText(
      "Serve as ready"
    );
  });

  test("LIVE-36 selecting multiple table chips keeps only selected tables", async ({
    page
  }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({ id: "live-36-1", tableNumber: 57 }),
          createMockOrder({ id: "live-36-2", tableNumber: 58 }),
          createMockOrder({ id: "live-36-3", tableNumber: 59 })
        ]
      ]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Table 57" }).click();
    await page.getByRole("button", { name: "Table 58" }).click();

    await expect(page.getByRole("heading", { name: "Table 57" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Table 58" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Table 59" })).toHaveCount(0);
  });

  test("LIVE-37 list chunking shows Load more and expands visible orders", async ({
    page
  }) => {
    await setupAdminAuth(page);

    const manyOrders = createSequentialOrders(30, 60);
    await setupOrdersApi(page, {
      snapshots: [manyOrders]
    });

    await page.goto("/admin/orders");

    await expect(page.locator("article.order-card")).toHaveCount(24);
    await expect(page.getByRole("button", { name: "Load 6 more orders" })).toBeVisible();

    await page.getByRole("button", { name: "Load 6 more orders" }).click();
    await expect(page.locator("article.order-card")).toHaveCount(30);
    await expect(page.getByRole("button", { name: /Load .* more orders/ })).toHaveCount(0);
  });

  test("LIVE-38 item checkbox persists served=true after successful PATCH", async ({
    page
  }) => {
    await setupAdminAuth(page);

    let currentOrder = createMockOrder({
      id: "live-38",
      tableNumber: 90,
      items: [
        {
          id: "live-38-item",
          menuItemId: "live-38-item",
          name: "Checkbox dish",
          category: "mains",
          price: 21,
          quantity: 1,
          served: false
        }
      ]
    });

    await setupOrdersApi(page, {
      snapshots: [[currentOrder]],
      onPatch: (payload) => {
        currentOrder = {
          ...currentOrder,
          items: currentOrder.items.map((item) =>
            item.id === String(payload.orderItemId)
              ? { ...item, served: Boolean(payload.served) }
              : item
          ),
          updatedAt: new Date().toISOString()
        };

        return {
          status: 200,
          body: currentOrder
        };
      }
    });

    await page.goto("/admin/orders");
    const checkbox = page
      .locator("article.order-card", { hasText: "Table 90" })
      .locator("input[type='checkbox']")
      .first();

    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  });

  test("LIVE-39 item checkbox stays unchecked when PATCH fails", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-39",
            tableNumber: 91,
            items: [
              {
                id: "live-39-item",
                menuItemId: "live-39-item",
                name: "Failed checkbox dish",
                category: "mains",
                price: 27,
                quantity: 1,
                served: false
              }
            ]
          })
        ]
      ],
      onPatch: () => ({
        status: 500,
        body: { message: "PATCH failed" }
      })
    });

    await page.goto("/admin/orders");
    const checkbox = page
      .locator("article.order-card", { hasText: "Table 91" })
      .locator("input[type='checkbox']")
      .first();

    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
  });

  test("LIVE-40 hall cooked order shows Cooked status pill", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-40",
            tableNumber: 92,
            items: [
              {
                id: "live-40-item",
                menuItemId: "live-40-item",
                name: "Cooked badge dish",
                category: "mains",
                price: 22,
                quantity: 1,
                served: false,
                note: "__menu_order_cooked__"
              }
            ]
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    const card = page.locator("article.order-card", { hasText: "Table 92" });
    await expect(card.locator(".status-pill--kitchen-cooked")).toContainText("Cooked");
  });

  test("LIVE-41 closed tables are sorted by closedAt descending", async ({ page }) => {
    await setupAdminAuth(page);

    await setupTablesApi(page, {
      initialState: {
        tables: [],
        closedSessions: [
          createClosedSession({
            tableNumber: 93,
            sessionId: 9301,
            closedAt: withOffset(-20),
            total: 40,
            itemName: "Older"
          }),
          createClosedSession({
            tableNumber: 94,
            sessionId: 9401,
            closedAt: withOffset(-5),
            total: 50,
            itemName: "Newer"
          })
        ]
      }
    });

    await page.goto("/admin/tables");
    await expect(page.getByRole("heading", { name: "Closed tables" })).toBeVisible();
    await expect(page.locator(".closed-grid article.info-card h2").first()).toContainText(
      "Table 94"
    );
  });

  test("LIVE-42 closed tables list shows maximum 10 latest sessions", async ({ page }) => {
    await setupAdminAuth(page);

    const closedSessions = Array.from({ length: 12 }, (_, index) =>
      createClosedSession({
        tableNumber: 100 + index,
        sessionId: 12_000 + index,
        closedAt: withOffset(-index),
        total: 20 + index,
        itemName: `Closed ${index + 1}`
      })
    );

    await setupTablesApi(page, {
      initialState: {
        tables: [],
        closedSessions
      }
    });

    await page.goto("/admin/tables");
    await expect(page.locator(".closed-grid article.info-card")).toHaveCount(10);
  });

  test("LIVE-43 close table error shows notice and keeps table active", async ({ page }) => {
    await setupAdminAuth(page);

    await setupTablesApi(page, {
      initialState: {
        tables: [createTableOverview({ tableNumber: 112, sessionId: 11201, total: 80 })],
        closedSessions: []
      },
      onTablesPatch: () => ({
        status: 400,
        body: { message: "Cannot close table right now" }
      })
    });

    await page.goto("/admin/tables");
    await page.getByRole("button", { name: "Close table" }).click();

    await expect(page.locator(".modal-card")).toContainText("Cannot close table right now");
    await page.getByRole("button", { name: "OK" }).click();
    await expect(page.locator(".tables-grid h3", { hasText: "Table 112" })).toBeVisible();
  });

  test("LIVE-44 move table requires valid positive target number", async ({ page }) => {
    await setupAdminAuth(page);

    const tracker = await setupTablesApi(page, {
      initialState: {
        tables: [createTableOverview({ tableNumber: 113, sessionId: 11301, total: 60 })],
        closedSessions: []
      }
    });

    await page.goto("/admin/tables");
    await page.getByRole("button", { name: "Clients changed table" }).click();
    await page.getByPlaceholder("Login").fill("manager");
    await page.getByPlaceholder("Password").fill("pass");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.locator(".modal-error")).toContainText("Enter a valid table number.");
    expect(tracker.tablePatchPayloads.length).toBe(0);
  });

  test("LIVE-45 move table auth failure shows error and blocks PATCH", async ({
    page
  }) => {
    await setupAdminAuth(page, {
      secondaryAuthOk: false,
      secondaryAuthErrorMessage: "Invalid secondary credentials"
    });

    const tracker = await setupTablesApi(page, {
      initialState: {
        tables: [createTableOverview({ tableNumber: 114, sessionId: 11401, total: 72 })],
        closedSessions: []
      }
    });

    await page.goto("/admin/tables");
    await page.getByRole("button", { name: "Clients changed table" }).click();
    await page.getByPlaceholder("Move to table").fill("130");
    await page.getByPlaceholder("Login").fill("manager");
    await page.getByPlaceholder("Password").fill("wrong-pass");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.locator(".modal-error")).toContainText("Invalid secondary credentials");
    expect(tracker.tablePatchPayloads.length).toBe(0);
  });

  test("LIVE-46 bar Ready removes card only from bar and keeps it in kitchen", async ({
    page
  }) => {
    await setupAdminAuth(page);

    const order = createMockOrder({
      id: "live-46-station-bar",
      tableNumber: 115,
      items: [
        {
          id: "live-46-kitchen-item",
          menuItemId: "live-46-kitchen-item",
          name: "Kitchen item",
          category: "mains",
          price: 35,
          quantity: 1,
          served: false
        },
        {
          id: "live-46-bar-item",
          menuItemId: "live-46-bar-item",
          name: "Bar item",
          category: "cocktails",
          price: 25,
          quantity: 1,
          served: false
        }
      ]
    });

    const tracker = await setupOrdersApi(page, {
      snapshots: [[order]],
      onPatch: (payload) => ({
        status: 200,
        body: {
          ...order,
          items: order.items.map((item) => {
            if (item.category === "cocktails") {
              return {
                ...item,
                note:
                  payload.cooked === true && payload.station === "bar"
                    ? "__menu_order_bar_ready__"
                    : item.note
              };
            }

            return item;
          }),
          updatedAt: new Date().toISOString()
        }
      })
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Bar" }).click();
    await expect(page.getByRole("heading", { name: "Table 115" })).toBeVisible();

    await page.getByRole("button", { name: "Ready" }).click();
    await expect
      .poll(() =>
        tracker.patchPayloads.some(
          (payload) => payload.cooked === true && payload.station === "bar"
        )
      )
      .toBe(true);

    await expect(page.getByRole("heading", { name: "Table 115" })).toHaveCount(0);
    await page.getByRole("button", { name: "Kitchen" }).click();
    await expect(page.getByRole("heading", { name: "Table 115" })).toBeVisible();
  });

  test("LIVE-47 kitchen Ready removes card only from kitchen and keeps it in bar", async ({
    page
  }) => {
    await setupAdminAuth(page);

    const order = createMockOrder({
      id: "live-47-station-kitchen",
      tableNumber: 116,
      items: [
        {
          id: "live-47-kitchen-item",
          menuItemId: "live-47-kitchen-item",
          name: "Kitchen item",
          category: "mains",
          price: 31,
          quantity: 1,
          served: false
        },
        {
          id: "live-47-bar-item",
          menuItemId: "live-47-bar-item",
          name: "Bar item",
          category: "cocktails",
          price: 21,
          quantity: 1,
          served: false
        }
      ]
    });

    const tracker = await setupOrdersApi(page, {
      snapshots: [[order]],
      onPatch: (payload) => ({
        status: 200,
        body: {
          ...order,
          items: order.items.map((item) => {
            if (item.category !== "cocktails") {
              return {
                ...item,
                note:
                  payload.cooked === true && payload.station === "kitchen"
                    ? "__menu_order_kitchen_ready__"
                    : item.note
              };
            }

            return item;
          }),
          updatedAt: new Date().toISOString()
        }
      })
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Kitchen" }).click();
    await expect(page.getByRole("heading", { name: "Table 116" })).toBeVisible();

    await page.getByRole("button", { name: "Ready" }).click();
    await expect
      .poll(() =>
        tracker.patchPayloads.some(
          (payload) => payload.cooked === true && payload.station === "kitchen"
        )
      )
      .toBe(true);

    await expect(page.getByRole("heading", { name: "Table 116" })).toHaveCount(0);
    await page.getByRole("button", { name: "Bar" }).click();
    await expect(page.getByRole("heading", { name: "Table 116" })).toBeVisible();
  });
});
