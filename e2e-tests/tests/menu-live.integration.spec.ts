import { expect, Page, BrowserContext, test } from "@playwright/test";

const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";
const ORDER_MERGE_WINDOW_MS = 3 * 60 * 1000;

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

type IntegrationStore = {
  currentSessionId: number;
  ordersForGuest: IntegrationOrder[];
  activeOrdersForAdmin: IntegrationOrder[];
  orderPayloadSignatures: Map<string, string>;
  nextOrderId: number;
  nextItemId: number;
};

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
  const isKitchenClosed = (await page.getByText("Kitchen closed").count()) > 0;
  const isBarClosed = (await page.getByText("Bar closed").count()) > 0;

  if (isKitchenClosed && isBarClosed) {
    throw new Error("Both kitchen and bar are closed. Cannot add any orderable item.");
  }

  const targetSection = isKitchenClosed ? /Drinks/i : /Dishes/i;
  await page.getByRole("button", { name: targetSection }).first().click();

  for (let index = 0; index < quantity; index += 1) {
    const flatAddButton = page
      .locator(".menu-card .menu-card__footer button")
      .filter({ hasText: "Add" })
      .first();

    if ((await flatAddButton.count()) > 0) {
      await expect(flatAddButton).toBeVisible();
      await flatAddButton.click();
      continue;
    }

    const volumeAddButton = page
      .locator(".menu-card__volume-row button")
      .filter({ hasText: "Add" })
      .first();
    await expect(volumeAddButton).toBeVisible();
    await volumeAddButton.click();
  }
}

async function openServiceMenu(page: Page) {
  const callWaiterButton = page.getByRole("button", { name: "Call waiter" });
  await expect(callWaiterButton).toBeVisible();
  await callWaiterButton.click();
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
  await reviewDialog.getByRole("button", { name: "OK" }).click();
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

function getActiveServiceRequests(orders: IntegrationOrder[]) {
  return orders
    .filter(
      (order) =>
        (order.kind === "waiter_call" || order.kind === "bill_request") &&
        order.status !== "served" &&
        order.status !== "cancelled"
    )
    .map((order) => order.kind);
}

function createOrderPayloadSignature(
  items: Array<{
    menuItemId: string;
    quantity: number;
    volumeOptionId?: string;
    volumeLabel?: string;
    priceOverride?: number;
  }>,
  serveMode?: "all_at_once" | "as_ready"
) {
  const normalizedItems = items
    .map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      volumeOptionId: item.volumeOptionId ?? "",
      volumeLabel: item.volumeLabel ?? "",
      priceOverride:
        typeof item.priceOverride === "number" && Number.isFinite(item.priceOverride)
          ? item.priceOverride
          : null
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );

  return JSON.stringify({
    serveMode: serveMode ?? "all_at_once",
    items: normalizedItems
  });
}

function mergeIntegrationItems(
  currentItems: IntegrationOrderItem[],
  nextItems: IntegrationOrderItem[]
) {
  const mergedItems = currentItems.map((item) => ({ ...item }));

  for (const nextItem of nextItems) {
    const existing = mergedItems.find(
      (item) =>
        item.menuItemId === nextItem.menuItemId &&
        (item.volumeOptionId ?? "") === (nextItem.volumeOptionId ?? "") &&
        (item.volumeLabel ?? "") === (nextItem.volumeLabel ?? "") &&
        !item.served
    );

    if (existing) {
      existing.quantity += nextItem.quantity;
      continue;
    }

    mergedItems.push({ ...nextItem });
  }

  return mergedItems;
}

async function setupSharedMenuLiveBackend(context: BrowserContext) {
  const store: IntegrationStore = {
    currentSessionId: 1,
    ordersForGuest: [],
    activeOrdersForAdmin: [],
    orderPayloadSignatures: new Map<string, string>(),
    nextOrderId: 1,
    nextItemId: 1
  };

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

  await context.route("**/api/tables/**", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    const submittedOrders = store.ordersForGuest
      .filter((order) => order.kind === "order")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currentSessionId: store.currentSessionId,
        submittedOrders,
        activeServiceRequests: getActiveServiceRequests(store.ordersForGuest)
      })
    });
  });

  await context.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
    if (request.method() === "GET") {
      const activeOrders = store.activeOrdersForAdmin
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
      const body = JSON.parse(request.postData() ?? "{}") as {
        type?: "waiter_call" | "bill_request";
        restaurantSlug?: string;
        tableNumber?: number;
        serveMode?: "all_at_once" | "as_ready";
        items?: Array<{
          menuItemId: string;
          quantity: number;
          volumeOptionId?: string;
          volumeLabel?: string;
          priceOverride?: number;
        }>;
      };

      const nowTs = Date.now();
      const now = new Date(nowTs).toISOString();
      const nextOrderId = `integration-order-${store.nextOrderId++}`;
      const tableNumber = body.tableNumber ?? 1;
      const kind = body.type ?? "order";
      const restaurantSlug = body.restaurantSlug ?? "olive-bistro";

      const items: IntegrationOrderItem[] =
        kind === "order"
          ? (body.items ?? []).map((item, index) => ({
              id: `integration-item-${store.nextItemId++}`,
              menuItemId: item.menuItemId,
              name: `Integration item ${index + 1}`,
              category: "mains",
              price: item.priceOverride ?? 20,
              quantity: item.quantity,
              served: false,
              volumeOptionId: item.volumeOptionId,
              volumeLabel: item.volumeLabel
            }))
          : [];

      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const payloadSignature =
        kind === "order"
          ? createOrderPayloadSignature(body.items ?? [], body.serveMode)
          : null;
      const mergeTarget =
        kind === "order" && payloadSignature
          ? store.ordersForGuest.find((order) => {
              if (
                order.kind !== "order" ||
                order.tableNumber !== tableNumber ||
                order.sessionId !== store.currentSessionId ||
                order.status !== "new"
              ) {
                return false;
              }

              const createdAt = new Date(order.createdAt).getTime();
              if (!Number.isFinite(createdAt) || nowTs - createdAt >= ORDER_MERGE_WINDOW_MS) {
                return false;
              }

              return store.orderPayloadSignatures.get(order.id) === payloadSignature;
            })
          : undefined;

      if (mergeTarget && payloadSignature) {
        const mergedItems = mergeIntegrationItems(mergeTarget.items, items);
        const mergedOrder: IntegrationOrder = {
          ...mergeTarget,
          serveMode: body.serveMode ?? mergeTarget.serveMode,
          items: mergedItems,
          total: mergedItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
          updatedAt: now
        };

        store.ordersForGuest = store.ordersForGuest.map((order) =>
          order.id === mergedOrder.id ? mergedOrder : order
        );
        store.activeOrdersForAdmin = store.activeOrdersForAdmin.map((order) =>
          order.id === mergedOrder.id ? mergedOrder : order
        );
        store.orderPayloadSignatures.set(mergedOrder.id, payloadSignature);

        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(mergedOrder)
        });
        return;
      }

      const order: IntegrationOrder = {
        id: nextOrderId,
        restaurantSlug,
        restaurantName: "Integration Restaurant",
        tableNumber,
        sessionId: store.currentSessionId,
        status: "new",
        kind,
        serveMode: body.serveMode ?? "as_ready",
        createdAt: now,
        updatedAt: now,
        total,
        items
      };

      store.ordersForGuest = [order, ...store.ordersForGuest];
      store.activeOrdersForAdmin = [order, ...store.activeOrdersForAdmin];
      if (payloadSignature) {
        store.orderPayloadSignatures.set(order.id, payloadSignature);
      }

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
      const now = new Date().toISOString();
      const orderId = body.orderId ?? "";
      const nextStatus = body.status ?? "new";

      let updatedOrder: IntegrationOrder | null = null;

      store.ordersForGuest = store.ordersForGuest.map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        updatedOrder = {
          ...order,
          status: nextStatus,
          updatedAt: now
        };
        return updatedOrder;
      });

      store.activeOrdersForAdmin = store.activeOrdersForAdmin
        .map((order) => {
          if (order.id !== orderId) {
            return order;
          }

          return {
            ...order,
            status: nextStatus,
            updatedAt: now
          };
        })
        .filter((order) => order.status !== "served" && order.status !== "cancelled");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          updatedOrder ?? {
            id: orderId,
            status: nextStatus
          }
        )
      });
      return;
    }

    await route.continue();
  });

  return store;
}

test.describe("Menu + Live Orders integration", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("INT-01 guest order from menu appears in admin Live Orders", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page);
    await submitOrderViaReviewDialog(page);
    await expect(page.locator(".modal-card")).toContainText("Your order has been sent.");

    const orderTableNumber = store.ordersForGuest[0]?.tableNumber ?? 1;
    await adminPage.goto("/admin/orders");
    await expect(
      adminPage.getByRole("heading", { name: `Table ${orderTableNumber}` })
    ).toBeVisible();
    await expect(adminPage.locator("article.order-card")).toContainText("Integration item 1");

    await adminPage.close();
  });

  test("INT-02 admin serves order and guest sees Served status in current orders", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page);
    await submitOrderViaReviewDialog(page);
    await expect(page.locator(".submitted-orders__summary")).toBeVisible();

    const orderTableNumber = store.ordersForGuest[0]?.tableNumber ?? 1;
    await adminPage.goto("/admin/orders");
    await expect(
      adminPage.getByRole("heading", { name: `Table ${orderTableNumber}` })
    ).toBeVisible();

    await adminPage.getByRole("button", { name: "Served" }).click();
    await expect(
      adminPage.getByRole("heading", { name: `Table ${orderTableNumber}` })
    ).toHaveCount(0);

    await expect(page.locator(".submitted-orders__summary")).toContainText("Served", {
      timeout: 12_000
    });

    await adminPage.close();
  });

  test("INT-03 waiter call from menu appears in Live Orders and can be acknowledged", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await page.getByRole("button", { name: "Call waiter" }).click();
    await page.getByRole("button", { name: "Help / question" }).click();
    await expect(page.locator(".modal-card__message")).toContainText("Waiter has been called");

    const waiterCallTable = store.ordersForGuest.find((order) => order.kind === "waiter_call")
      ?.tableNumber;

    await adminPage.goto("/admin/orders");
    await expect(
      adminPage.getByRole("heading", {
        name: `Table ${waiterCallTable ?? 1} · Waiter call`
      })
    ).toBeVisible();

    await adminPage.getByRole("button", { name: "OK" }).click();
    await expect(
      adminPage.getByRole("heading", {
        name: `Table ${waiterCallTable ?? 1} · Waiter call`
      })
    ).toHaveCount(0);

    await adminPage.close();
  });

  test("INT-04 bill request from menu appears in Live Orders and can be acknowledged", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await page.getByRole("button", { name: "Call waiter" }).click();
    await page.getByRole("button", { name: "Bring bill" }).click();
    await expect(page.locator(".modal-card__message")).toContainText("bring your bill");

    const billRequestTable = store.ordersForGuest.find((order) => order.kind === "bill_request")
      ?.tableNumber;

    await adminPage.goto("/admin/orders");
    await expect(
      adminPage.getByRole("heading", {
        name: `Table ${billRequestTable ?? 1} · Bill request`
      })
    ).toBeVisible();

    await adminPage.getByRole("button", { name: "OK" }).click();
    await expect(
      adminPage.getByRole("heading", {
        name: `Table ${billRequestTable ?? 1} · Bill request`
      })
    ).toHaveCount(0);

    await adminPage.close();
  });

  test("INT-05 two different payload orders appear as two cards in admin and guest history", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await closeMessageDialogIfVisible(page);

    await addFirstDish(page, 2);
    await submitOrderViaReviewDialog(page);
    await closeMessageDialogIfVisible(page);

    const orderTable = store.ordersForGuest.find((order) => order.kind === "order")?.tableNumber ?? 1;

    await adminPage.goto("/admin/orders");
    await expect(adminPage.getByRole("heading", { name: `Table ${orderTable}` })).toHaveCount(2);
    await expect(page.locator(".submitted-order-card")).toHaveCount(2);

    await adminPage.close();
  });

  test("INT-06 quick repeat submit merges into a single order entry", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await closeMessageDialogIfVisible(page);

    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await closeMessageDialogIfVisible(page);

    const activeGuestOrders = store.ordersForGuest.filter((order) => order.kind === "order");
    expect(activeGuestOrders).toHaveLength(1);
    expect(activeGuestOrders[0]?.items[0]?.quantity).toBe(2);

    await adminPage.goto("/admin/orders");
    await expect(adminPage.locator("article.order-card")).toHaveCount(1);
    await expect(page.locator(".submitted-order-card")).toHaveCount(1);

    await adminPage.close();
  });

  test("INT-07 admin page auto-refresh picks up new guest order without reload", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await adminPage.goto("/admin/orders");
    await expect(adminPage.getByText("No incoming orders yet.")).toBeVisible();

    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await closeMessageDialogIfVisible(page);

    const orderTableNumber = store.ordersForGuest[0]?.tableNumber ?? 1;
    await expect(
      adminPage.getByRole("heading", { name: `Table ${orderTableNumber}` })
    ).toBeVisible({ timeout: 12_000 });

    await adminPage.close();
  });

  test("INT-08 waiter call disables service button and keeps single live request", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await openServiceMenu(page);
    await page.getByRole("button", { name: "Help / question" }).click();
    await closeMessageDialogIfVisible(page);

    await expect(page.getByRole("button", { name: "Call waiter" })).toBeDisabled();

    const waiterCalls = store.ordersForGuest.filter((order) => order.kind === "waiter_call");
    expect(waiterCalls).toHaveLength(1);

    await adminPage.goto("/admin/orders");
    const waiterHeading = `Table ${waiterCalls[0]?.tableNumber ?? 1} · Waiter call`;
    await expect(adminPage.getByRole("heading", { name: waiterHeading })).toHaveCount(1);

    await adminPage.close();
  });

  test("INT-09 bill request disables service button and keeps single live request", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await openServiceMenu(page);
    await page.getByRole("button", { name: "Bring bill" }).click();
    await closeMessageDialogIfVisible(page);

    await expect(page.getByRole("button", { name: "Call waiter" })).toBeDisabled();

    const billRequests = store.ordersForGuest.filter((order) => order.kind === "bill_request");
    expect(billRequests).toHaveLength(1);

    await adminPage.goto("/admin/orders");
    const billHeading = `Table ${billRequests[0]?.tableNumber ?? 1} · Bill request`;
    await expect(adminPage.getByRole("heading", { name: billHeading })).toHaveCount(1);

    await adminPage.close();
  });

  test("INT-10 one served and one active order keep consistent state across menu and admin", async ({
    page,
    context
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH with a real table URL to run integration tests."
    );

    const store = await setupSharedMenuLiveBackend(context);
    const adminPage = await context.newPage();

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page, 1);
    await submitOrderViaReviewDialog(page);
    await closeMessageDialogIfVisible(page);
    await addFirstDish(page, 2);
    await submitOrderViaReviewDialog(page);
    await closeMessageDialogIfVisible(page);

    const tableNumber = store.ordersForGuest.find((order) => order.kind === "order")?.tableNumber ?? 1;

    await adminPage.goto("/admin/orders");
    await expect(adminPage.getByRole("heading", { name: `Table ${tableNumber}` })).toHaveCount(2);

    await adminPage.locator("article.order-card").first().getByRole("button", { name: "Served" }).click();
    await expect(adminPage.getByRole("heading", { name: `Table ${tableNumber}` })).toHaveCount(1);

    await expect(page.locator(".submitted-orders__summary")).toContainText("Current orders");
    await expect(page.locator(".submitted-order-card")).toHaveCount(2);
    await expect(page.locator(".submitted-order-card .status-pill--served")).toHaveCount(1, {
      timeout: 12_000
    });

    await adminPage.close();
  });
});
