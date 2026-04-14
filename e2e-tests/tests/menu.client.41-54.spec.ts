import { expect, Page, test, type APIRequestContext } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
const PREVIEW_MENU_PATH =
  process.env.E2E_MENU_PREVIEW_PATH ?? `/menu/${MENU_RESTAURANT_SLUG}/0`;
const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";
const E2E_BASE_ORIGIN =
  (process.env.E2E_BASE_URL ?? "https://restaurant-order-system-blue.vercel.app").replace(
    /\/$/,
    ""
  );
const SECONDARY_LOGIN =
  process.env.E2E_ADMIN_SECONDARY_LOGIN ?? process.env.ADMIN_SECONDARY_LOGIN ?? "admin";
const SECONDARY_PASSWORD =
  process.env.E2E_ADMIN_SECONDARY_PASSWORD ?? process.env.ADMIN_SECONDARY_PASSWORD ?? "admin";

type OperationSettingsSnapshot = {
  kitchenOpenEnabled: boolean;
  kitchenOpenUntil: string | null;
  barOpenEnabled: boolean;
  barOpenUntil: string | null;
};

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
  menu?: unknown[];
};

function parseCurrency(value: string) {
  const normalized = value
    .replace(/\u00A0/g, " ")
    .replace(/[^\d,.-]/g, "")
    .replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Unable to parse currency from "${value}"`);
  }

  return parsed;
}

function parseMenuPath(menuPath: string) {
  const pathname = new URL(menuPath, "https://example.local").pathname;
  const prefixedMatch = /^\/menu\/([^/]+)\/([^/]+)/.exec(pathname);

  if (prefixedMatch) {
    return {
      restaurantSlug: decodeURIComponent(prefixedMatch[1]),
      tableToken: decodeURIComponent(prefixedMatch[2])
    };
  }

  const slugFirstMatch = /^\/([^/]+)\/menu\/([^/]+)/.exec(pathname);

  if (slugFirstMatch) {
    return {
      restaurantSlug: decodeURIComponent(slugFirstMatch[1]),
      tableToken: decodeURIComponent(slugFirstMatch[2])
    };
  }

  return {
    restaurantSlug: MENU_RESTAURANT_SLUG,
    tableToken: "0"
  };
}

function inFuture(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function fetchOperationSettingsSnapshot(
  request: APIRequestContext,
  restaurantSlug: string
): Promise<OperationSettingsSnapshot> {
  const response = await request.get(
    `/api/menu-settings?restaurantSlug=${encodeURIComponent(restaurantSlug)}`,
    { failOnStatusCode: false }
  );
  const result = {
    status: response.status(),
    body: await response.text()
  };

  expect(result.status, `menu-settings GET failed: ${result.body}`).toBe(200);
  const parsed = JSON.parse(result.body) as Partial<OperationSettingsSnapshot>;

  return {
    kitchenOpenEnabled: Boolean(parsed.kitchenOpenEnabled),
    kitchenOpenUntil:
      typeof parsed.kitchenOpenUntil === "string" ? parsed.kitchenOpenUntil : null,
    barOpenEnabled: Boolean(parsed.barOpenEnabled),
    barOpenUntil: typeof parsed.barOpenUntil === "string" ? parsed.barOpenUntil : null
  };
}

async function patchOperationSettings(
  request: APIRequestContext,
  restaurantSlug: string,
  updates: Partial<OperationSettingsSnapshot>
) {
  const response = await request.patch("/api/menu-settings", {
    failOnStatusCode: false,
    headers: {
      "Content-Type": "application/json",
      "x-admin-secondary-login": SECONDARY_LOGIN,
      "x-admin-secondary-password": SECONDARY_PASSWORD,
      Origin: E2E_BASE_ORIGIN,
      Referer: `${E2E_BASE_ORIGIN}/admin/menu`
    },
    data: {
      restaurantSlug,
      ...updates
    }
  });
  const result = {
    status: response.status(),
    body: await response.text()
  };

  expect(result.status, `menu-settings PATCH failed: ${result.body}`).toBe(200);
}

async function waitForOperationSettings(
  request: APIRequestContext,
  restaurantSlug: string,
  expected: Partial<OperationSettingsSnapshot>,
  timeoutMs = 20_000
) {
  const hasMatchingTimeState = (
    expectedValue: string | null | undefined,
    actualValue: string | null
  ) => {
    if (expectedValue === undefined) {
      return true;
    }

    if (expectedValue === null) {
      return actualValue === null;
    }

    if (typeof actualValue !== "string") {
      return false;
    }

    const expectedTs = Date.parse(expectedValue);
    const actualTs = Date.parse(actualValue);

    if (!Number.isFinite(expectedTs) || !Number.isFinite(actualTs)) {
      return false;
    }

    const now = Date.now();
    const expectedIsPast = expectedTs <= now;
    const actualIsPast = actualTs <= now;

    return expectedIsPast === actualIsPast;
  };

  await expect
    .poll(
      async () => {
        const next = await fetchOperationSettingsSnapshot(request, restaurantSlug);

        if (
          expected.kitchenOpenEnabled !== undefined &&
          next.kitchenOpenEnabled !== expected.kitchenOpenEnabled
        ) {
          return false;
        }

        if (!hasMatchingTimeState(expected.kitchenOpenUntil, next.kitchenOpenUntil)) {
          return false;
        }

        if (
          expected.barOpenEnabled !== undefined &&
          next.barOpenEnabled !== expected.barOpenEnabled
        ) {
          return false;
        }

        if (!hasMatchingTimeState(expected.barOpenUntil, next.barOpenUntil)) {
          return false;
        }

        return true;
      },
      { timeout: timeoutMs }
    )
    .toBe(true);
}

async function withOpenedKitchenAndBar(
  request: APIRequestContext,
  menuPath: string,
  run: () => Promise<void>
) {
  const { restaurantSlug } = parseMenuPath(menuPath);
  const originalSettings = await fetchOperationSettingsSnapshot(request, restaurantSlug);

  try {
    const kitchenOpenUntil = inFuture(180);
    const barOpenUntil = inFuture(180);
    await patchOperationSettings(request, restaurantSlug, {
      kitchenOpenEnabled: true,
      kitchenOpenUntil,
      barOpenEnabled: true,
      barOpenUntil
    });
    await waitForOperationSettings(request, restaurantSlug, {
      kitchenOpenEnabled: true,
      kitchenOpenUntil,
      barOpenEnabled: true,
      barOpenUntil
    }, 8_000);
    await run();
  } finally {
    try {
      await patchOperationSettings(request, restaurantSlug, originalSettings);
    } catch {
      // Ignore teardown restore failures when test context is already closing.
    }
  }
}


function createSubmittedOrder(
  id: string,
  status: SubmittedOrder["status"],
  total: number,
  itemName: string
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
    createdAt: new Date().toISOString(),
    total,
    items: [
      {
        id: `${id}-item-1`,
        menuItemId: `${id}-menu-item`,
        name: itemName,
        price: total,
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
  const callWaiterButton = page.locator(".button-danger--call").first();
  await expect(callWaiterButton).toBeVisible();
  await callWaiterButton.click();
}

async function clickServiceHelpAction(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const helpButton = page
      .locator("#service-action-menu button")
      .filter({
        hasText: /Help \/ question|Помощь \/ вопрос|עזרה \/ שאלה/
      })
      .first();

    try {
      await expect(helpButton).toBeVisible({ timeout: 2500 });
      await helpButton.click({ timeout: 2500, force: true });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }

      await page.waitForTimeout(150);
    }
  }
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

test.describe("Client menu checks TC-41..TC-54 (core)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("TC-41 submitted order is not wiped when polling returns empty list once", async ({
    page
  }) => {
    await page.addInitScript(() => {
      const originalSetInterval = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        originalSetInterval(handler, Math.min(Number(timeout ?? 0), 350), ...args)) as typeof window.setInterval;
    });

    const order = createSubmittedOrder("stable-order", "new", 42, "Stable order item");
    const calls = await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [order], activeServiceRequests: [] },
      { currentSessionId: 1, submittedOrders: [], activeServiceRequests: [] },
      { currentSessionId: 1, submittedOrders: [], activeServiceRequests: [] }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.locator(".submitted-orders__summary")).toContainText("Current orders");
    await expect(page.locator(".submitted-orders__summary")).toContainText("42");
    await expect
      .poll(() => calls(), { timeout: 8_000 })
      .toBeGreaterThanOrEqual(2);
    await expect(page.locator(".submitted-orders__summary")).toContainText("42");
  });

  test("TC-42 submitted orders remain consistent after full page refresh", async ({ page }) => {
    const order = createSubmittedOrder("refresh-order", "preparing", 31, "Refresh item");
    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [order], activeServiceRequests: [] }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.locator(".submitted-orders__summary")).toContainText("Preparing");
    await expect(page.locator(".submitted-orders__summary")).toContainText("31");

    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissWelcomeDialogIfVisible(page);
    await clickLanguageButtonWithRetry(page, "EN");
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.locator(".submitted-orders__summary")).toContainText("Preparing");
    await expect(page.locator(".submitted-orders__summary")).toContainText("31");
  });

  test("TC-49 HE/EN/RU switch updates menu labels", async ({ page }) => {
    await page.goto(PREVIEW_MENU_PATH, { waitUntil: "domcontentloaded" });
    await dismissWelcomeDialogIfVisible(page);

    await clickLanguageButtonWithRetry(page, "EN");
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.getByRole("button", { name: /Dishes/i }).first()).toBeVisible();

    await clickLanguageButtonWithRetry(page, "RU");
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.locator(".orders-filter__chip--group-dishes").first()).toContainText(
      /Блюда/i
    );

    await clickLanguageButtonWithRetry(page, "HE");
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.locator(".orders-filter__chip--group-dishes").first()).toContainText(
      /מנות/i
    );
  });

  test("TC-50 cart selections are preserved across language switch", async ({ page }) => {
    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page);
    await expect(page.locator(".cart-row")).toHaveCount(1);

    await clickLanguageButtonWithRetry(page, "RU");
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.locator(".cart-row")).toHaveCount(1);

    await clickLanguageButtonWithRetry(page, "HE");
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.locator(".cart-row")).toHaveCount(1);
  });

  test("TC-51 RTL/LTR direction switches cleanly without layout break", async ({ page }) => {
    const targetPath = ORDERING_MENU_PATH || PREVIEW_MENU_PATH;
    await page.goto(targetPath, { waitUntil: "domcontentloaded" });
    await dismissWelcomeDialogIfVisible(page);

    await clickLanguageButtonWithRetry(page, "HE");
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.locator(".menu-page")).toHaveAttribute("dir", "rtl");

    await clickLanguageButtonWithRetry(page, "EN");
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.locator(".menu-page")).toHaveAttribute("dir", "ltr");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("TC-52 translation fallback is used when target language fields are missing", async ({
    page
  }) => {
    await page.addInitScript(() => {
      const originalSetInterval = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        originalSetInterval(handler, Math.min(Number(timeout ?? 0), 350), ...args)) as typeof window.setInterval;
    });

    const fallbackMenu = [
      {
        id: "fallback-item-1",
        restaurantSlug: MENU_RESTAURANT_SLUG,
        category: "starters",
        name: "Fallback dish",
        description: "Fallback description",
        nameHe: "פולבאק",
        nameEn: "Fallback EN name",
        nameRu: "",
        descriptionHe: "תיאור פולבאק",
        descriptionEn: "Fallback EN description",
        descriptionRu: "",
        price: 19,
        image: "",
        showImage: false,
        available: true,
        badges: [],
        volumeOptions: []
      }
    ];

    await mockTablesSnapshots(page, [
      {
        currentSessionId: 1,
        submittedOrders: [],
        activeServiceRequests: [],
        menu: fallbackMenu
      }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await clickLanguageButtonWithRetry(page, "RU");
    await dismissWelcomeDialogIfVisible(page);

    await expect(page.locator(".menu-card h3").first()).toContainText("Fallback EN name");
    await expect(page.locator(".menu-card p.muted").first()).toContainText(
      "Fallback EN description"
    );
  });

  test("TC-53 currency format is consistent across HE/EN/RU", async ({ page }) => {
    await page.goto(PREVIEW_MENU_PATH, { waitUntil: "domcontentloaded" });
    await dismissWelcomeDialogIfVisible(page);

    const languages: Array<"HE" | "EN" | "RU"> = ["HE", "EN", "RU"];
    const values: number[] = [];

    for (const language of languages) {
      await page.getByRole("button", { name: language }).click();
      await dismissWelcomeDialogIfVisible(page);

      const priceText = await page.locator(".menu-card .menu-card__footer strong").first().innerText();
      expect(priceText).toContain("₪");
      values.push(parseCurrency(priceText));
    }

    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.001);
  });

  test("TC-54 localized errors and confirmations are readable", async ({ page, request }) => {
    let waiterCalls = 0;

    await page.route("**/api/orders", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const body = JSON.parse(request.postData() ?? "{}") as { type?: string };
      if (body.type === "waiter_call") {
        waiterCalls += 1;

        if (waiterCalls <= 3) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({})
          });
          return;
        }

        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });

    await withOpenedKitchenAndBar(request, ORDERING_MENU_PATH, async () => {
      await openMenuInEnglish(page, ORDERING_MENU_PATH);

      await openServiceMenu(page);
      await clickServiceHelpAction(page);
      await expect(page.locator(".modal-card__message")).toContainText("Failed to call the waiter");
      await closeMessageDialog(page);

      await clickLanguageButtonWithRetry(page, "RU");
      await dismissWelcomeDialogIfVisible(page);
      await openServiceMenu(page);
      await clickServiceHelpAction(page);
      await expect(page.locator(".modal-card__message")).toContainText("Не удалось вызвать официанта");
      await closeMessageDialog(page);

      await clickLanguageButtonWithRetry(page, "HE");
      await dismissWelcomeDialogIfVisible(page);
      await openServiceMenu(page);
      await clickServiceHelpAction(page);
      await expect(page.locator(".modal-card__message")).toContainText("לא ניתן היה לקרוא למלצר");
      await closeMessageDialog(page);

      await openServiceMenu(page);
      await clickServiceHelpAction(page);
      await expect(page.locator(".modal-card__message")).toContainText("המלצר הוזמן");
    });
  });
});
