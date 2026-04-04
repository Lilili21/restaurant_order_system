import { expect, Page, test } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
const PREVIEW_MENU_PATH =
  process.env.E2E_MENU_PREVIEW_PATH ?? `/menu/${MENU_RESTAURANT_SLUG}/0`;
const ORDERING_MENU_PATH = process.env.E2E_ORDERING_MENU_PATH ?? "";

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

async function addBasicItemFromCard(page: Page, index: number) {
  const card = page
    .locator(".menu-card")
    .filter({
      has: page.locator(".menu-card__footer button", { hasText: "Add" })
    })
    .nth(index);
  await expect(card).toBeVisible();

  const name = (await card.locator("h3").first().innerText()).trim();
  const price = parseCurrency(await card.locator(".menu-card__footer strong").innerText());
  await card.locator(".menu-card__footer button", { hasText: "Add" }).click();

  return { name, price };
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

test.describe("Client menu checks TC-11..TC-20", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("TC-11 items without image render without layout issues", async ({ page }) => {
    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    const cardsWithoutImage = page
      .locator(".menu-card")
      .filter({ hasNot: page.locator(".menu-card__image-wrap") });
    const count = await cardsWithoutImage.count();
    test.skip(count === 0, "No items without image in current menu dataset.");

    const firstCard = cardsWithoutImage.first();
    await expect(firstCard.locator("h3")).toBeVisible();
    await expect(firstCard.locator(".menu-card__body")).toBeVisible();
  });

  test("TC-12 long text does not break card layout", async ({ page }) => {
    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    const viewportWidth = await page.evaluate(() => window.innerWidth);
    const cards = page.locator(".menu-card");
    const cardsCount = await cards.count();
    expect(cardsCount).toBeGreaterThan(0);

    for (let index = 0; index < Math.min(cardsCount, 8); index += 1) {
      const card = cards.nth(index);
      const box = await card.boundingBox();

      expect(box).not.toBeNull();
      if (!box) {
        continue;
      }
      expect(box.width).toBeGreaterThan(120);
      expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 2);
    }

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("TC-13 adding one item updates cart and total", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.getByRole("heading", { name: "My order" })).toBeVisible();

    const totalBefore = parseCurrency(await page.locator(".cart-summary strong").innerText());
    await addBasicItemFromCard(page, 0);

    await expect(page.locator(".cart-row")).toHaveCount(1);
    const totalAfter = parseCurrency(await page.locator(".cart-summary strong").innerText());
    expect(totalAfter).toBeGreaterThan(totalBefore);
  });

  test("TC-14 increasing quantity recalculates total", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addBasicItemFromCard(page, 0);

    const totalOne = parseCurrency(await page.locator(".cart-summary strong").innerText());
    const row = page.locator(".cart-row").first();
    await row.locator(".quantity-box button").last().click();
    await expect(row.locator(".quantity-box span")).toHaveText("2");

    const totalTwo = parseCurrency(await page.locator(".cart-summary strong").innerText());
    expect(totalTwo).toBeGreaterThan(totalOne);
  });

  test("TC-15 decreasing quantity to zero removes item from cart", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addBasicItemFromCard(page, 0);
    await expect(page.locator(".cart-row")).toHaveCount(1);

    const row = page.locator(".cart-row").first();
    await row.locator(".quantity-box button").first().click();

    await expect(page.locator(".cart-row")).toHaveCount(0);
    await expect(page.locator(".cart-empty-state")).toBeVisible();
  });

  test("TC-16 two different items sum is correct", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    const first = await addBasicItemFromCard(page, 0);
    const second = await addBasicItemFromCard(page, 1);

    await expect(page.locator(".cart-row")).toHaveCount(2);

    const total = parseCurrency(await page.locator(".cart-summary strong").innerText());
    const expected = first.price + second.price;
    expect(Math.abs(total - expected)).toBeLessThan(0.51);
  });

  test("TC-17 selecting drink volume adds selected volume into cart", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    const rows = page.locator(".menu-card__volume-row");
    const rowsCount = await rows.count();
    test.skip(rowsCount === 0, "No menu items with volume options in current dataset.");

    let selectedIndex = -1;
    let selectedLabel = "";

    for (let index = 0; index < rowsCount; index += 1) {
      const labelLocator = rows.nth(index).locator(".menu-card__volume-meta strong");
      const hasLabel = (await labelLocator.count()) > 0;
      const text = hasLabel ? ((await labelLocator.innerText()).trim()) : "";

      if (text) {
        selectedIndex = index;
        selectedLabel = text;
        break;
      }
    }

    if (selectedIndex === -1) {
      selectedIndex = 0;
    }

    const selectedRow = rows.nth(selectedIndex);
    const rowPrice = parseCurrency(
      await selectedRow.locator(".menu-card__volume-meta span").innerText()
    );

    await selectedRow.locator("button", { hasText: "Add" }).click();
    const cartRow = page.locator(".cart-row").first();
    await expect(cartRow).toBeVisible();

    if (selectedLabel) {
      await expect(cartRow).toContainText(selectedLabel);
    }

    const cartRowPrice = parseCurrency(await cartRow.locator("p.muted").innerText());
    expect(Math.abs(cartRowPrice - rowPrice)).toBeLessThan(0.01);
  });

  test("TC-18 removing one item keeps other item intact", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    const first = await addBasicItemFromCard(page, 0);
    const second = await addBasicItemFromCard(page, 1);

    await expect(page.locator(".cart-row")).toHaveCount(2);
    await expect(page.locator(".cart-row").nth(0)).toContainText(first.name);
    await expect(page.locator(".cart-row").nth(1)).toContainText(second.name);

    await page.locator(".cart-row").nth(0).locator(".quantity-box button").first().click();

    await expect(page.locator(".cart-row")).toHaveCount(1);
    await expect(page.locator(".cart-row").first()).toContainText(second.name);
  });

  test("TC-19 submit button is disabled for empty cart", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.locator(".cart-row")).toHaveCount(0);
    await expect(page.locator(".cart-submit")).toBeDisabled();
  });

  test("TC-20 successful submit clears cart", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    let createOrderPayload: unknown = null;

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

      createOrderPayload = body;
      const responseItems = (body.items ?? []).map((item, index) => ({
        id: `e2e-order-item-${index + 1}`,
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
          id: "e2e-order-1",
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

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await addBasicItemFromCard(page, 0);

    await expect(page.locator(".cart-row")).toHaveCount(1);
    await clickCartSubmit(page);

    const reviewDialog = page.locator(".modal-card--review");
    await expect(reviewDialog).toBeVisible();
    await reviewDialog.getByRole("button", { name: "OK" }).click();

    const messageDialog = page.locator(".modal-card");
    await expect(messageDialog).toContainText("Your order has been sent.");
    await messageDialog.locator(".modal-card__ack").click();

    await expect(page.locator(".cart-row")).toHaveCount(0);
    await expect(page.locator(".cart-empty-state")).toBeVisible();
    expect(createOrderPayload).not.toBeNull();
  });
});
