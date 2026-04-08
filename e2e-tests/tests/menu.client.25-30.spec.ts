import { expect, Page, test } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";
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

function inPast(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function inFuture(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
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

async function fetchOperationSettingsSnapshot(
  page: Page,
  restaurantSlug: string
): Promise<OperationSettingsSnapshot> {
  const result = await page.evaluate(async ({ slug }) => {
    const response = await fetch(
      `/api/menu-settings?restaurantSlug=${encodeURIComponent(slug)}`,
      { cache: "no-store" }
    );

    return {
      status: response.status,
      body: await response.text()
    };
  }, { slug: restaurantSlug });

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
  page: Page,
  restaurantSlug: string,
  updates: Partial<OperationSettingsSnapshot>
) {
  const result = await page.evaluate(
    async ({ slug, payload, login, password }) => {
      const response = await fetch("/api/menu-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secondary-login": login,
          "x-admin-secondary-password": password
        },
        body: JSON.stringify({
          restaurantSlug: slug,
          ...payload
        })
      });

      return {
        status: response.status,
        body: await response.text()
      };
    },
    {
      slug: restaurantSlug,
      payload: updates,
      login: SECONDARY_LOGIN,
      password: SECONDARY_PASSWORD
    }
  );

  expect(result.status, `menu-settings PATCH failed: ${result.body}`).toBe(200);
}

async function withRestoredOperationSettings(
  page: Page,
  restaurantSlug: string,
  run: () => Promise<void>
) {
  const originalSettings = await fetchOperationSettingsSnapshot(page, restaurantSlug);

  try {
    await run();
  } finally {
    await patchOperationSettings(page, restaurantSlug, originalSettings);
  }
}

test.describe("Client menu checks TC-25..TC-30", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("TC-25 kitchen closed blocks dish submit", async ({ page }) => {
    const { restaurantSlug } = parseMenuPath(ORDERING_MENU_PATH);
    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    await withRestoredOperationSettings(page, restaurantSlug, async () => {
      await patchOperationSettings(page, restaurantSlug, {
        kitchenOpenEnabled: true,
        kitchenOpenUntil: inPast(5),
        barOpenEnabled: true,
        barOpenUntil: inFuture(120)
      });

      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await expect(page.getByText("Kitchen closed")).toBeVisible();

      await addFirstDish(page);
      await clickCartSubmit(page);

      await expect(page.locator(".status-message")).toContainText(
        "The kitchen is closed. Check your order and keep drinks only"
      );
    });
  });

  test("TC-26 bar closed blocks drink submit", async ({ page }) => {
    const { restaurantSlug } = parseMenuPath(ORDERING_MENU_PATH);
    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    await withRestoredOperationSettings(page, restaurantSlug, async () => {
      await patchOperationSettings(page, restaurantSlug, {
        kitchenOpenEnabled: true,
        kitchenOpenUntil: inFuture(120),
        barOpenEnabled: true,
        barOpenUntil: inPast(5)
      });

      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await expect(page.getByText("Bar closed")).toBeVisible();

      await addFirstDrink(page);
      await clickCartSubmit(page);

      await expect(page.locator(".status-message")).toContainText(
        "The bar is closed. Check your order and keep dishes only"
      );
    });
  });

  test("TC-27 drinks-only order works when kitchen is closed", async ({ page }) => {
    const { restaurantSlug } = parseMenuPath(ORDERING_MENU_PATH);
    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    await withRestoredOperationSettings(page, restaurantSlug, async () => {
      await patchOperationSettings(page, restaurantSlug, {
        kitchenOpenEnabled: true,
        kitchenOpenUntil: inPast(5),
        barOpenEnabled: true,
        barOpenUntil: inFuture(120)
      });

      await mockOrderPostSuccess(page);
      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await expect(page.getByText("Kitchen closed")).toBeVisible();
      await expect(page.getByText("Bar closed")).toHaveCount(0);

      await addFirstDrink(page);
      await submitOrderViaReviewDialog(page);
      await expect(page.locator(".modal-card")).toContainText("Your order has been sent.");
    });
  });

  test("TC-28 dishes-only order works when bar is closed", async ({ page }) => {
    const { restaurantSlug } = parseMenuPath(ORDERING_MENU_PATH);
    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    await withRestoredOperationSettings(page, restaurantSlug, async () => {
      await patchOperationSettings(page, restaurantSlug, {
        kitchenOpenEnabled: true,
        kitchenOpenUntil: inFuture(120),
        barOpenEnabled: true,
        barOpenUntil: inPast(5)
      });

      await mockOrderPostSuccess(page);
      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await expect(page.getByText("Bar closed")).toBeVisible();
      await expect(page.getByText("Kitchen closed")).toHaveCount(0);

      await addFirstDish(page);
      await submitOrderViaReviewDialog(page);
      await expect(page.locator(".modal-card")).toContainText("Your order has been sent.");
    });
  });

  test("TC-29 closed kitchen/bar messages are visible and clear", async ({ page }) => {
    const { restaurantSlug } = parseMenuPath(ORDERING_MENU_PATH);
    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    await withRestoredOperationSettings(page, restaurantSlug, async () => {
      await patchOperationSettings(page, restaurantSlug, {
        kitchenOpenEnabled: true,
        kitchenOpenUntil: inPast(5),
        barOpenEnabled: true,
        barOpenUntil: inPast(5)
      });

      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await expect(page.getByText("Kitchen closed")).toBeVisible();
      await expect(page.getByText("Bar closed")).toBeVisible();
      await expect(page.getByText("Only drinks are available to order right now.")).toBeVisible();
      await expect(page.getByText("Only kitchen dishes are available to order right now.")).toBeVisible();
    });
  });

  test("TC-30 open/closed state updates after time jump", async ({ page }) => {
    const { restaurantSlug } = parseMenuPath(ORDERING_MENU_PATH);

    await page.addInitScript(() => {
      const originalNow = Date.now.bind(Date);
      (window as Window & { __e2eTimeOffset?: number }).__e2eTimeOffset = 0;
      Date.now = () =>
        originalNow() +
        ((window as Window & { __e2eTimeOffset?: number }).__e2eTimeOffset ?? 0);
    });

    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    await withRestoredOperationSettings(page, restaurantSlug, async () => {
      await patchOperationSettings(page, restaurantSlug, {
        kitchenOpenEnabled: true,
        kitchenOpenUntil: inFuture(10),
        barOpenEnabled: true,
        barOpenUntil: inFuture(10)
      });

      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await expect(page.getByText("Kitchen closed in")).toBeVisible();
      await expect(page.getByText("Bar closed in")).toBeVisible();

      await page.evaluate(() => {
        (window as Window & { __e2eTimeOffset?: number }).__e2eTimeOffset =
          6 * 60 * 60 * 1000;
      });
      await page.waitForTimeout(1500);

      await expect(page.getByText("Kitchen closed")).toBeVisible();
      await expect(page.getByText("Bar closed")).toBeVisible();
    });
  });
});
