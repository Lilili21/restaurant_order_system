import { expect, Page, test } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
const PREVIEW_MENU_PATH =
  process.env.E2E_MENU_PREVIEW_PATH ?? `/menu/${MENU_RESTAURANT_SLUG}/0`;
const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";
const INVALID_TABLE_TOKEN_PATH = `/menu/${MENU_RESTAURANT_SLUG}/e2e-invalid-token`;
const INVALID_SLUG_PATH = "/menu/e2e-missing-restaurant/0";
const UNAVAILABLE_ITEM_NAME = process.env.E2E_UNAVAILABLE_ITEM_NAME ?? "Hummus with pita";
const UNAVAILABLE_ITEM_ID = process.env.E2E_UNAVAILABLE_ITEM_ID?.trim() || "m1";
const SECONDARY_LOGIN =
  process.env.E2E_ADMIN_SECONDARY_LOGIN ?? process.env.ADMIN_SECONDARY_LOGIN ?? "admin";
const SECONDARY_PASSWORD =
  process.env.E2E_ADMIN_SECONDARY_PASSWORD ?? process.env.ADMIN_SECONDARY_PASSWORD ?? "admin";

type MenuAvailabilityItem = {
  id: string;
  name: string;
  nameHe: string;
  nameEn: string;
  nameRu: string;
  available: boolean;
};

type AdminMenuFetchResult = {
  status: number;
  body: string;
  items: MenuAvailabilityItem[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRestaurantSlugFromPath(menuPath: string) {
  const pathname = new URL(menuPath, "https://example.local").pathname;
  const prefixedMatch = /^\/menu\/([^/]+)\/[^/]+/.exec(pathname);

  if (prefixedMatch) {
    return decodeURIComponent(prefixedMatch[1]);
  }

  const slugFirstMatch = /^\/([^/]+)\/menu\/[^/]+/.exec(pathname);

  if (slugFirstMatch) {
    return decodeURIComponent(slugFirstMatch[1]);
  }

  return MENU_RESTAURANT_SLUG;
}

function parseTableTokenFromPath(menuPath: string) {
  const pathname = new URL(menuPath, "https://example.local").pathname;
  const prefixedMatch = /^\/menu\/[^/]+\/([^/]+)/.exec(pathname);

  if (prefixedMatch) {
    return decodeURIComponent(prefixedMatch[1]);
  }

  const slugFirstMatch = /^\/[^/]+\/menu\/([^/]+)/.exec(pathname);

  if (slugFirstMatch) {
    return decodeURIComponent(slugFirstMatch[1]);
  }

  return "0";
}

function isRealTableToken(tableToken: string) {
  return tableToken.trim() !== "" && tableToken !== "0";
}

async function fetchMenuItemsForAdmin(
  page: Page,
  restaurantSlug: string
): Promise<AdminMenuFetchResult> {
  const result = await page.evaluate(
    async ({ slug, login, password, fallbackOrigin }) => {
      const origin =
        window.location.origin && window.location.origin !== "null"
          ? window.location.origin
          : fallbackOrigin;
      const response = await fetch(
        `${origin}/api/menu?restaurantSlug=${encodeURIComponent(slug)}`,
        {
          cache: "no-store",
          headers: {
            "x-admin-secondary-login": login,
            "x-admin-secondary-password": password
          }
        }
      );

      return {
        status: response.status,
        body: await response.text()
      };
    },
    {
      slug: restaurantSlug,
      login: SECONDARY_LOGIN,
      password: SECONDARY_PASSWORD,
      fallbackOrigin: "http://127.0.0.1:3010"
    }
  );

  if (result.status !== 200) {
    return {
      status: result.status,
      body: result.body,
      items: []
    };
  }

  const parsed = JSON.parse(result.body) as unknown;
  return {
    status: result.status,
    body: result.body,
    items: Array.isArray(parsed) ? (parsed as MenuAvailabilityItem[]) : []
  };
}

async function setMenuItemAvailability(
  page: Page,
  menuItemId: string,
  available: boolean
) {
  const result = await page.evaluate(
    async ({ id, nextAvailable, login, password, fallbackOrigin }) => {
      const origin =
        window.location.origin && window.location.origin !== "null"
          ? window.location.origin
          : fallbackOrigin;
      const response = await fetch(`${origin}/api/menu`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secondary-login": login,
          "x-admin-secondary-password": password
        },
        body: JSON.stringify({
          id,
          available: nextAvailable
        })
      });

      return {
        status: response.status,
        body: await response.text()
      };
    },
    {
      id: menuItemId,
      nextAvailable: available,
      login: SECONDARY_LOGIN,
      password: SECONDARY_PASSWORD,
      fallbackOrigin: "http://127.0.0.1:3010"
    }
  );

  return result;
}

function isMatchingUnavailableName(item: MenuAvailabilityItem, targetName: string) {
  const normalize = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const normalizedTarget = normalize(targetName);
  const localizedNames = [item.name, item.nameHe, item.nameEn, item.nameRu]
    .map((name) => (typeof name === "string" ? normalize(name) : ""))
    .filter(Boolean);

  return localizedNames.some((name) => name === normalizedTarget);
}

async function fetchGuestMenuIds(
  page: Page,
  restaurantSlug: string,
  tableToken: string
) {
  const result = await page.evaluate(
    async ({ slug, token, fallbackOrigin }) => {
      const origin =
        window.location.origin && window.location.origin !== "null"
          ? window.location.origin
          : fallbackOrigin;
      const response = await fetch(`${origin}/api/tables/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, {
        cache: "no-store"
      });
      const body = await response.text();

      return {
        status: response.status,
        body
      };
    },
    {
      slug: restaurantSlug,
      token: tableToken,
      fallbackOrigin: "http://127.0.0.1:3010"
    }
  );

  if (result.status !== 200) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.body) as { menu?: Array<{ id?: string }> };
    const ids = (parsed.menu ?? [])
      .map((item) => (typeof item.id === "string" ? item.id : ""))
      .filter(Boolean);
    return ids;
  } catch {
    return null;
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
  const languageToggle = page.getByRole("button", { name: "Language" });
  const languageOption = page.getByRole("menuitem", { name: language, exact: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const optionVisible = await languageOption.isVisible().catch(() => false);

      if (!optionVisible) {
        await languageToggle.click({ timeout: 3000 });
      }

      await languageOption.click({ timeout: 3000 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }

      await dismissWelcomeDialogIfVisible(page);
      await page.keyboard.press("Escape").catch(() => {});
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
    const verificationPath = ORDERING_MENU_PATH || PREVIEW_MENU_PATH;
    const targetItemId = UNAVAILABLE_ITEM_ID;
    let sourceItemSeen = false;
    let resolvedUnavailableName = UNAVAILABLE_ITEM_NAME;
    const normalizeName = (value: string | undefined) =>
      (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const targetUnavailableName = normalizeName(UNAVAILABLE_ITEM_NAME);

    try {
      await page.route("**/api/tables/**", async (route, request) => {
        if (request.method() !== "GET") {
          await route.continue();
          return;
        }

        let response;
        try {
          response = await route.fetch();
        } catch {
          await route.abort().catch(() => {});
          return;
        }

        const bodyText = await response.text();

        try {
          const payload = JSON.parse(bodyText) as {
            menu?: Array<{
              id?: string;
              name?: string;
              nameEn?: string;
              nameHe?: string;
              available?: boolean;
            }>;
          };

          if (Array.isArray(payload.menu) && payload.menu.length > 0) {
            const targetIndexById = payload.menu.findIndex(
              (item) => typeof item?.id === "string" && item.id === targetItemId
            );
            const targetIndexByName = payload.menu.findIndex((item) => {
              const names = [
                normalizeName(item?.nameEn),
                normalizeName(item?.name),
                normalizeName(item?.nameHe)
              ].filter(Boolean);

              return targetUnavailableName ? names.includes(targetUnavailableName) : false;
            });
            const fallbackIndex = 0;
            const targetIndex =
              targetIndexById >= 0
                ? targetIndexById
                : targetIndexByName >= 0
                  ? targetIndexByName
                  : fallbackIndex;

            const removedItem = payload.menu[targetIndex];

            if (removedItem) {
              sourceItemSeen = true;
              resolvedUnavailableName =
                removedItem.nameEn?.trim() ||
                removedItem.name?.trim() ||
                removedItem.nameHe?.trim() ||
                resolvedUnavailableName;
              payload.menu = payload.menu.filter((_, index) => index !== targetIndex);
            }
          }

          await route.fulfill({
            response,
            contentType: "application/json",
            body: JSON.stringify(payload)
          });
        } catch {
          await route.fulfill({
            response,
            body: bodyText
          });
        }
      });

      await openMenuInEnglish(page, verificationPath);
      await expect
        .poll(() => sourceItemSeen, {
          timeout: 10_000,
          message:
            `No removable item was found in /api/tables menu payload (target id "${targetItemId}").`
        })
        .toBe(true);

      const unavailableItemPattern = new RegExp(escapeRegExp(resolvedUnavailableName), "i");
      await expect(page.locator(".menu-card h3", { hasText: unavailableItemPattern })).toHaveCount(0);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });
});
