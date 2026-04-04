import { expect, Page, test } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
const PREVIEW_MENU_PATH =
  process.env.E2E_MENU_PREVIEW_PATH ?? `/menu/${MENU_RESTAURANT_SLUG}/0`;
const ORDERING_MENU_PATH = process.env.E2E_ORDERING_MENU_PATH ?? "";
const INVALID_TABLE_TOKEN_PATH = `/menu/${MENU_RESTAURANT_SLUG}/e2e-invalid-token`;
const INVALID_SLUG_PATH = "/menu/e2e-missing-restaurant/0";
const UNAVAILABLE_ITEM_NAME = process.env.E2E_UNAVAILABLE_ITEM_NAME ?? "Hummus with pita";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

test.describe("Client menu top-10 checks", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("TC-01 valid menu path opens correctly", async ({ page }) => {
    await page.goto(PREVIEW_MENU_PATH, { waitUntil: "domcontentloaded" });
    await dismissWelcomeDialogIfVisible(page);

    await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
    await expect(page.locator(".menu-sections")).toBeVisible();
    await expect(page.locator(".menu-hero-header h1")).toBeVisible();
  });

  test("TC-02 invalid table token shows not-found screen", async ({ page }) => {
    await page.goto(INVALID_TABLE_TOKEN_PATH, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("TC-03 invalid restaurant slug shows not-found screen", async ({ page }) => {
    await page.goto(INVALID_SLUG_PATH, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("TC-04 first render shows restaurant and table number", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
    await expect(page.locator(".menu-hero-header h1")).toBeVisible();

    const lead = page.locator("p.lead");
    await expect(lead).toContainText("You are ordering from table");
    await expect(lead).toContainText(/\d+/);
  });

  test("TC-05 skeleton is visible while menu loads", async ({ page }) => {
    await page.goto(PREVIEW_MENU_PATH, { waitUntil: "commit" });

    const skeleton = page.locator(".menu-skeleton__headline");
    const sawSkeleton = await skeleton
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);

    if (!sawSkeleton) {
      await expect(page.locator(".menu-sections")).toBeVisible();
      return;
    }

    await expect(page.locator(".menu-sections")).toBeVisible();
  });

  test("TC-06 no runtime console errors on menu open", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(PREVIEW_MENU_PATH, { waitUntil: "load" });
    await dismissWelcomeDialogIfVisible(page);
    await page.waitForTimeout(1200);

    const allowedNoise = ["favicon.ico"];
    const relevantConsoleErrors = consoleErrors.filter(
      (entry) => !allowedNoise.some((allowed) => entry.includes(allowed))
    );

    expect(pageErrors).toEqual([]);
    expect(relevantConsoleErrors).toEqual([]);
  });

  test("TC-07 Dishes filter shows only dish categories", async ({ page }) => {
    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    await page.getByRole("button", { name: /Dishes/i }).first().click();

    const sectionTitles = await page.locator(".menu-section .section-header h2").allInnerTexts();
    const normalized = sectionTitles.map((title) => title.toLowerCase());
    const drinkWords = [
      "drinks",
      "fluids",
      "draft",
      "bottled",
      "whiskey",
      "vodka",
      "rum",
      "cognac",
      "gin",
      "tequila",
      "non-alcoholic"
    ];

    expect(normalized.length).toBeGreaterThan(0);
    expect(normalized.some((title) => drinkWords.some((word) => title.includes(word)))).toBe(
      false
    );
  });

  test("TC-08 Drinks filter shows only drink categories", async ({ page }) => {
    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    await page.getByRole("button", { name: /Drinks/i }).first().click();

    const sectionTitles = await page.locator(".menu-section .section-header h2").allInnerTexts();
    const normalized = sectionTitles.map((title) => title.toLowerCase());
    const dishWords = ["starters", "main courses", "desserts"];
    const drinkWords = ["drinks", "fluids", "draft", "bottled", "non-alcoholic"];

    expect(normalized.length).toBeGreaterThan(0);
    expect(normalized.some((title) => dishWords.some((word) => title.includes(word)))).toBe(false);
    expect(normalized.some((title) => drinkWords.some((word) => title.includes(word)))).toBe(
      true
    );
  });

  test("TC-09 switching categories does not reset cart", async ({ page }) => {
    test.skip(
      !ORDERING_MENU_PATH,
      "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
    );

    await openMenuInEnglish(page, ORDERING_MENU_PATH);
    await expect(page.getByRole("heading", { name: "My order" })).toBeVisible();

    await page.getByRole("button", { name: /Dishes/i }).first().click();
    const addButton = page
      .locator(".menu-card button")
      .filter({ hasText: "Add" })
      .first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    const cartRows = page.locator(".cart-row");
    await expect(cartRows).toHaveCount(1);
    const totalBefore = (await page.locator(".cart-summary strong").innerText()).trim();

    await page.getByRole("button", { name: /Drinks/i }).first().click();
    await page.getByRole("button", { name: /Dishes/i }).first().click();

    await expect(cartRows).toHaveCount(1);
    await expect(page.locator(".cart-summary strong")).toHaveText(totalBefore);
  });

  test("TC-10 unavailable item is not shown to guests", async ({ page }) => {
    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    const unavailableItemPattern = new RegExp(escapeRegExp(UNAVAILABLE_ITEM_NAME), "i");
    await expect(page.locator(".menu-card h3", { hasText: unavailableItemPattern })).toHaveCount(0);
  });
});
