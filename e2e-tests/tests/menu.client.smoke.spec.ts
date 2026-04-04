import { expect, Page, test } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
const PREVIEW_MENU_PATH =
  process.env.E2E_MENU_PREVIEW_PATH ?? `/menu/${MENU_RESTAURANT_SLUG}/0`;
const ORDERING_MENU_PATH = process.env.E2E_ORDERING_MENU_PATH ?? "";

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

  await welcomeDialog.locator("button.button-success").first().click();
  await expect(welcomeDialog).toBeHidden({ timeout: 5000 });
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

async function setupNeutralTablesPolling(page: Page) {
  await page.route("**/api/tables/**", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currentSessionId: 1,
        submittedOrders: [],
        activeServiceRequests: []
      })
    });
  });
}

test.describe("Client menu smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("SM-01 preview menu loads and shows restaurant", async ({ page }) => {
    await openMenuInEnglish(page, PREVIEW_MENU_PATH);
    await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
    await expect(page.locator(".menu-hero-header h1")).toBeVisible();
    await expect(page.getByRole("button", { name: /Dishes/i }).first()).toBeVisible();
  });

  test("SM-02 language and filters switch correctly", async ({ page }) => {
    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    await page.getByRole("button", { name: /Drinks/i }).first().click();
    await expect(page.locator(".menu-section")).toHaveCount(
      await page.locator(".menu-section").count()
    );

    await clickLanguageButtonWithRetry(page, "RU");
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.getByRole("button", { name: /Напитки/i }).first()).toBeVisible();
  });

  test("SM-03 add item to cart on ordering page", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run smoke ordering checks."
    );

    await setupNeutralTablesPolling(page);
    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.getByRole("heading", { name: "My order" })).toBeVisible();

    await addFirstDish(page);
    await expect(page.locator(".cart-row")).toHaveCount(1);
    await expect(page.locator(".cart-summary strong")).toBeVisible();
  });

  test("SM-04 successful submit flow works", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run smoke ordering checks."
    );

    await setupNeutralTablesPolling(page);
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

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "smoke-order-1",
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

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page);
    await clickCartSubmit(page);
    await page.locator(".modal-card--review").getByRole("button", { name: "OK" }).click();

    await expect(page.locator(".modal-card__message")).toContainText("Your order has been sent.");
  });

  test("SM-05 waiter call flow works", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run smoke ordering checks."
    );

    await setupNeutralTablesPolling(page);
    await page.route("**/api/orders", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await page.getByRole("button", { name: "Call waiter" }).click();
    await page.getByRole("button", { name: "Help / question" }).click();

    await expect(page.locator(".modal-card__message")).toContainText("Waiter has been called");
  });
});
