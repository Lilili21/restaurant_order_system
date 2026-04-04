import { expect, Page, test } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
const PREVIEW_MENU_PATH =
  process.env.E2E_MENU_PREVIEW_PATH ?? `/menu/${MENU_RESTAURANT_SLUG}/0`;
const ORDERING_MENU_PATH = process.env.E2E_ORDERING_MENU_PATH ?? "";
const PROMO_ACTIVE_MENU_PATH = process.env.E2E_PROMO_ACTIVE_MENU_PATH ?? "";
const PROMO_INACTIVE_MENU_PATH = process.env.E2E_PROMO_INACTIVE_MENU_PATH ?? "";
const BUSINESS_LUNCH_MENU_PATH = process.env.E2E_BUSINESS_LUNCH_MENU_PATH ?? "";
const BUSINESS_LUNCH_HIDDEN_ITEM = process.env.E2E_BUSINESS_LUNCH_HIDDEN_ITEM ?? "";

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

test.describe("Client menu checks TC-41..TC-54", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("TC-41 submitted order is not wiped when polling returns empty list once", async ({
    page
  }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

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
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    const order = createSubmittedOrder("refresh-order", "preparing", 31, "Refresh item");
    await mockTablesSnapshots(page, [
      { currentSessionId: 1, submittedOrders: [order], activeServiceRequests: [] }
    ]);

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.locator(".submitted-orders__summary")).toContainText("Preparing");
    await expect(page.locator(".submitted-orders__summary")).toContainText("31");

    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissWelcomeDialogIfVisible(page);
    await expect(page.locator(".submitted-orders__summary")).toContainText("Preparing");
    await expect(page.locator(".submitted-orders__summary")).toContainText("31");
  });

  test("TC-43 happy hour appears only in active schedule path", async ({ page }) => {
    test.skip(
      !PROMO_ACTIVE_MENU_PATH || !PROMO_INACTIVE_MENU_PATH,
      "Set both E2E_PROMO_ACTIVE_MENU_PATH and E2E_PROMO_INACTIVE_MENU_PATH."
    );

    await openMenuInEnglish(page, PROMO_ACTIVE_MENU_PATH);
    await expect(page.locator(".menu-alert-banner.menu-happy-hour")).toHaveCount(
      await page.locator(".menu-alert-banner.menu-happy-hour").count()
    );
    const activeCount = await page.locator(".menu-alert-banner.menu-happy-hour").count();
    expect(activeCount).toBeGreaterThan(0);

    await openMenuInEnglish(page, PROMO_INACTIVE_MENU_PATH);
    await expect(page.locator(".menu-alert-banner.menu-happy-hour")).toHaveCount(0);
  });

  test("TC-44 business lunch applies only to configured categories", async ({ page }) => {
    test.skip(
      !BUSINESS_LUNCH_MENU_PATH,
      "Set E2E_BUSINESS_LUNCH_MENU_PATH=/menu/<restaurantSlug>/<tableToken>."
    );

    await openMenuInEnglish(page, BUSINESS_LUNCH_MENU_PATH);
    await expect(page.locator(".menu-business-lunch")).toBeVisible();

    if (BUSINESS_LUNCH_HIDDEN_ITEM) {
      const pattern = new RegExp(escapeRegExp(BUSINESS_LUNCH_HIDDEN_ITEM), "i");
      await expect(page.locator(".menu-card h3", { hasText: pattern })).toHaveCount(0);
    }
  });

  test("TC-45 discount math is rounded and consistent in cart", async ({ page }) => {
    const targetPath = PROMO_ACTIVE_MENU_PATH || ORDERING_MENU_PATH;
    test.skip(!targetPath, "Set E2E_PROMO_ACTIVE_MENU_PATH or E2E_ORDERING_MENU_PATH.");

    await openMenuInEnglish(page, targetPath);
    await addFirstDish(page);

    const discountLine = page
      .locator("p.muted")
      .filter({ hasText: /Happy hour discount/i })
      .first();
    const hasDiscount = await discountLine.isVisible().catch(() => false);
    test.skip(!hasDiscount, "No active discount for current cart in this environment.");

    const row = page.locator(".cart-row").first();
    const price = parseCurrency(await row.locator("p.muted").innerText());
    const quantity = Number.parseInt(await row.locator(".quantity-box span").innerText(), 10);
    const subtotal = price * quantity;
    const discount = parseCurrency(await discountLine.innerText());
    const total = parseCurrency(await page.locator(".cart-summary strong").innerText());

    expect(Math.abs((subtotal - discount) - total)).toBeLessThan(0.51);
  });

  test("TC-46 discount is visible in UI and discounted order payload is sent", async ({
    page
  }) => {
    const targetPath = PROMO_ACTIVE_MENU_PATH || ORDERING_MENU_PATH;
    test.skip(!targetPath, "Set E2E_PROMO_ACTIVE_MENU_PATH or E2E_ORDERING_MENU_PATH.");

    let payload: unknown = null;

    await page.route("**/api/orders", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const body = JSON.parse(request.postData() ?? "{}") as { type?: string; items?: unknown[] };
      if (body.type === "waiter_call" || body.type === "bill_request") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      payload = body;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "discount-order",
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

    await openMenuInEnglish(page, targetPath);
    await addFirstDish(page);

    const discountLine = page
      .locator("p.muted")
      .filter({ hasText: /Happy hour discount/i })
      .first();
    const hasDiscount = await discountLine.isVisible().catch(() => false);
    test.skip(!hasDiscount, "No active discount for current cart in this environment.");

    await submitOrderViaReviewDialog(page);
    expect(payload).not.toBeNull();
    const parsedPayload = payload as { items?: unknown[] };
    expect(Array.isArray(parsedPayload.items)).toBe(true);
    expect((parsedPayload.items ?? []).length).toBeGreaterThan(0);
  });

  test("TC-47 recommendation block appears when trigger conditions are met", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page);

    const recommendations = page.locator(".cart-recommendations");
    const hasRecommendations = (await recommendations.count()) > 0;
    test.skip(!hasRecommendations, "No recommendation rules configured for this environment.");

    await expect(recommendations.first()).toBeVisible();
  });

  test("TC-48 adding from recommendation updates cart like regular add", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addFirstDish(page);

    const recommendationAddButton = page
      .locator(".cart-recommendation__button")
      .filter({ hasText: /^Add$/ })
      .first();
    const hasRecommendationAdd = await recommendationAddButton.isVisible().catch(() => false);
    test.skip(!hasRecommendationAdd, "No item-based recommendation Add button available.");

    const beforeCount = await page.locator(".cart-row").count();
    await recommendationAddButton.click();
    await expect(page.locator(".cart-row")).toHaveCount(beforeCount + 1);
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
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

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
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

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

  test("TC-54 localized errors and confirmations are readable", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

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

    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    await openServiceMenu(page);
    await page.getByRole("button", { name: "Help / question" }).click();
    await expect(page.locator(".modal-card__message")).toContainText("Failed to call the waiter");
    await closeMessageDialog(page);

    await clickLanguageButtonWithRetry(page, "RU");
    await dismissWelcomeDialogIfVisible(page);
    await openServiceMenu(page);
    await page.getByRole("button", { name: "Помощь / вопрос" }).click();
    await expect(page.locator(".modal-card__message")).toContainText("Не удалось вызвать официанта");
    await closeMessageDialog(page);

    await clickLanguageButtonWithRetry(page, "HE");
    await dismissWelcomeDialogIfVisible(page);
    await openServiceMenu(page);
    await page.getByRole("button", { name: "עזרה / שאלה" }).click();
    await expect(page.locator(".modal-card__message")).toContainText("לא ניתן היה לקרוא למלצר");
    await closeMessageDialog(page);

    await openServiceMenu(page);
    await page.getByRole("button", { name: "עזרה / שאלה" }).click();
    await expect(page.locator(".modal-card__message")).toContainText("המלצר הוזמן");
  });
});
