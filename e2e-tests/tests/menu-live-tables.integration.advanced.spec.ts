import { readFileSync } from "node:fs";

import { BrowserContext, Page, expect, test } from "@playwright/test";

const BASE_URL =
  process.env.E2E_BASE_URL ?? "https://restaurant-order-system-blue.vercel.app";
const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";
const PREVIEW_MENU_PATH = process.env.E2E_PREVIEW_MENU_PATH ?? "/menu/olive-bistro/0";

type IntegrationOrderItem = {
  id: string;
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  served: boolean;
  volumeOptionId?: string;
  volumeLabel?: string;
  note?: string;
};

type IntegrationOrder = {
  id: string;
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  sessionId: number;
  status: "new" | "preparing" | "served" | "cancelled";
  kind: "order" | "waiter_call" | "bill_request";
  serveMode: "all_at_once" | "as_ready";
  createdAt: string;
  updatedAt: string;
  total: number;
  items: IntegrationOrderItem[];
};

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
    items: IntegrationOrderItem[];
  }>;
};

type SharedStore = {
  restaurantSlug: string;
  restaurantName: string;
  primaryTableNumber: number;
  tableSessions: Map<number, number>;
  orders: IntegrationOrder[];
  closedSessions: ClosedSession[];
  nextOrderId: number;
  nextItemId: number;
  postFailureQueue: number[];
};

type BackendOptions = {
  happyHourDiscountPercent?: number;
  workingHoursFrom?: string;
  initialClosedSessions?: ClosedSession[];
  postFailureQueue?: number[];
};

function withOffset(minutesOffset: number) {
  return new Date(Date.now() + minutesOffset * 60_000).toISOString();
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

function createClosedSession(input: {
  tableNumber: number;
  sessionId: number;
  closedAt: string;
  total: number;
  itemName: string;
  restaurantSlug?: string;
  restaurantName?: string;
}): ClosedSession {
  return {
    restaurantSlug: input.restaurantSlug ?? "olive-bistro",
    restaurantName: input.restaurantName ?? "Olive Bistro",
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
            menuItemId: "closed-item",
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

function createStore(options?: BackendOptions): SharedStore {
  return {
    restaurantSlug: "olive-bistro",
    restaurantName: "Olive Bistro",
    primaryTableNumber: 1,
    tableSessions: new Map<number, number>([[1, 1]]),
    orders: [],
    closedSessions: options?.initialClosedSessions ?? [],
    nextOrderId: 1,
    nextItemId: 1,
    postFailureQueue: options?.postFailureQueue ? [...options.postFailureQueue] : []
  };
}

function getCurrentSessionId(store: SharedStore, tableNumber: number) {
  const existing = store.tableSessions.get(tableNumber);

  if (existing) {
    return existing;
  }

  store.tableSessions.set(tableNumber, 1);
  return 1;
}

function getSubmittedOrdersForTable(store: SharedStore, tableNumber: number) {
  const sessionId = getCurrentSessionId(store, tableNumber);

  return store.orders
    .filter(
      (order) =>
        order.tableNumber === tableNumber &&
        order.sessionId === sessionId &&
        order.kind === "order" &&
        order.status !== "cancelled"
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getActiveServiceRequestsForTable(store: SharedStore, tableNumber: number) {
  const sessionId = getCurrentSessionId(store, tableNumber);

  return store.orders
    .filter(
      (order) =>
        order.tableNumber === tableNumber &&
        order.sessionId === sessionId &&
        (order.kind === "waiter_call" || order.kind === "bill_request") &&
        order.status !== "served" &&
        order.status !== "cancelled"
    )
    .map((order) => order.kind);
}

function buildTablesPayload(store: SharedStore) {
  const tableNumbers = [...store.tableSessions.keys()];
  const tables = tableNumbers
    .map((tableNumber) => {
      const sessionId = getCurrentSessionId(store, tableNumber);
      const billableOrders = store.orders
        .filter(
          (order) =>
            order.tableNumber === tableNumber &&
            order.sessionId === sessionId &&
            order.kind === "order" &&
            order.status !== "cancelled"
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

      if (billableOrders.length === 0) {
        return null;
      }

      return {
        restaurantSlug: store.restaurantSlug,
        restaurantName: store.restaurantName,
        tableNumber,
        currentSessionId: sessionId,
        orderCount: billableOrders.length,
        total: billableOrders.reduce((sum, order) => sum + order.total, 0),
        statuses: [...new Set(billableOrders.map((order) => order.status))],
        orders: billableOrders
      };
    })
    .filter(Boolean)
    .sort((left, right) => left!.tableNumber - right!.tableNumber);

  return {
    tables,
    closedSessions: [...store.closedSessions]
  };
}

async function dismissWelcomeDialogIfVisible(page: Page) {
  const welcomeTitle = page.locator("#welcome-dialog-title");
  const welcomeDialog = page.locator(".modal-backdrop").filter({ has: welcomeTitle }).first();

  const appeared = await welcomeDialog
    .waitFor({ state: "visible", timeout: 1500 })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    return;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stillVisible = await welcomeDialog
      .isVisible()
      .catch(() => false);

    if (!stillVisible) {
      return;
    }

    const confirmButton = welcomeDialog.locator("button.button-success").first();

    try {
      await confirmButton.click({ timeout: 3000, force: true });
    } catch {
      await confirmButton.evaluate((button: HTMLButtonElement) => button.click());
    }

    const hidden = await welcomeDialog
      .waitFor({ state: "hidden", timeout: 2500 })
      .then(() => true)
      .catch(() => false);

    if (hidden) {
      return;
    }

    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(150);
  }

  await expect(welcomeDialog).toBeHidden({ timeout: 7000 });
}

async function clickLanguageButtonWithRetry(page: Page, language: "EN" | "RU" | "HE") {
  const languageButton = page.getByRole("button", { name: language, exact: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await languageButton.click({ timeout: 3000 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }

      await dismissWelcomeDialogIfVisible(page);
      await page.waitForTimeout(150);
    }
  }
}

async function openMenuInEnglish(page: Page, menuPath: string) {
  await page.goto(menuPath, { waitUntil: "domcontentloaded" });
  await dismissWelcomeDialogIfVisible(page);
  await clickLanguageButtonWithRetry(page, "EN");
  await dismissWelcomeDialogIfVisible(page);
  await expect(page.locator(".menu-sections")).toBeVisible();
}

async function addFirstDish(page: Page, quantity = 1) {
  await page.getByRole("button", { name: /Dishes/i }).first().click();

  for (let index = 0; index < quantity; index += 1) {
    const addButton = page
      .locator(".menu-card .menu-card__footer button")
      .filter({ hasText: "Add" })
      .first();
    await expect(addButton).toBeVisible();
    await addButton.click();
  }
}

async function clickCartSubmit(page: Page) {
  const submitButton = page.locator(".cart-submit").first();
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();

  try {
    await submitButton.click({ force: true, timeout: 5000 });
  } catch {
    await submitButton.evaluate((button: HTMLButtonElement) => button.click());
  }
}

async function submitOrderViaReviewDialog(page: Page) {
  await clickCartSubmit(page);
  const reviewDialog = page.locator(".modal-card--review");
  await expect(reviewDialog).toBeVisible();
  const okButton = reviewDialog.getByRole("button", { name: "OK" }).first();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await okButton.click({ timeout: 3000, force: true });
    } catch {
      await okButton.evaluate((button: HTMLButtonElement) => button.click());
    }

    const closed = await reviewDialog
      .waitFor({ state: "hidden", timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (closed) {
      return;
    }
  }

  await expect(reviewDialog).toBeHidden();
}

async function closeMessageDialogIfVisible(page: Page) {
  const ackButton = page.locator(".modal-card__ack").first();
  const visible = await ackButton
    .waitFor({ state: "visible", timeout: 2500 })
    .then(() => true)
    .catch(() => false);

  if (!visible) {
    return;
  }

  await ackButton.click();
}

async function openServiceMenu(page: Page) {
  const callWaiterButton = page.getByRole("button", { name: "Call waiter" });
  await expect(callWaiterButton).toBeVisible();
  await callWaiterButton.click();
}

async function attachSharedBackend(
  context: BrowserContext,
  store: SharedStore,
  options?: BackendOptions
) {
  const discountPercent = Math.max(0, Number(options?.happyHourDiscountPercent ?? 0));
  const workingHoursFrom = options?.workingHoursFrom ?? "09:00";
  const now = new Date();
  const happyHourStartsFrom = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const happyHourUntil = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  await context.route("**/api/admin-auth**", async (route, request) => {
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

  await context.route("**/api/menu-settings**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workingHoursFrom,
        workingHoursRules: [],
        happyHourEnabled: discountPercent > 0,
        happyHourDiscountPercent: discountPercent,
        happyHourCategories: discountPercent > 0 ? ["mains"] : [],
        happyHourStartsFrom: discountPercent > 0 ? happyHourStartsFrom : null,
        happyHourUntil: discountPercent > 0 ? happyHourUntil : null
      })
    });
  });

  await context.route("**/api/orders-archive**", async (route, request) => {
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
      body: JSON.stringify({ archives: [] })
    });
  });

  await context.route("**/api/tables/*/*", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    const submittedOrders = getSubmittedOrdersForTable(store, store.primaryTableNumber);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currentSessionId: getCurrentSessionId(store, store.primaryTableNumber),
        submittedOrders,
        activeServiceRequests: getActiveServiceRequestsForTable(
          store,
          store.primaryTableNumber
        )
      })
    });
  });

  await context.route("**/api/tables", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildTablesPayload(store))
      });
      return;
    }

    if (request.method() === "PATCH") {
      const payload = JSON.parse(request.postData() ?? "{}") as {
        action?: "move";
        restaurantSlug?: string;
        tableNumber?: number;
        targetTableNumber?: number;
      };
      const sourceTable = Number(payload.tableNumber);
      const sourceSession = getCurrentSessionId(store, sourceTable);

      if (payload.action === "move") {
        const targetTable = Number(payload.targetTableNumber);
        const targetSession = getCurrentSessionId(store, targetTable);
        const movedOrders = store.orders.filter(
          (order) =>
            order.tableNumber === sourceTable &&
            order.sessionId === sourceSession &&
            order.kind === "order" &&
            order.status !== "cancelled"
        );

        store.orders = store.orders.map((order) =>
          movedOrders.some((moved) => moved.id === order.id)
            ? {
                ...order,
                tableNumber: targetTable,
                sessionId: targetSession
              }
            : order
        );
        store.tableSessions.set(sourceTable, sourceSession + 1);

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            restaurantSlug: payload.restaurantSlug ?? store.restaurantSlug,
            fromTableNumber: sourceTable,
            toTableNumber: targetTable,
            movedOrders: movedOrders.length
          })
        });
        return;
      }

      const sessionOrders = store.orders.filter(
        (order) =>
          order.tableNumber === sourceTable &&
          order.sessionId === sourceSession &&
          order.kind === "order" &&
          order.status !== "cancelled"
      );

      if (sessionOrders.length === 0) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "No food/drink orders in this session. Nothing to close." })
        });
        return;
      }

      const summary: ClosedSession = {
        restaurantSlug: store.restaurantSlug,
        restaurantName: store.restaurantName,
        tableNumber: sourceTable,
        sessionId: sourceSession,
        closedAt: new Date().toISOString(),
        total: sessionOrders.reduce((sum, order) => sum + order.total, 0),
        orderCount: sessionOrders.length,
        orderIds: sessionOrders.map((order) => order.id),
        orders: sessionOrders.map((order) => ({
          id: order.id,
          createdAt: order.createdAt,
          items: order.items.map((item) => ({ ...item }))
        }))
      };

      store.closedSessions = [summary, ...store.closedSessions];
      const sessionOrderIds = new Set(
        store.orders
          .filter(
            (order) =>
              order.tableNumber === sourceTable && order.sessionId === sourceSession
          )
          .map((order) => order.id)
      );
      store.orders = store.orders.filter((order) => !sessionOrderIds.has(order.id));
      store.tableSessions.set(sourceTable, sourceSession + 1);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(summary)
      });
      return;
    }

    await route.continue();
  });

  await context.route("**/api/orders", async (route, request) => {
    if (request.method() === "GET") {
      const activeOrders = store.orders
        .filter((order) => order.status !== "served" && order.status !== "cancelled")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(activeOrders)
      });
      return;
    }

    if (request.method() === "POST") {
      const failureCode = store.postFailureQueue.shift();

      if (failureCode) {
        await route.fulfill({
          status: failureCode,
          contentType: "application/json",
          body: JSON.stringify({
            message:
              failureCode === 429
                ? "Too many order requests. Please try again later."
                : "Temporary backend error"
          })
        });
        return;
      }

      const body = JSON.parse(request.postData() ?? "{}") as {
        type?: "waiter_call" | "bill_request";
        restaurantSlug?: string;
        tableNumber?: number;
        serveMode?: "all_at_once" | "as_ready";
        items?: Array<{
          menuItemId: string;
          quantity: number;
          priceOverride?: number;
          volumeOptionId?: string;
          volumeLabel?: string;
        }>;
      };

      const tableNumber = Number(body.tableNumber ?? store.primaryTableNumber);
      store.primaryTableNumber = tableNumber;
      const sessionId = getCurrentSessionId(store, tableNumber);
      const nowIso = new Date().toISOString();
      const kind = body.type ?? "order";

      const items: IntegrationOrderItem[] =
        kind === "order"
          ? (body.items ?? []).map((item, index) => {
              const basePrice = Number(item.priceOverride ?? 20);
              const discountedPrice =
                discountPercent > 0
                  ? Number((basePrice * (1 - discountPercent / 100)).toFixed(2))
                  : basePrice;

              return {
                id: `advanced-item-${store.nextItemId++}`,
                menuItemId: item.menuItemId,
                name: `Advanced item ${index + 1}`,
                category: "mains",
                price: discountedPrice,
                quantity: item.quantity,
                served: false,
                volumeOptionId: item.volumeOptionId,
                volumeLabel: item.volumeLabel
              };
            })
          : [];

      const order: IntegrationOrder = {
        id: `advanced-order-${store.nextOrderId++}`,
        restaurantSlug: body.restaurantSlug ?? store.restaurantSlug,
        restaurantName: store.restaurantName,
        tableNumber,
        sessionId,
        status: "new",
        kind,
        serveMode: body.serveMode ?? "as_ready",
        createdAt: nowIso,
        updatedAt: nowIso,
        total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        items
      };

      store.orders = [order, ...store.orders];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(order)
      });
      return;
    }

    if (request.method() === "PATCH") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        orderId?: string;
        status?: IntegrationOrder["status"];
      };
      const orderId = String(body.orderId ?? "");
      const nextStatus = body.status ?? "new";

      store.orders = store.orders.map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        return {
          ...order,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
          items:
            nextStatus === "served"
              ? order.items.map((item) => ({ ...item, served: true }))
              : order.items
        };
      });

      const updated = store.orders.find((order) => order.id === orderId);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated ?? { id: orderId, status: nextStatus })
      });
      return;
    }

    await route.continue();
  });
}

async function setupBackend(
  context: BrowserContext,
  options?: BackendOptions
) {
  const store = createStore(options);
  await attachSharedBackend(context, store, options);
  return store;
}

async function waitForSubmittedOrdersInStore(
  store: SharedStore,
  minCount: number,
  timeoutMs = 12_000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const orderCount = store.orders.filter((order) => order.kind === "order").length;

    if (orderCount >= minCount) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const currentCount = store.orders.filter((order) => order.kind === "order").length;
  throw new Error(
    `Expected at least ${minCount} submitted order(s), but only ${currentCount} found in store.`
  );
}

test.describe("Menu + Live + Tables advanced integration", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("ADV-01 close table moves order to Closed tables and allows export", async ({
    page,
    context
  }) => {
    test.skip(!ORDERING_MENU_PATH, "Set E2E_ORDERING_MENU_PATH to run advanced integration.");

    const store = await setupBackend(context);
    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await waitForSubmittedOrdersInStore(store, 1);
    await closeMessageDialogIfVisible(page);

    const tableNumber = store.primaryTableNumber;
    const adminTablesPage = await context.newPage();
    await adminTablesPage.goto("/admin/tables");

    const tableCard = adminTablesPage.locator(".table-card", {
      hasText: `Table ${tableNumber}`
    });
    await expect(tableCard).toBeVisible({ timeout: 15_000 });
    await tableCard.getByRole("button", { name: "Close table" }).click();
    await expect(adminTablesPage.locator(".modal-card")).toContainText(`Table ${tableNumber} closed.`);
    await adminTablesPage.getByRole("button", { name: "OK" }).click();

    await expect(
      adminTablesPage.locator(".closed-grid article.info-card h2", {
        hasText: `Table ${tableNumber}`
      })
    ).toHaveCount(1);

    const downloadPromise = adminTablesPage.waitForEvent("download");
    await adminTablesPage.getByRole("button", { name: "Export today to Excel" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(download.suggestedFilename()).toMatch(/^closed-orders-.*\.xls$/);
    expect(downloadPath).not.toBeNull();
    if (downloadPath) {
      const content = readFileSync(downloadPath, "utf8");
      expect(content).toContain(String(tableNumber));
    }

    await adminTablesPage.close();
  });

  test("ADV-02 move table updates live orders and menu session isolation", async ({
    page,
    context
  }) => {
    test.skip(!ORDERING_MENU_PATH, "Set E2E_ORDERING_MENU_PATH to run advanced integration.");

    const store = await setupBackend(context);
    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await waitForSubmittedOrdersInStore(store, 1);
    await closeMessageDialogIfVisible(page);

    const sourceTable = store.primaryTableNumber;
    const targetTable = 77;

    const adminTablesPage = await context.newPage();
    await adminTablesPage.goto("/admin/tables");
    const sourceCard = adminTablesPage.locator(".table-card", {
      hasText: `Table ${sourceTable}`
    });
    await expect(sourceCard).toBeVisible({ timeout: 15_000 });
    await sourceCard.getByRole("button", { name: "Clients changed table" }).click();
    await adminTablesPage.getByPlaceholder("Move to table").fill(String(targetTable));
    await adminTablesPage.getByPlaceholder("Login").fill("manager");
    await adminTablesPage.getByPlaceholder("Password").fill("pass");
    await adminTablesPage.getByRole("button", { name: "Save" }).click();
    await expect(adminTablesPage.locator(".modal-card")).toContainText(
      `Orders moved from table ${sourceTable} to table ${targetTable}.`
    );
    await adminTablesPage.getByRole("button", { name: "OK" }).click();

    const adminOrdersPage = await context.newPage();
    await adminOrdersPage.goto("/admin/orders");
    await expect(
      adminOrdersPage.getByRole("heading", { name: `Table ${targetTable}` })
    ).toBeVisible();
    await expect(
      adminOrdersPage.getByRole("heading", { name: `Table ${sourceTable}` })
    ).toHaveCount(0);

    await expect(page.locator(".submitted-orders")).toHaveCount(0, { timeout: 12_000 });

    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await waitForSubmittedOrdersInStore(store, 2);
    await closeMessageDialogIfVisible(page);

    await expect(
      adminOrdersPage.getByRole("heading", { name: `Table ${targetTable}` })
    ).toBeVisible({ timeout: 12_000 });
    await expect(
      adminOrdersPage.getByRole("heading", { name: `Table ${sourceTable}` })
    ).toBeVisible({ timeout: 12_000 });

    await adminOrdersPage.close();
    await adminTablesPage.close();
  });

  test("ADV-03 happy-hour discounted totals stay consistent in menu, live, tables and export", async ({
    page,
    context
  }) => {
    test.skip(!ORDERING_MENU_PATH, "Set E2E_ORDERING_MENU_PATH to run advanced integration.");

    const store = await setupBackend(context, {
      happyHourDiscountPercent: 20
    });
    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await waitForSubmittedOrdersInStore(store, 1);
    await closeMessageDialogIfVisible(page);

    await expect(page.locator(".submitted-orders__summary")).toContainText("16");
    const liveDiscountedOrder = store.orders.find((order) => order.kind === "order");
    expect(liveDiscountedOrder?.total).toBe(16);

    const tableNumber = store.primaryTableNumber;
    const adminOrdersPage = await context.newPage();
    await adminOrdersPage.goto("/admin/orders");
    const liveOrdersFromApi = (await adminOrdersPage.evaluate(async () => {
      const response = await fetch("/api/orders");
      return (await response.json()) as Array<{ tableNumber: number; total: number }>;
    })) as Array<{ tableNumber: number; total: number }>;
    expect(
      liveOrdersFromApi.some(
        (order) => order.tableNumber === tableNumber && order.total === 16
      )
    ).toBeTruthy();

    const adminTablesPage = await context.newPage();
    await adminTablesPage.goto("/admin/tables");
    const tableCard = adminTablesPage.locator(".table-card", {
      hasText: `Table ${tableNumber}`
    });
    await expect(tableCard).toContainText("16");

    await tableCard.getByRole("button", { name: "Close table" }).click();
    await expect(adminTablesPage.locator(".modal-card")).toContainText(`Table ${tableNumber} closed.`);
    await adminTablesPage.getByRole("button", { name: "OK" }).click();
    await expect(
      adminTablesPage.locator(".closed-grid article.info-card", {
        hasText: `Table ${tableNumber}`
      })
    ).toContainText("16");

    const downloadPromise = adminTablesPage.waitForEvent("download");
    await adminTablesPage.getByRole("button", { name: "Export today to Excel" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    if (downloadPath) {
      const content = readFileSync(downloadPath, "utf8");
      expect(content).toContain("16");
    }

    await adminOrdersPage.close();
    await adminTablesPage.close();
  });

  test("ADV-04 temporary 500 on /api/orders recovers on retry", async ({
    page,
    context
  }) => {
    test.skip(!ORDERING_MENU_PATH, "Set E2E_ORDERING_MENU_PATH to run advanced integration.");

    const store = await setupBackend(context, {
      postFailureQueue: [500]
    });
    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await expect(page.locator(".status-message")).toContainText("Temporary backend error");

    await submitOrderViaReviewDialog(page);
    await waitForSubmittedOrdersInStore(store, 1);
    await expect(page.locator(".submitted-orders__summary")).toBeVisible({ timeout: 12_000 });
    await closeMessageDialogIfVisible(page);

    const adminOrdersPage = await context.newPage();
    await adminOrdersPage.goto("/admin/orders");
    await expect(
      adminOrdersPage.getByRole("heading", { name: `Table ${store.primaryTableNumber}` })
    ).toBeVisible();
    await adminOrdersPage.close();
  });

  test("ADV-05 temporary 429 on /api/orders recovers on retry", async ({
    page,
    context
  }) => {
    test.skip(!ORDERING_MENU_PATH, "Set E2E_ORDERING_MENU_PATH to run advanced integration.");

    const store = await setupBackend(context, {
      postFailureQueue: [429]
    });
    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await expect(page.locator(".status-message")).toContainText("Too many order requests");

    await submitOrderViaReviewDialog(page);
    await waitForSubmittedOrdersInStore(store, 1);
    await expect(page.locator(".submitted-orders__summary")).toBeVisible({ timeout: 12_000 });
    await closeMessageDialogIfVisible(page);

    const adminOrdersPage = await context.newPage();
    await adminOrdersPage.goto("/admin/orders");
    await expect(
      adminOrdersPage.getByRole("heading", { name: `Table ${store.primaryTableNumber}` })
    ).toBeVisible();
    await adminOrdersPage.close();
  });

  test("ADV-06 cross-device sync: order from device A appears on device B and in admin", async ({
    browser
  }) => {
    test.skip(!ORDERING_MENU_PATH, "Set E2E_ORDERING_MENU_PATH to run advanced integration.");

    const sharedStore = createStore();
    const contextA = await browser.newContext({ baseURL: BASE_URL });
    const contextB = await browser.newContext({ baseURL: BASE_URL });
    const contextAdmin = await browser.newContext({ baseURL: BASE_URL });

    try {
      await attachSharedBackend(contextA, sharedStore);
      await attachSharedBackend(contextB, sharedStore);
      await attachSharedBackend(contextAdmin, sharedStore);

      await contextA.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });
      await contextB.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });
      await contextAdmin.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });

      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();
      const adminPage = await contextAdmin.newPage();

      await openMenuInEnglish(pageA, ORDERING_MENU_PATH);
      await openMenuInEnglish(pageB, ORDERING_MENU_PATH);
      await adminPage.goto("/admin/orders");
      await expect(adminPage.getByText("No incoming orders yet.")).toBeVisible();

      await addFirstDish(pageA, 1);
      await submitOrderViaReviewDialog(pageA);
      await closeMessageDialogIfVisible(pageA);

      await expect(pageB.locator(".submitted-orders__summary")).toBeVisible({ timeout: 12_000 });
      await expect(
        adminPage.getByRole("heading", {
          name: `Table ${sharedStore.primaryTableNumber}`
        })
      ).toBeVisible({ timeout: 12_000 });
    } finally {
      await contextA.close();
      await contextB.close();
      await contextAdmin.close();
    }
  });

  test("ADV-07 cross-device sync: waiter call disables service button on other device", async ({
    browser
  }) => {
    test.skip(!ORDERING_MENU_PATH, "Set E2E_ORDERING_MENU_PATH to run advanced integration.");

    const sharedStore = createStore();
    const contextA = await browser.newContext({ baseURL: BASE_URL });
    const contextB = await browser.newContext({ baseURL: BASE_URL });
    const contextAdmin = await browser.newContext({ baseURL: BASE_URL });

    try {
      await attachSharedBackend(contextA, sharedStore);
      await attachSharedBackend(contextB, sharedStore);
      await attachSharedBackend(contextAdmin, sharedStore);

      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();
      const adminPage = await contextAdmin.newPage();

      await openMenuInEnglish(pageA, ORDERING_MENU_PATH);
      await openMenuInEnglish(pageB, ORDERING_MENU_PATH);

      await openServiceMenu(pageA);
      await pageA.getByRole("button", { name: "Help / question" }).click();
      await closeMessageDialogIfVisible(pageA);

      await expect(pageB.getByRole("button", { name: "Call waiter" })).toBeDisabled({
        timeout: 12_000
      });

      await adminPage.goto("/admin/orders");
      await expect(
        adminPage.getByRole("heading", {
          name: `Table ${sharedStore.primaryTableNumber} · Waiter call`
        })
      ).toBeVisible({ timeout: 12_000 });
    } finally {
      await contextA.close();
      await contextB.close();
      await contextAdmin.close();
    }
  });

  test("ADV-08 cross-device race: two clients submit simultaneously and stay synced", async ({
    browser
  }) => {
    test.skip(!ORDERING_MENU_PATH, "Set E2E_ORDERING_MENU_PATH to run advanced integration.");

    const sharedStore = createStore();
    const contextA = await browser.newContext({ baseURL: BASE_URL });
    const contextB = await browser.newContext({ baseURL: BASE_URL });
    const contextAdmin = await browser.newContext({ baseURL: BASE_URL });

    try {
      await attachSharedBackend(contextA, sharedStore);
      await attachSharedBackend(contextB, sharedStore);
      await attachSharedBackend(contextAdmin, sharedStore);

      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();
      const adminPage = await contextAdmin.newPage();

      await openMenuInEnglish(pageA, ORDERING_MENU_PATH);
      await openMenuInEnglish(pageB, ORDERING_MENU_PATH);
      await adminPage.goto("/admin/orders");

      await Promise.all([
        (async () => {
          await addFirstDish(pageA, 1);
          await submitOrderViaReviewDialog(pageA);
          await closeMessageDialogIfVisible(pageA);
        })(),
        (async () => {
          await addFirstDish(pageB, 1);
          await submitOrderViaReviewDialog(pageB);
          await closeMessageDialogIfVisible(pageB);
        })()
      ]);

      await expect(pageA.locator(".submitted-order-card")).toHaveCount(2, {
        timeout: 12_000
      });
      await expect(pageB.locator(".submitted-order-card")).toHaveCount(2, {
        timeout: 12_000
      });
      await expect(
        adminPage.locator("article.order-card h3", {
          hasText: `Table ${sharedStore.primaryTableNumber}`
        })
      ).toHaveCount(2, { timeout: 12_000 });
    } finally {
      await contextA.close();
      await contextB.close();
      await contextAdmin.close();
    }
  });

  test("ADV-09 night-shift boundary: closed tables filter before/at/after workingHoursFrom", async ({
    page,
    context
  }) => {
    const workingHoursFrom = "09:00";
    const shiftStart = getShiftStartForWorkingHours(workingHoursFrom);

    const previousShiftClosedAt = new Date(shiftStart.getTime() - 60 * 1000).toISOString();
    const boundaryClosedAt = shiftStart.toISOString();
    const currentShiftClosedAt = new Date(shiftStart.getTime() + 10 * 60 * 1000).toISOString();

    const store = await setupBackend(context, {
      workingHoursFrom,
      initialClosedSessions: [
        createClosedSession({
          tableNumber: 201,
          sessionId: 1201,
          closedAt: previousShiftClosedAt,
          total: 44,
          itemName: "Previous shift"
        }),
        createClosedSession({
          tableNumber: 202,
          sessionId: 1202,
          closedAt: boundaryClosedAt,
          total: 88,
          itemName: "Shift boundary"
        }),
        createClosedSession({
          tableNumber: 203,
          sessionId: 1203,
          closedAt: currentShiftClosedAt,
          total: 99,
          itemName: "Current shift"
        })
      ]
    });

    expect(store.closedSessions).toHaveLength(3);

    await page.goto("/admin/tables");
    await expect(page.getByRole("heading", { name: "Closed tables" })).toBeVisible();
    await expect(
      page.locator(".closed-grid article.info-card h2", { hasText: "Table 202" })
    ).toHaveCount(1);
    await expect(
      page.locator(".closed-grid article.info-card h2", { hasText: "Table 201" })
    ).toHaveCount(0);
    await expect(
      page.locator(".closed-grid article.info-card h2", { hasText: "Table 203" })
    ).toHaveCount(1);
  });

  test("ADV-10 non-ordering mode hides submit and waiter actions", async ({ page }) => {
    await page.goto(PREVIEW_MENU_PATH);
    await dismissWelcomeDialogIfVisible(page);
    await clickLanguageButtonWithRetry(page, "EN");
    await dismissWelcomeDialogIfVisible(page);

    await expect(page.locator(".cart-submit")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Call waiter" })).toHaveCount(0);
  });
});
