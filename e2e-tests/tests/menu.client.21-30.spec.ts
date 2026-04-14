import { expect, Page, test, type APIRequestContext } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
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
  expected: Partial<OperationSettingsSnapshot>
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
      { timeout: 20_000 }
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
    });
    await run();
  } finally {
    await patchOperationSettings(request, restaurantSlug, originalSettings);
    await waitForOperationSettings(request, restaurantSlug, originalSettings);
  }
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

async function addFirstDrink(page: Page) {
  await page.getByRole("button", { name: /Drinks/i }).first().click();

  const simpleDrinkAdd = page
    .locator(".menu-card .menu-card__footer button")
    .filter({ hasText: "Add" })
    .first();
  const hasSimpleDrink = (await simpleDrinkAdd.count()) > 0;

  if (hasSimpleDrink) {
    await simpleDrinkAdd.click();
    return;
  }

  const volumeAdd = page.locator(".menu-card__volume-row button", { hasText: "Add" }).first();
  await expect(volumeAdd).toBeVisible();
  await volumeAdd.click();
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

  const okButton = reviewDialog.getByRole("button", { name: "OK" });
  await expect(okButton).toBeVisible();
  await okButton.click();
}

async function mockOrderPostSuccess(page: Page) {
  let counter = 0;

  await page.route("**/api/orders", async (route, request) => {
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
        volumeOptionId?: string;
        volumeLabel?: string;
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
    const responseItems = (body.items ?? []).map((item, index) => ({
      id: `e2e-order-item-${counter}-${index + 1}`,
      menuItemId: item.menuItemId,
      name: `Item ${index + 1}`,
      price: item.priceOverride ?? 10,
      quantity: item.quantity,
      served: false,
      volumeOptionId: item.volumeOptionId,
      volumeLabel: item.volumeLabel
    }));
    const total = responseItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
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
        items: responseItems
      })
    });
  });
}

test.describe("Client menu checks TC-21..TC-24", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("TC-21 successful order shows confirmation message", async ({ page, request }) => {
    await withOpenedKitchenAndBar(request, ORDERING_MENU_PATH, async () => {
      await mockOrderPostSuccess(page);
      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await addFirstDish(page);
      await submitOrderViaReviewDialog(page);

      const dialog = page.locator(".modal-card");
      await expect(dialog).toContainText("Your order has been sent.");
    });
  });

  test("TC-22 order payload contains required fields", async ({ page, request }) => {
    let capturedPayload: unknown = null;

    await page.route("**/api/orders", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const body = JSON.parse(request.postData() ?? "{}") as {
        type?: string;
        restaurantSlug?: string;
        tableNumber?: number;
        serveMode?: string;
        items?: Array<{ menuItemId: string; quantity: number }>;
      };

      if (body.type === "waiter_call" || body.type === "bill_request") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      capturedPayload = body;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "e2e-order-payload",
          restaurantSlug: body.restaurantSlug ?? MENU_RESTAURANT_SLUG,
          restaurantName: "E2E Restaurant",
          tableNumber: body.tableNumber ?? 1,
          sessionId: 1,
          status: "new",
          kind: "order",
          serveMode: body.serveMode ?? "as_ready",
          createdAt: new Date().toISOString(),
          total: 20,
          items: [{ id: "i1", menuItemId: "m1", name: "Item", price: 20, quantity: 1, served: false }]
        })
      });
    });

    await withOpenedKitchenAndBar(request, ORDERING_MENU_PATH, async () => {
      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await addFirstDish(page);
      await submitOrderViaReviewDialog(page);

      const payload = capturedPayload as
        | {
            restaurantSlug?: string;
            tableNumber?: number;
            serveMode?: string;
            items?: Array<{ menuItemId?: string; quantity?: number }>;
          }
        | null;

      expect(payload).not.toBeNull();
      expect(typeof payload?.restaurantSlug).toBe("string");
      expect(typeof payload?.tableNumber).toBe("number");
      expect(payload?.serveMode).toBe("as_ready");
      expect(Array.isArray(payload?.items)).toBe(true);
      expect((payload?.items?.length ?? 0) > 0).toBe(true);
      expect(typeof payload?.items?.[0]?.menuItemId).toBe("string");
      expect(typeof payload?.items?.[0]?.quantity).toBe("number");
    });
  });

  test("TC-23 double confirm click does not create duplicate order", async ({ page, request }) => {
    let createOrderCalls = 0;

    await page.route("**/api/orders", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const body = JSON.parse(request.postData() ?? "{}") as { type?: string };
      if (body.type === "waiter_call" || body.type === "bill_request") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      createOrderCalls += 1;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: `e2e-order-${createOrderCalls}`,
          restaurantSlug: MENU_RESTAURANT_SLUG,
          restaurantName: "E2E Restaurant",
          tableNumber: 1,
          sessionId: 1,
          status: "new",
          kind: "order",
          serveMode: "as_ready",
          createdAt: new Date().toISOString(),
          total: 20,
          items: [{ id: "i1", menuItemId: "m1", name: "Item", price: 20, quantity: 1, served: false }]
        })
      });
    });

    await withOpenedKitchenAndBar(request, ORDERING_MENU_PATH, async () => {
      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await addFirstDish(page);
      await clickCartSubmit(page);

      const okButton = page.locator(".modal-card--review").getByRole("button", { name: "OK" });
      await expect(okButton).toBeVisible();
      await okButton.dblclick();

      await expect(page.locator(".modal-card")).toContainText("Your order has been sent.");
      expect(createOrderCalls).toBe(1);
    });
  });

  test("TC-24 user can retry after failed submit", async ({ page, request }) => {
    let createOrderCalls = 0;

    await page.route("**/api/orders", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const body = JSON.parse(request.postData() ?? "{}") as { type?: string };
      if (body.type === "waiter_call" || body.type === "bill_request") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      createOrderCalls += 1;

      if (createOrderCalls === 1) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "Failed to send the order" })
        });
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "e2e-order-retry",
          restaurantSlug: MENU_RESTAURANT_SLUG,
          restaurantName: "E2E Restaurant",
          tableNumber: 1,
          sessionId: 1,
          status: "new",
          kind: "order",
          serveMode: "as_ready",
          createdAt: new Date().toISOString(),
          total: 20,
          items: [{ id: "i1", menuItemId: "m1", name: "Item", price: 20, quantity: 1, served: false }]
        })
      });
    });

    await withOpenedKitchenAndBar(request, ORDERING_MENU_PATH, async () => {
      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await addFirstDish(page);
      await submitOrderViaReviewDialog(page);

      await expect(page.locator(".status-message")).toContainText(
        "Your cart is still here"
      );

      await submitOrderViaReviewDialog(page);
      await expect(page.locator(".modal-card")).toContainText("Your order has been sent.");
      expect(createOrderCalls).toBe(2);
    });
  });

});
