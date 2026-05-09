import { expect, Page, test } from "@playwright/test";

import { createMockMenuItem } from "./fixtures";

const OLIVE_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";
const OLIVE_SLUG = "olive-bistro";

async function dismissWelcomeDialogIfVisible(page: Page) {
  const welcomeTitle = page.locator("#welcome-dialog-title");
  const welcomeDialog = page.locator(".modal-backdrop").filter({ has: welcomeTitle }).first();

  const appeared = await welcomeDialog
    .waitFor({ state: "visible", timeout: 1200 })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    return;
  }

  await welcomeDialog.locator("button.button-success").first().click({ force: true });
  await welcomeDialog.waitFor({ state: "hidden", timeout: 5000 });
}

async function switchMenuLanguage(page: Page, language: "EN" | "RU" | "HE") {
  const languageToggle = page.getByRole("button", { name: "Language" });
  await languageToggle.click();
  await page.getByRole("menuitem", { name: language, exact: true }).click();
  await dismissWelcomeDialogIfVisible(page);
}

async function openMenuInEnglish(page: Page, menuPath: string) {
  await page.goto(menuPath, { waitUntil: "domcontentloaded" });
  await dismissWelcomeDialogIfVisible(page);
  await switchMenuLanguage(page, "EN");
  await dismissWelcomeDialogIfVisible(page);
  await expect(page.locator(".menu-sections")).toBeVisible();
}

async function submitOrderFromReviewDialog(page: Page) {
  const submitButton = page.locator(".cart-submit").first();
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await submitButton.click({ force: true });

  const reviewDialog = page.locator(".modal-card--review");
  await expect(reviewDialog).toBeVisible();
  await reviewDialog.getByRole("button", { name: "OK" }).first().click({ force: true });
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

async function setupOliveTypeMenu(page: Page) {
  const menuItems = [
    createMockMenuItem({
      id: "olive-type-item-1",
      restaurantSlug: OLIVE_SLUG,
      category: "mains",
      name: "Shawarma plate",
      nameHe: "שווארמה בצלחת",
      nameEn: "Shawarma plate",
      nameRu: "Шаурма на тарелке",
      description: "Chicken, potatoes, pickles, tahini and fresh salad.",
      descriptionHe: "עוף, תפוחי אדמה, חמוצים, טחינה וסלט טרי.",
      descriptionEn: "Chicken, potatoes, pickles, tahini and fresh salad.",
      descriptionRu: "Курица, картофель, соленья, тахини и свежий салат.",
      price: 54,
      volumeOptions: [
        {
          id: "olive-type-regular",
          label: "Regular",
          labelHe: "רגיל",
          labelEn: "Regular",
          labelRu: "Обычная",
          price: 54
        },
        {
          id: "olive-type-large",
          label: "Large",
          labelHe: "גדולה",
          labelEn: "Large",
          labelRu: "Большая",
          price: 68
        }
      ]
    })
  ];

  await page.route("**/api/menu-settings**", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        orderMode: "tables",
        kitchenOpenEnabled: false,
        kitchenOpenUntil: null,
        barOpenEnabled: false,
        barOpenUntil: null,
        happyHourEnabled: false,
        happyHourDiscountPercent: 0,
        happyHourCategories: [],
        happyHourStartsFrom: null,
        happyHourUntil: null,
        promotions: [],
        businessLunches: [],
        recommendations: []
      })
    });
  });

  await page.route("**/api/menu?**", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    const url = new URL(request.url());
    if ((url.searchParams.get("restaurantSlug") ?? "").toLowerCase() !== OLIVE_SLUG) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(menuItems)
    });
  });

  await setupNeutralTablesPolling(page);
}

test.describe("Olive Bistro shared dish types", () => {
  test("OLIVE-TYPE-01 dishes render type rows instead of multi-select toppings", async ({
    page
  }) => {
    await setupOliveTypeMenu(page);

    await openMenuInEnglish(page, OLIVE_MENU_PATH);
    await page.getByRole("button", { name: /Dishes/i }).click();
    await page.getByRole("button", { name: /Main courses|Mains/i }).click();

    const card = page.locator(".menu-card").filter({
      has: page.getByRole("heading", { name: "Shawarma plate" })
    }).first();

    await expect(card).toBeVisible();
    await expect(card.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(card.locator(".menu-card__addons")).toHaveCount(0);
    await expect(card.locator(".menu-card__volume-row")).toHaveCount(2);
    await expect(card.getByText("Regular")).toBeVisible();
    await expect(card.getByText("Large")).toBeVisible();
    await expect(
      card.locator(".menu-card__volume-row button").filter({ hasText: /^Add$/ })
    ).toHaveCount(2);
    await expect(
      card.locator(".menu-card__footer button").filter({ hasText: /^Add$/ })
    ).toHaveCount(0);
  });

  test("OLIVE-TYPE-02 order sends only the chosen dish type", async ({ page }) => {
    await setupOliveTypeMenu(page);

    type OliveSubmittedItem = {
      menuItemId?: string;
      quantity?: number;
      volumeOptionId?: string;
      volumeLabel?: string;
      priceOverride?: number;
    };
    type OliveSubmittedPayload = {
      items?: OliveSubmittedItem[];
    };

    let submittedItems: OliveSubmittedItem[] = [];

    await page.route("**/api/orders**", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const submittedPayload = JSON.parse(request.postData() ?? "{}") as OliveSubmittedPayload;
      submittedItems = submittedPayload.items ?? [];
      const submittedItem = submittedItems[0];

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "olive-type-order-1",
          restaurantSlug: OLIVE_SLUG,
          restaurantName: "Olive Bistro",
          tableNumber: 1,
          sessionId: 1,
          status: "new",
          kind: "order",
          serveMode: "as_ready",
          createdAt: new Date().toISOString(),
          total: submittedItem?.priceOverride ?? 68,
          items: [
            {
              id: "olive-type-order-item-1",
              menuItemId: submittedItem?.menuItemId ?? "olive-type-item-1",
              name: "Shawarma plate",
              price: submittedItem?.priceOverride ?? 68,
              quantity: submittedItem?.quantity ?? 1,
              served: false,
              volumeOptionId: submittedItem?.volumeOptionId,
              volumeLabel: submittedItem?.volumeLabel
            }
          ]
        })
      });
    });

    await openMenuInEnglish(page, OLIVE_MENU_PATH);
    await page.getByRole("button", { name: /Dishes/i }).click();
    await page.getByRole("button", { name: /Main courses|Mains/i }).click();

    const largeRow = page.locator(".menu-card__volume-row").filter({
      has: page.getByText("Large")
    }).first();
    await expect(largeRow).toBeVisible();
    await largeRow.getByRole("button", { name: "Add" }).click();

    await expect(page.locator(".cart-row")).toHaveCount(1);
    await expect(page.locator(".cart-row")).toContainText("Large");

    await submitOrderFromReviewDialog(page);
    await expect(page.locator(".modal-card__message")).toContainText("Your order has been sent.");

    expect(submittedItems).toHaveLength(1);
    expect(submittedItems[0]?.menuItemId).toBe("olive-type-item-1");
    expect(submittedItems[0]?.quantity).toBe(1);
    expect(submittedItems[0]?.volumeOptionId).toBe("olive-type-large");
    expect(submittedItems[0]?.volumeLabel).toBe("Large");
    expect(submittedItems[0]?.priceOverride).toBe(68);
  });

  test("OLIVE-TYPE-03 dish type labels switch across HE/EN/RU", async ({ page }) => {
    await setupOliveTypeMenu(page);

    await openMenuInEnglish(page, OLIVE_MENU_PATH);
    await page.getByRole("button", { name: /Dishes/i }).click();
    await page.getByRole("button", { name: /Main courses|Mains/i }).click();

    const card = page.locator(".menu-card").filter({
      has: page.getByRole("heading", { name: "Shawarma plate" })
    }).first();

    await expect(card).toContainText("Regular");
    await expect(card).toContainText("Large");

    await switchMenuLanguage(page, "RU");
    await expect(card).toContainText("Обычная");
    await expect(card).toContainText("Большая");

    await switchMenuLanguage(page, "HE");
    await expect(card).toContainText("רגיל");
    await expect(card).toContainText("גדולה");

    await switchMenuLanguage(page, "EN");
    await expect(card).toContainText("Regular");
    await expect(card).toContainText("Large");
  });

  test("OLIVE-TYPE-04 cart keeps selected type translated on language switch", async ({
    page
  }) => {
    await setupOliveTypeMenu(page);

    await openMenuInEnglish(page, OLIVE_MENU_PATH);
    await page.getByRole("button", { name: /Dishes/i }).click();
    await page.getByRole("button", { name: /Main courses|Mains/i }).click();

    const largeRow = page.locator(".menu-card__volume-row").filter({
      has: page.getByText("Large")
    }).first();
    await expect(largeRow).toBeVisible();
    await largeRow.getByRole("button", { name: "Add" }).click();

    const cartRow = page.locator(".cart-row").first();
    await expect(cartRow).toContainText("Shawarma plate");
    await expect(cartRow).toContainText("Large");

    await switchMenuLanguage(page, "RU");
    await expect(cartRow).toContainText("Шаурма на тарелке");
    await expect(cartRow).toContainText("Большая");

    await switchMenuLanguage(page, "HE");
    await expect(cartRow).toContainText("שווארמה בצלחת");
    await expect(cartRow).toContainText("גדולה");

    await switchMenuLanguage(page, "EN");
    await expect(cartRow).toContainText("Shawarma plate");
    await expect(cartRow).toContainText("Large");
  });
});
