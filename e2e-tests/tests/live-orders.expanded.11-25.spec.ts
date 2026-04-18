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

function withDayOffset(daysOffset: number) {
  return new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000).toISOString();
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
  let getOrdersCallCount = 0;
  const patchPayloads: Array<Record<string, unknown>> = [];

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

  await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
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
    getOrdersCallCount: () => getOrdersCallCount,
    patchPayloads
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
    onOrdersPatch?: (payload: Record<string, unknown>) => {
      status: number;
      body: unknown;
    };
    workingHoursFrom?: string;
    archives?: Array<{ weekKey: string; label: string }>;
  }
) {
  let state = options.initialState;
  const tablePatchPayloads: Array<Record<string, unknown>> = [];
  const ordersPatchPayloads: Array<Record<string, unknown>> = [];

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

  await page.route("**/api/orders-archive**", async (route, request) => {
    const url = new URL(request.url());
    const weekKey = url.searchParams.get("weekKey");

    if (weekKey) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          weekKey,
          closedTableSummaries: []
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        archives: options.archives ?? []
      })
    });
  });

  await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(options.serviceRequests ?? [])
      });
      return;
    }

    if (request.method() === "PATCH") {
      const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      ordersPatchPayloads.push(payload);
      const result = options.onOrdersPatch
        ? options.onOrdersPatch(payload)
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

  await page.route(/\/api\/tables\/?(?:\?.*)?$/, async (route, request) => {
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
    tablePatchPayloads,
    ordersPatchPayloads,
    getState: () => state
  };
}

test.describe("Live Orders expanded 11-25", () => {
  test.beforeEach(async ({ page }) => {
    await clearAdminCaches(page);
  });

  test("LIVE-11 waiter call card can be acknowledged with OK", async ({ page }) => {
    await setupAdminAuth(page);

    const waiterCall = createMockOrder({
      id: "live-11-waiter-call",
      kind: "waiter_call",
      tableNumber: 21,
      total: 0,
      items: []
    });

    await setupOrdersApi(page, {
      snapshots: [[waiterCall]],
      onPatch: (payload) => ({
        status: 200,
        body: {
          ...waiterCall,
          status: String(payload.status ?? "served")
        }
      })
    });

    await page.goto("/admin/orders");

    await expect(page.getByRole("heading", { name: "Table 21 · Waiter call" })).toBeVisible();
    await expect(page.getByText("A guest is asking for staff at the table.")).toBeVisible();

    await page.getByRole("button", { name: "OK" }).click();
    await expect(page.getByRole("heading", { name: "Table 21 · Waiter call" })).toHaveCount(0);
    await expect(page.getByText("No incoming orders yet.")).toBeVisible();
  });

  test("LIVE-12 bill request card can be acknowledged with OK", async ({ page }) => {
    await setupAdminAuth(page);

    const billRequest = createMockOrder({
      id: "live-12-bill-request",
      kind: "bill_request",
      tableNumber: 22,
      total: 0,
      items: []
    });

    await setupOrdersApi(page, {
      snapshots: [[billRequest]],
      onPatch: (payload) => ({
        status: 200,
        body: {
          ...billRequest,
          status: String(payload.status ?? "served")
        }
      })
    });

    await page.goto("/admin/orders");

    await expect(page.getByRole("heading", { name: "Table 22 · Bill request" })).toBeVisible();
    await expect(page.getByText("A guest is asking for the bill.")).toBeVisible();

    await page.getByRole("button", { name: "OK" }).click();
    await expect(page.getByRole("heading", { name: "Table 22 · Bill request" })).toHaveCount(0);
    await expect(page.getByText("No incoming orders yet.")).toBeVisible();
  });

  test("LIVE-13 hall card shows Is cooking badge after threshold", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-13-cooking",
            tableNumber: 23,
            createdAt: withOffset(-4),
            updatedAt: withOffset(-4)
          })
        ]
      ]
    });

    await page.goto("/admin/orders");

    await expect(page.locator(".status-pill--kitchen-cooking")).toBeVisible();
    await expect(page.locator(".status-pill--kitchen-cooking")).toContainText("Is cooking");
  });

  test("LIVE-14 table chip filters floor cards by selected table", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({ id: "live-14-a", tableNumber: 24 }),
          createMockOrder({ id: "live-14-b", tableNumber: 25 })
        ]
      ]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Table 24" }).click();

    await expect(page.getByRole("heading", { name: "Table 24" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Table 25" })).toHaveCount(0);
  });

  test("LIVE-15 kitchen status chips filter by New/On time/Late", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [
        [
          createMockOrder({
            id: "live-15-new",
            tableNumber: 26,
            createdAt: withOffset(-1),
            updatedAt: withOffset(-1)
          }),
          createMockOrder({
            id: "live-15-on-time",
            tableNumber: 27,
            createdAt: withOffset(-6),
            updatedAt: withOffset(-6)
          }),
          createMockOrder({
            id: "live-15-late",
            tableNumber: 28,
            createdAt: withOffset(-12),
            updatedAt: withOffset(-12)
          })
        ]
      ]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Kitchen" }).click();
    await page.getByRole("button", { name: /^On time •/ }).click();
    await page.getByRole("button", { name: /^Late •/ }).click();

    await expect(page.getByRole("heading", { name: "Table 26" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Table 27" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Table 28" })).toHaveCount(0);
  });

  test("LIVE-16 kitchen Ready action sends cooked=true with station=kitchen and removes card", async ({
    page
  }) => {
    await setupAdminAuth(page);

    const order = createMockOrder({
      id: "live-16-ready",
      tableNumber: 29,
      items: [
        {
          id: "live-16-item",
          menuItemId: "live-16-item",
          name: "Kitchen dish",
          category: "mains",
          price: 39,
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
          items: order.items.map((item) => ({
            ...item,
            note:
              payload.cooked === true && payload.station === "kitchen"
                ? "__menu_order_kitchen_ready__"
                : item.note
          })),
          updatedAt: new Date().toISOString()
        }
      })
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Kitchen" }).click();
    await expect(page.getByRole("heading", { name: "Table 29" })).toBeVisible();

    await page.getByRole("button", { name: "Ready" }).click();

    await expect
      .poll(() =>
        tracker.patchPayloads.some(
          (payload) => payload.cooked === true && payload.station === "kitchen"
        )
      )
      .toBe(true);
    await expect(page.getByRole("heading", { name: "Table 29" })).toHaveCount(0);
    await expect(page.getByText("No active orders for the selected table.")).toBeVisible();
  });

  test("LIVE-17 Change/cancel action opens secondary auth modal", async ({ page }) => {
    await setupAdminAuth(page);

    await setupOrdersApi(page, {
      snapshots: [[createMockOrder({ id: "live-17", tableNumber: 30 })]]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Change/cancel order" }).click();

    await expect(page.getByRole("heading", { name: "Change/cancel order" })).toBeVisible();
    await expect(page.getByPlaceholder("Login")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });

  test("LIVE-18 invalid secondary auth blocks edit mode", async ({ page }) => {
    await setupAdminAuth(page, {
      secondaryAuthOk: false,
      secondaryAuthErrorMessage: "Invalid secondary credentials"
    });

    await setupOrdersApi(page, {
      snapshots: [[createMockOrder({ id: "live-18", tableNumber: 31 })]]
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Change/cancel order" }).click();
    await page.getByPlaceholder("Login").fill("manager");
    await page.getByPlaceholder("Password").fill("wrong-pass");
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(page.locator(".modal-error")).toContainText("Invalid secondary credentials");
    await expect(page.locator(".order-edit-row")).toHaveCount(0);
    await expect(
      page
        .locator(".modal-card--form")
        .getByRole("button", { name: "Confirm", exact: true })
    ).toBeVisible();
  });

  test("LIVE-19 edit quantity sends quantityDelta payload", async ({ page }) => {
    await setupAdminAuth(page);

    let currentOrder = createMockOrder({
      id: "live-19",
      tableNumber: 32,
      items: [
        {
          id: "live-19-item",
          menuItemId: "live-19-item",
          name: "Editable dish",
          category: "mains",
          price: 15,
          quantity: 1,
          served: false
        }
      ],
      total: 15
    });

    const tracker = await setupOrdersApi(page, {
      snapshots: [[currentOrder]],
      onPatch: (payload) => {
        const quantityDelta = Number(payload.quantityDelta ?? 0);

        if (Number.isFinite(quantityDelta) && quantityDelta !== 0) {
          currentOrder = {
            ...currentOrder,
            items: currentOrder.items.map((item) =>
              item.id === String(payload.orderItemId)
                ? { ...item, quantity: item.quantity + quantityDelta }
                : item
            ),
            total:
              currentOrder.total +
              currentOrder.items
                .filter((item) => item.id === String(payload.orderItemId))
                .reduce((sum, item) => sum + item.price * quantityDelta, 0),
            updatedAt: new Date().toISOString()
          };
        }

        return {
          status: 200,
          body: currentOrder
        };
      }
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Change/cancel order" }).click();
    await page.getByPlaceholder("Login").fill("manager");
    await page.getByPlaceholder("Password").fill("pass");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

    await page.locator(".order-edit-row").first().getByRole("button", { name: "+" }).click();
    await page.getByRole("button", { name: "Save" }).click();

    await expect.poll(() => tracker.patchPayloads.length).toBe(1);
    await expect
      .poll(() => Number(tracker.patchPayloads[0]?.quantityDelta ?? 0))
      .toBe(1);
    await expect(page.locator("article.order-card").first()).toContainText("2 pcs");
  });

  test("LIVE-20 cancel order from edit dialog removes card", async ({ page }) => {
    await setupAdminAuth(page);

    const order = createMockOrder({
      id: "live-20",
      tableNumber: 33
    });

    const tracker = await setupOrdersApi(page, {
      snapshots: [[order]],
      onPatch: (payload) => ({
        status: 200,
        body: {
          ...order,
          status: String(payload.status ?? "cancelled"),
          updatedAt: new Date().toISOString()
        }
      })
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Change/cancel order" }).click();
    await page.getByPlaceholder("Login").fill("manager");
    await page.getByPlaceholder("Password").fill("pass");
    await page.getByRole("button", { name: "Confirm" }).click();
    await page
      .locator(".modal-card--form")
      .getByRole("button", { name: "Cancel order", exact: true })
      .click();

    await expect
      .poll(() => tracker.patchPayloads.some((payload) => payload.status === "cancelled"))
      .toBe(true);
    await expect(page.getByRole("heading", { name: "Table 33" })).toHaveCount(0);
    await expect(page.getByText("No incoming orders yet.")).toBeVisible();
  });

  test("LIVE-21 service request in tables view can be resolved", async ({ page }) => {
    await setupAdminAuth(page);

    const serviceRequest = createMockOrder({
      id: "live-21-service",
      kind: "bill_request",
      tableNumber: 34,
      total: 0,
      items: []
    });

    const tracker = await setupTablesApi(page, {
      initialState: {
        tables: [],
        closedSessions: []
      },
      serviceRequests: [serviceRequest],
      onOrdersPatch: (payload) => ({
        status: 200,
        body: {
          ...serviceRequest,
          status: String(payload.status ?? "served")
        }
      })
    });

    await page.goto("/admin/tables");

    await expect(page.getByRole("heading", { name: "Service requests" })).toBeVisible();
    const requestCard = page.locator(".order-card--service").first();
    await expect(requestCard).toContainText("Table 34");
    await expect(requestCard).toContainText("Bill request");

    await requestCard.getByRole("button", { name: "OK" }).click();

    await expect
      .poll(() => tracker.ordersPatchPayloads.some((payload) => payload.orderId === "live-21-service"))
      .toBe(true);
    await expect(page.locator(".order-card--service")).toHaveCount(0);
  });

  test("LIVE-22 closing active table moves it to Closed tables list", async ({ page }) => {
    await setupAdminAuth(page);

    const initialTable = createTableOverview({
      tableNumber: 35,
      sessionId: 3501,
      total: 120,
      itemName: "Close-flow dish"
    });

    const tracker = await setupTablesApi(page, {
      initialState: {
        tables: [initialTable],
        closedSessions: []
      },
      onTablesPatch: (payload, currentState) => {
        const tableNumber = Number(payload.tableNumber);
        const sessionToClose = currentState.tables.find(
          (table) => table.tableNumber === tableNumber
        );

        if (!sessionToClose) {
          return {
            status: 404,
            body: { message: "Table not found." }
          };
        }

        const closedSession = createClosedSession({
          tableNumber: sessionToClose.tableNumber,
          sessionId: sessionToClose.currentSessionId,
          closedAt: new Date().toISOString(),
          total: sessionToClose.total,
          itemName: sessionToClose.orders[0]?.items[0]?.name ?? "Closed dish"
        });

        return {
          status: 200,
          body: closedSession,
          nextState: {
            tables: currentState.tables.filter(
              (table) => table.tableNumber !== sessionToClose.tableNumber
            ),
            closedSessions: [closedSession, ...currentState.closedSessions]
          }
        };
      }
    });

    await page.goto("/admin/tables");
    await expect(page.locator(".tables-grid h3", { hasText: "Table 35" })).toBeVisible();

    await page.getByRole("button", { name: "Close table" }).click();
    await expect(page.locator(".modal-card")).toContainText("Table 35 closed.");
    await page.getByRole("button", { name: "OK" }).click();

    await expect
      .poll(() => tracker.tablePatchPayloads.some((payload) => payload.tableNumber === 35))
      .toBe(true);
    await expect(page.locator(".tables-grid h3", { hasText: "Table 35" })).toHaveCount(0);
    await expect(page.locator(".closed-grid article.info-card h2", { hasText: "Table 35" })).toHaveCount(1);
  });

  test("LIVE-23 export today creates xls download when closed sessions exist", async ({
    page
  }) => {
    await setupAdminAuth(page);

    await setupTablesApi(page, {
      initialState: {
        tables: [],
        closedSessions: [
          createClosedSession({
            tableNumber: 36,
            sessionId: 3601,
            closedAt: new Date().toISOString(),
            total: 77,
            itemName: "Exported dish"
          }),
          createClosedSession({
            tableNumber: 99,
            sessionId: 9901,
            closedAt: withDayOffset(-1),
            total: 55,
            itemName: "Yesterday dish"
          })
        ]
      }
    });

    await page.goto("/admin/tables");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export today to Excel" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^closed-orders-.*\.xls$/);
  });

  test("LIVE-24 export today shows notice when there are no closed sessions", async ({
    page
  }) => {
    await setupAdminAuth(page);

    await setupTablesApi(page, {
      initialState: {
        tables: [],
        closedSessions: []
      }
    });

    await page.goto("/admin/tables");
    await page.getByRole("button", { name: "Export today to Excel" }).click();

    await expect(page.locator(".modal-card")).toContainText(
      "There are no closed orders for export today."
    );
    await page.getByRole("button", { name: "OK" }).click();
    await expect(page.locator(".modal-card")).toHaveCount(0);
  });

  test("LIVE-25 move table flow updates table number after secondary auth", async ({
    page
  }) => {
    await setupAdminAuth(page);

    const initialTable = createTableOverview({
      tableNumber: 37,
      sessionId: 3701,
      total: 92,
      itemName: "Move-flow dish"
    });

    const tracker = await setupTablesApi(page, {
      initialState: {
        tables: [initialTable],
        closedSessions: []
      },
      onTablesPatch: (payload, currentState) => {
        const sourceTable = Number(payload.tableNumber);
        const targetTable = Number(payload.targetTableNumber);
        const table = currentState.tables.find(
          (item) => item.tableNumber === sourceTable
        );

        if (!table) {
          return {
            status: 404,
            body: { message: "Source table not found." }
          };
        }

        const movedTable: TableOverviewFixture = {
          ...table,
          tableNumber: targetTable,
          orders: table.orders.map((order) => ({
            ...order,
            tableNumber: targetTable
          }))
        };

        return {
          status: 200,
          body: {
            movedOrders: table.orders.length
          },
          nextState: {
            tables: [movedTable],
            closedSessions: currentState.closedSessions
          }
        };
      }
    });

    await page.goto("/admin/tables");
    await page.getByRole("button", { name: "Clients changed table" }).click();
    await expect(page.getByRole("heading", { name: "Clients changed table" })).toBeVisible();

    await page.getByPlaceholder("Move to table").fill("45");
    await page.getByPlaceholder("Login").fill("manager");
    await page.getByPlaceholder("Password").fill("pass");
    await page.getByRole("button", { name: "Save" }).click();

    await expect
      .poll(() =>
        tracker.tablePatchPayloads.some(
          (payload) =>
            payload.action === "move" &&
            payload.tableNumber === 37 &&
            payload.targetTableNumber === 45
        )
      )
      .toBe(true);

    await expect(page.locator(".modal-card")).toContainText(
      "Orders moved from table 37 to table 45."
    );
    await page.getByRole("button", { name: "OK" }).click();

    await expect(page.locator(".tables-grid h3", { hasText: "Table 45" })).toHaveCount(1);
    await expect(page.locator(".tables-grid h3", { hasText: "Table 37" })).toHaveCount(0);
  });
});
