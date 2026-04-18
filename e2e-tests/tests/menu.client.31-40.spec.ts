import { expect, Page, test } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";

type SubmittedOrder = {
  id: string;
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  sessionId: number;
  status: "new" | "preparing" | "served" | "cancelled";
  kind: "order";
  serveMode: "as_ready" | "all_at_once";
  createdAt: string;
  total: number;
  items: Array<{
    id: string;
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    served: boolean;
  }>;
};

type TablesSnapshot = {
  currentSessionId: number;
  submittedOrders: SubmittedOrder[];
  activeServiceRequests: Array<"waiter_call" | "bill_request" | "order">;
};

function createSubmittedOrder(
  id: string,
  status: SubmittedOrder["status"],
  createdAt: string,
  name: string
): SubmittedOrder {
  return {
    id,
    restaurantSlug: MENU_RESTAURANT_SLUG,
    restaurantName: "E2E Restaurant",
    tableNumber: 1,
    sessionId: 1,
    status,
    kind: "order",
    serveMode: "as_ready",
    createdAt,
    total: 20,
    items: [
      {
        id: `${id}-item-1`,
        menuItemId: `${id}-menu-item`,
        name,
        price: 20,
        quantity: 1,
        served: status === "served"
      }
    ]
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

async function addFirstDish(page: Page) {
  await page.getByRole("button", { name: /Dishes/i }).first().click();
  const addButton = page
    .locator(".menu-card .menu-card__footer button")
    .filter({ hasText: "Add" })
    .first();
  await expect(addButton).toBeVisible();
  await addButton.click();
}

async function openServiceMenu(page: Page) {
  const callWaiterButton = page.getByRole("button", { name: "Call waiter" });
  await expect(callWaiterButton).toBeVisible();
  await callWaiterButton.click();
}

async function closeMessageDialog(page: Page) {
  const ackButton = page.locator(".modal-card__ack").first();
  const isVisible = await ackButton.isVisible().catch(() => false);

  if (isVisible) {
    await ackButton.click();
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
  await reviewDialog.getByRole("button", { name: "OK" }).click();
}

async function mockTablesSnapshots(page: Page, snapshots: TablesSnapshot[]) {
  let callCount = 0;

  await page.route("**/api/tables/**", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    const index = Math.min(callCount, snapshots.length - 1);
    callCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshots[index])
    });
  });

  return () => callCount;
}

async function mockOrderPostSuccess(page: Page) {
  let counter = 0;

  await page.route("**/api/orders**", async (route, request) => {
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }

    const body = JSON.parse(request.postData() ?? "{}") as {
      type?: string;
      restaurantSlug?: string;
      tableNumber?: number;
      serveMode?: "as_ready" | "all_at_once";
      items?: Array<{
        menuItemId: string;
        quantity: number;
        priceOverride?: number;
      }>;
    };

    if (body.type === "waiter_call" || body.type === "bill_request") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
      return;
    }

    counter += 1;
    const total = (body.items ?? []).reduce(
      (sum, item) => sum + (item.priceOverride ?? 20) * item.quantity,
      0
    );

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: `e2e-order-${counter}`,
        restaurantSlug: body.restaurantSlug ?? MENU_RESTAURANT_SLUG,
        restaurantName: "E2E Restaurant",
        tableNumber: body.tableNumber ?? 1,
        sessionId: 1,
        status: "new",
        kind: "order",
        serveMode: body.serveMode ?? "as_ready",
        createdAt: new Date().toISOString(),
        total,
        items: [
          {
            id: `e2e-item-${counter}`,
            menuItemId: "m1",
            name: "E2E item",
            price: total || 20,
            quantity: 1,
            served: false
          }
        ]
      })
    });
  });
}

test.describe("Client menu checks TC-31..TC-40", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("TC-31 call waiter succeeds and shows confirmation", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [], activeServiceRequests: [] }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await openServiceMenu(page);
    await page.getByRole("button", { name: "Help / question" }).click();

    await expect(page.locator(".modal-card__message")).toContainText("Waiter has been called");
  });

  test("TC-32 repeated waiter call is blocked by cooldown", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    let waiterCallCount = 0;

    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [], activeServiceRequests: [] }
    ]);
    await page.route("**/api/orders**", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const body = JSON.parse(request.postData() ?? "{}") as { type?: string };
      if (body.type === "waiter_call") {
        waiterCallCount += 1;
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await openServiceMenu(page);
    await page.getByRole("button", { name: "Help / question" }).click();
    await expect(page.locator(".modal-card__message")).toContainText("Waiter has been called");
    await closeMessageDialog(page);

    await expect(page.getByRole("button", { name: "Call waiter" })).toBeDisabled();
    expect(waiterCallCount).toBe(1);
  });

  test("TC-33 bring bill succeeds and shows confirmation", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [], activeServiceRequests: [] }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await openServiceMenu(page);
    await page.getByRole("button", { name: "Bring bill" }).click();

    await expect(page.locator(".modal-card__message")).toContainText(
      "A waiter will bring your bill shortly."
    );
  });

  test("TC-34 waiter request error is shown to user", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [], activeServiceRequests: [] }
    ]);
    await page.route("**/api/orders**", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const body = JSON.parse(request.postData() ?? "{}") as { type?: string };
      if (body.type === "waiter_call") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "Failed to call the waiter" })
        });
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await openServiceMenu(page);
    await page.getByRole("button", { name: "Help / question" }).click();

    await expect(page.locator(".modal-card__message")).toContainText("Failed to call the waiter");
  });

  test("TC-35 bill request error is shown to user", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [], activeServiceRequests: [] }
    ]);
    await page.route("**/api/orders**", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const body = JSON.parse(request.postData() ?? "{}") as { type?: string };
      if (body.type === "bill_request") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "Failed to request the bill" })
        });
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await openServiceMenu(page);
    await page.getByRole("button", { name: "Bring bill" }).click();

    await expect(page.locator(".modal-card__message")).toContainText("Failed to request the bill");
  });

  test("TC-36 service actions do not clear current cart", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [], activeServiceRequests: [] }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page);
    await expect(page.locator(".cart-row")).toHaveCount(1);

    await openServiceMenu(page);
    await page.getByRole("button", { name: "Help / question" }).click();
    await expect(page.locator(".modal-card__message")).toContainText("Waiter has been called");
    await closeMessageDialog(page);

    await expect(page.locator(".cart-row")).toHaveCount(1);
  });

  test("TC-37 submitted order appears in Current orders", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [], activeServiceRequests: [] }
    ]);
    await mockOrderPostSuccess(page);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page);
    await submitOrderViaReviewDialog(page);

    await expect(page.locator(".submitted-orders__summary")).toContainText("Current orders");
    await expect(page.locator(".submitted-orders__summary")).toContainText(/\(.*₪\)/);
  });

  test("TC-38 status changes new -> preparing -> served are reflected", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await page.addInitScript(() => {
      const originalSetInterval = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        originalSetInterval(handler, Math.min(Number(timeout ?? 0), 350), ...args)) as typeof window.setInterval;
    });

    const baseTime = new Date().toISOString();
    const orderNew = createSubmittedOrder("status-order-1", "new", baseTime, "Status item");
    const orderPreparing = { ...orderNew, status: "preparing" as const };
    const orderServed = { ...orderNew, status: "served" as const };

    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [orderNew], activeServiceRequests: [] },
      { currentSessionId: 1, submittedOrders: [orderPreparing], activeServiceRequests: [] },
      { currentSessionId: 1, submittedOrders: [orderServed], activeServiceRequests: [] }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.locator(".submitted-orders__summary")).toContainText("New");
    await expect(page.locator(".submitted-orders__summary")).toContainText("Preparing");
    await expect(page.locator(".submitted-orders__summary")).toContainText("Served");
  });

  test("TC-39 submitted orders are sorted by newest first", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    const newer = createSubmittedOrder(
      "newer-order",
      "new",
      new Date(Date.now() + 60_000).toISOString(),
      "Fresh item"
    );
    const older = createSubmittedOrder(
      "older-order",
      "new",
      new Date(Date.now() - 60_000).toISOString(),
      "Old item"
    );

    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [older, newer], activeServiceRequests: [] }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    const details = page.locator("details.submitted-orders");
    await expect(details).toBeVisible();
    await details.locator("summary").click();

    const firstOrderCard = page.locator(".submitted-order-card").first();
    await expect(firstOrderCard).toContainText("Fresh item");
  });

  test("TC-40 polling does not duplicate submitted orders", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await page.addInitScript(() => {
      const originalSetInterval = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        originalSetInterval(handler, Math.min(Number(timeout ?? 0), 350), ...args)) as typeof window.setInterval;
    });

    const order = createSubmittedOrder(
      "stable-order",
      "new",
      new Date().toISOString(),
      "Stable item"
    );

    const getCallCount = await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [order], activeServiceRequests: [] },
      { currentSessionId: 1, submittedOrders: [order], activeServiceRequests: [] },
      { currentSessionId: 1, submittedOrders: [order], activeServiceRequests: [] }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.locator(".submitted-orders__summary")).toContainText("Current orders");
    await expect(page.locator(".submitted-order-card")).toHaveCount(1);

    await expect
      .poll(() => getCallCount(), { timeout: 8_000 })
      .toBeGreaterThanOrEqual(3);

    await expect(page.locator(".submitted-order-card")).toHaveCount(1);
  });
});
