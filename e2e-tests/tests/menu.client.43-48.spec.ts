import { expect, Page, test } from "@playwright/test";

const MENU_RESTAURANT_SLUG = process.env.E2E_MENU_RESTAURANT_SLUG ?? "olive-bistro";
const PREVIEW_MENU_PATH =
  process.env.E2E_MENU_PREVIEW_PATH ?? `/menu/${MENU_RESTAURANT_SLUG}/0`;
const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";
const PROMO_ACTIVE_MENU_PATH = process.env.E2E_PROMO_ACTIVE_MENU_PATH ?? "";
const PROMO_INACTIVE_MENU_PATH = process.env.E2E_PROMO_INACTIVE_MENU_PATH ?? "";
const BUSINESS_LUNCH_MENU_PATH = process.env.E2E_BUSINESS_LUNCH_MENU_PATH ?? "";
const BUSINESS_LUNCH_HIDDEN_ITEM = process.env.E2E_BUSINESS_LUNCH_HIDDEN_ITEM ?? "";
const SECONDARY_LOGIN =
  process.env.E2E_ADMIN_SECONDARY_LOGIN ?? process.env.ADMIN_SECONDARY_LOGIN ?? "admin";
const SECONDARY_PASSWORD =
  process.env.E2E_ADMIN_SECONDARY_PASSWORD ?? process.env.ADMIN_SECONDARY_PASSWORD ?? "admin";

type PromotionSettingPayload = {
  id: string;
  enabled: boolean;
  text: string;
  categories: string[];
  days: number[];
  discountPercent: number;
  startsFrom: string | null;
  until: string | null;
};

type BusinessLunchSettingPayload = {
  id: string;
  enabled: boolean;
  text: string;
  categories: string[];
  days: number[];
  startsFrom: string | null;
  until: string | null;
};

type RecommendationSettingPayload = {
  id: string;
  enabled: boolean;
  triggerItemId: string;
  suggestedType: "item" | "category";
  suggestedItemId: string;
  suggestedCategory: string | null;
};

type MenuSettingsSnapshot = {
  promotions: PromotionSettingPayload[];
  businessLunches: BusinessLunchSettingPayload[];
  recommendations: RecommendationSettingPayload[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countFractionDigits(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = value.toString();
  const dotIndex = normalized.indexOf(".");

  if (dotIndex === -1) {
    return 0;
  }

  return normalized.length - dotIndex - 1;
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

function buildScheduleWindow(mode: "active" | "past") {
  const now = Date.now();

  if (mode === "past") {
    return {
      startsFrom: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      until: new Date(now - 2 * 60 * 60 * 1000).toISOString()
    };
  }

  return {
    startsFrom: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    until: new Date(now + 2 * 60 * 60 * 1000).toISOString()
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

async function fetchMenuSettingsSnapshot(
  page: Page,
  restaurantSlug: string
): Promise<MenuSettingsSnapshot> {
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
  const parsed = JSON.parse(result.body) as Partial<MenuSettingsSnapshot>;

  return {
    promotions: Array.isArray(parsed.promotions) ? parsed.promotions : [],
    businessLunches: Array.isArray(parsed.businessLunches) ? parsed.businessLunches : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
  };
}

async function patchMenuSettings(
  page: Page,
  restaurantSlug: string,
  updates: Partial<MenuSettingsSnapshot>
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

  expect(
    result.status,
    `menu-settings PATCH failed (${restaurantSlug}): ${result.body}`
  ).toBe(200);
}

async function readCartItemIdsFromStorage(
  page: Page,
  restaurantSlug: string,
  tableToken: string
) {
  return page.evaluate(({ slug, token }) => {
    const raw = window.localStorage.getItem(`cart:${slug}:${token}`);

    if (!raw) {
      return [] as string[];
    }

    try {
      const parsed = JSON.parse(raw) as Array<{ menuItemId?: string }>;

      if (!Array.isArray(parsed)) {
        return [] as string[];
      }

      return [
        ...new Set(
          parsed
            .map((item) => (typeof item.menuItemId === "string" ? item.menuItemId : ""))
            .filter(Boolean)
        )
      ];
    } catch {
      return [] as string[];
    }
  }, { slug: restaurantSlug, token: tableToken });
}

async function prepareRecommendationRule(
  page: Page,
  targetPath: string
) {
  const { restaurantSlug, tableToken } = parseMenuPath(targetPath);
  const tableResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/tables/${restaurantSlug}/${tableToken}`) &&
      response.request().method() === "GET"
  );

  await openMenuInEnglish(page, targetPath);
  const originalSettings = await fetchMenuSettingsSnapshot(page, restaurantSlug);
  await addFirstDish(page);

  const cartItemIds = await readCartItemIdsFromStorage(page, restaurantSlug, tableToken);
  expect(
    cartItemIds.length,
    "Expected at least one cart item to use as recommendation trigger."
  ).toBeGreaterThan(0);

  const triggerItemId = cartItemIds[0];
  const tablesData = (await (await tableResponsePromise).json()) as {
    menu?: Array<{ id?: string; available?: boolean }>;
  };
  const suggestedItemId =
    (tablesData.menu ?? [])
      .filter(
        (item): item is { id: string; available?: boolean } =>
          typeof item.id === "string" && item.id !== triggerItemId && item.available !== false
      )
      .map((item) => item.id)[0] ?? "";
  expect(
    suggestedItemId,
    "No second available menu item found for recommendation test."
  ).not.toBe("");

  return {
    restaurantSlug,
    originalSettings,
    triggerItemId,
    suggestedItemId
  };
}

async function fetchGuestMenuSnapshot(
  page: Page,
  restaurantSlug: string,
  tableToken: string
) {
  const result = await page.evaluate(async ({ slug, token }) => {
    const response = await fetch(
      `/api/tables/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );

    return {
      status: response.status,
      body: await response.text()
    };
  }, { slug: restaurantSlug, token: tableToken });

  expect(result.status, `tables session GET failed: ${result.body}`).toBe(200);
  const parsed = JSON.parse(result.body) as {
    menu?: Array<{
      id: string;
      category: string;
      price: number;
      volumeOptions?: Array<{ id: string; price: number }>;
    }>;
  };

  return Array.isArray(parsed.menu) ? parsed.menu : [];
}

test.describe("Client menu checks TC-43..TC-48 (promotions & recommendations)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("TC-43 happy hour appears only in active schedule path", async ({ page }) => {
    const activePath = PROMO_ACTIVE_MENU_PATH || ORDERING_MENU_PATH || PREVIEW_MENU_PATH;
    const activePathInfo = parseMenuPath(activePath);
    const inactivePathCandidate = PROMO_INACTIVE_MENU_PATH || activePath;
    const inactivePathInfo = parseMenuPath(inactivePathCandidate);
    const inactivePath =
      inactivePathInfo.restaurantSlug === activePathInfo.restaurantSlug
        ? inactivePathCandidate
        : activePath;
    const restaurantSlug = activePathInfo.restaurantSlug;
    const day = new Date().getDay();
    const activeWindow = buildScheduleWindow("active");
    const pastWindow = buildScheduleWindow("past");

    await openMenuInEnglish(page, activePath);
    const originalSettings = await fetchMenuSettingsSnapshot(page, restaurantSlug);

    try {
      await patchMenuSettings(page, restaurantSlug, {
        promotions: [
          {
            id: "tc-43-happy-hour",
            enabled: true,
            text: "TC-43 Happy Hour",
            categories: ["starters", "mains", "drinks", "desserts"],
            days: [day],
            discountPercent: 20,
            startsFrom: activeWindow.startsFrom,
            until: activeWindow.until
          }
        ]
      });

      await openMenuInEnglish(page, activePath);
      const activeBanner = page.locator(".menu-alert-banner.menu-happy-hour").first();
      await expect(activeBanner).toBeVisible();
      await expect(activeBanner).toContainText("TC-43 Happy Hour");
      await expect(activeBanner).toContainText("-20%");

      await patchMenuSettings(page, restaurantSlug, {
        promotions: [
          {
            id: "tc-43-happy-hour",
            enabled: true,
            text: "TC-43 Happy Hour",
            categories: ["starters", "mains", "drinks", "desserts"],
            days: [day],
            discountPercent: 20,
            startsFrom: pastWindow.startsFrom,
            until: pastWindow.until
          }
        ]
      });

      await openMenuInEnglish(page, inactivePath);
      await expect(page.locator(".menu-alert-banner.menu-happy-hour")).toHaveCount(0);
    } finally {
      await patchMenuSettings(page, restaurantSlug, {
        promotions: originalSettings.promotions
      });
    }
  });

  test("TC-44 business lunch applies only to configured categories", async ({ page }) => {
    const targetPath = BUSINESS_LUNCH_MENU_PATH || ORDERING_MENU_PATH || PREVIEW_MENU_PATH;
    const { restaurantSlug } = parseMenuPath(targetPath);
    const day = new Date().getDay();
    const activeWindow = buildScheduleWindow("active");
    const pastWindow = buildScheduleWindow("past");

    await openMenuInEnglish(page, targetPath);
    const originalSettings = await fetchMenuSettingsSnapshot(page, restaurantSlug);

    try {
      await patchMenuSettings(page, restaurantSlug, {
        businessLunches: [
          {
            id: "tc-44-lunch-active",
            enabled: true,
            text: "TC-44 Lunch Active",
            categories: ["starters"],
            days: [day],
            startsFrom: activeWindow.startsFrom,
            until: activeWindow.until
          },
          {
            id: "tc-44-lunch-inactive",
            enabled: true,
            text: "TC-44 Lunch Inactive",
            categories: ["mains"],
            days: [day],
            startsFrom: pastWindow.startsFrom,
            until: pastWindow.until
          }
        ]
      });

      await openMenuInEnglish(page, targetPath);
      const lunchBanner = page.locator(".menu-alert-banner.menu-business-lunch").first();
      await expect(lunchBanner).toBeVisible();
      await expect(lunchBanner).toContainText("TC-44 Lunch Active");
      await expect(page.getByText("TC-44 Lunch Inactive")).toHaveCount(0);

      if (BUSINESS_LUNCH_HIDDEN_ITEM) {
        const pattern = new RegExp(escapeRegExp(BUSINESS_LUNCH_HIDDEN_ITEM), "i");
        await expect(page.locator(".menu-card h3", { hasText: pattern })).toHaveCount(0);
      }
    } finally {
      await patchMenuSettings(page, restaurantSlug, {
        businessLunches: originalSettings.businessLunches
      });
    }
  });

  test("TC-45 discount math is rounded and consistent in cart", async ({ page }) => {
    const targetPath = PROMO_ACTIVE_MENU_PATH || ORDERING_MENU_PATH || PREVIEW_MENU_PATH;
    const { restaurantSlug, tableToken } = parseMenuPath(targetPath);
    const day = new Date().getDay();
    const activeWindow = buildScheduleWindow("active");

    await openMenuInEnglish(page, targetPath);
    const originalSettings = await fetchMenuSettingsSnapshot(page, restaurantSlug);

    try {
      await patchMenuSettings(page, restaurantSlug, {
        promotions: [
          {
            id: "tc-45-discount",
            enabled: true,
            text: "TC-45 Discount",
            categories: ["starters", "mains", "drinks", "desserts"],
            days: [day],
            discountPercent: 20,
            startsFrom: activeWindow.startsFrom,
            until: activeWindow.until
          }
        ]
      });

      await openMenuInEnglish(page, targetPath);
      await addFirstDish(page);

      const discountLine = page
        .locator("p.muted")
        .filter({ hasText: /Happy hour discount/i })
        .first();
      await expect(discountLine).toBeVisible();

      const createOrderResponsePromise = page.waitForResponse((response) => {
        if (!response.url().includes("/api/orders")) {
          return false;
        }

        if (response.request().method() !== "POST") {
          return false;
        }

        if (response.status() < 200 || response.status() >= 300) {
          return false;
        }

        let body: { type?: string } = {};

        try {
          body = JSON.parse(response.request().postData() ?? "{}") as { type?: string };
        } catch {
          body = {};
        }

        return body.type !== "waiter_call" && body.type !== "bill_request";
      });

      await submitOrderViaReviewDialog(page);
      const createOrderResponse = await createOrderResponsePromise;
      const requestPayload = JSON.parse(
        createOrderResponse.request().postData() ?? "{}"
      ) as {
        items?: Array<{
          menuItemId: string;
          quantity: number;
          volumeOptionId?: string;
          priceOverride?: number;
        }>;
      };
      const createdOrder = (await createOrderResponse.json()) as {
        total?: number;
        items?: Array<{ price?: number; quantity?: number }>;
      };
      const menuSnapshot = await fetchGuestMenuSnapshot(page, restaurantSlug, tableToken);
      const menuById = new Map(menuSnapshot.map((item) => [item.id, item]));
      const requestItems = Array.isArray(requestPayload.items) ? requestPayload.items : [];

      expect(requestItems.length).toBeGreaterThan(0);
      expect(typeof createdOrder.total).toBe("number");

      const expectedTotal = Number(
        requestItems
          .reduce((sum, item) => {
            const menuItem = menuById.get(item.menuItemId);
            expect(menuItem, `Menu item "${item.menuItemId}" not found in table snapshot.`).toBeTruthy();

            const volumePrice =
              item.volumeOptionId && menuItem?.volumeOptions
                ? menuItem.volumeOptions.find((option) => option.id === item.volumeOptionId)?.price
                : undefined;
            const basePrice =
              typeof item.priceOverride === "number"
                ? item.priceOverride
                : typeof volumePrice === "number"
                ? volumePrice
                : Number(menuItem?.price ?? 0);
            const discountedUnitPrice = Number((basePrice * 0.8).toFixed(2));
            return sum + discountedUnitPrice * item.quantity;
          }, 0)
          .toFixed(2)
      );

      expect(Math.abs((createdOrder.total ?? 0) - expectedTotal)).toBeLessThan(0.001);
      expect(countFractionDigits(createdOrder.total ?? 0)).toBeLessThanOrEqual(2);

      for (const item of createdOrder.items ?? []) {
        expect(typeof item.price).toBe("number");
        expect(countFractionDigits(item.price ?? 0)).toBeLessThanOrEqual(2);
      }
    } finally {
      await patchMenuSettings(page, restaurantSlug, {
        promotions: originalSettings.promotions
      });
    }
  });

  test("TC-46 discount is visible in UI and discounted order payload is sent", async ({
    page
  }) => {
    const targetPath = PROMO_ACTIVE_MENU_PATH || ORDERING_MENU_PATH || PREVIEW_MENU_PATH;
    const { restaurantSlug } = parseMenuPath(targetPath);
    const day = new Date().getDay();
    const activeWindow = buildScheduleWindow("active");

    await openMenuInEnglish(page, targetPath);
    const originalSettings = await fetchMenuSettingsSnapshot(page, restaurantSlug);

    try {
      await patchMenuSettings(page, restaurantSlug, {
        promotions: [
          {
            id: "tc-46-discount",
            enabled: true,
            text: "TC-46 Discount",
            categories: ["starters", "mains", "drinks", "desserts"],
            days: [day],
            discountPercent: 20,
            startsFrom: activeWindow.startsFrom,
            until: activeWindow.until
          }
        ]
      });

      await openMenuInEnglish(page, targetPath);
      await addFirstDish(page);

      const discountLine = page
        .locator("p.muted")
        .filter({ hasText: /Happy hour discount/i })
        .first();
      await expect(discountLine).toBeVisible();

      const createOrderResponsePromise = page.waitForResponse((response) => {
        if (!response.url().includes("/api/orders")) {
          return false;
        }

        if (response.request().method() !== "POST") {
          return false;
        }

        if (response.status() < 200 || response.status() >= 300) {
          return false;
        }

        let body: { type?: string } = {};

        try {
          body = JSON.parse(response.request().postData() ?? "{}") as { type?: string };
        } catch {
          body = {};
        }

        return body.type !== "waiter_call" && body.type !== "bill_request";
      });

      await submitOrderViaReviewDialog(page);
      const createOrderResponse = await createOrderResponsePromise;

      const parsedPayload = JSON.parse(
        createOrderResponse.request().postData() ?? "{}"
      ) as { items?: unknown[] };
      expect(Array.isArray(parsedPayload.items)).toBe(true);
      expect((parsedPayload.items ?? []).length).toBeGreaterThan(0);

      const createdOrder = (await createOrderResponse.json()) as { id?: string; total?: number };
      expect(typeof createdOrder.id).toBe("string");
      expect(typeof createdOrder.total).toBe("number");
    } finally {
      await patchMenuSettings(page, restaurantSlug, {
        promotions: originalSettings.promotions
      });
    }
  });

  test("TC-47 recommendation block appears when trigger conditions are met", async ({ page }) => {
    const targetPath = ORDERING_MENU_PATH;
    const recommendationSeed = await prepareRecommendationRule(page, targetPath);

    try {
      await patchMenuSettings(page, recommendationSeed.restaurantSlug, {
        recommendations: [
          {
            id: "tc-47-recommendation",
            enabled: true,
            triggerItemId: recommendationSeed.triggerItemId,
            suggestedType: "item",
            suggestedItemId: recommendationSeed.suggestedItemId,
            suggestedCategory: null
          }
        ]
      });

      await openMenuInEnglish(page, targetPath);
      const recommendationArea = page.locator(".cart-recommendations");
      const recommendationAddButton = recommendationArea
        .locator(".cart-recommendation__button")
        .filter({ hasText: /^Add$/ })
        .first();
      await expect(recommendationAddButton).toBeVisible();
    } finally {
      await patchMenuSettings(page, recommendationSeed.restaurantSlug, {
        recommendations: recommendationSeed.originalSettings.recommendations
      });
    }
  });

  test("TC-48 adding from recommendation updates cart like regular add", async ({ page }) => {
    const targetPath = ORDERING_MENU_PATH;
    const recommendationSeed = await prepareRecommendationRule(page, targetPath);

    try {
      await patchMenuSettings(page, recommendationSeed.restaurantSlug, {
        recommendations: [
          {
            id: "tc-48-recommendation",
            enabled: true,
            triggerItemId: recommendationSeed.triggerItemId,
            suggestedType: "item",
            suggestedItemId: recommendationSeed.suggestedItemId,
            suggestedCategory: null
          }
        ]
      });

      await openMenuInEnglish(page, targetPath);
      const recommendationAddButton = page
        .locator(".cart-recommendation__button")
        .filter({ hasText: /^Add$/ })
        .first();
      await expect(recommendationAddButton).toBeVisible();

      const beforeCount = await page.locator(".cart-row").count();
      await recommendationAddButton.click();
      await expect(page.locator(".cart-row")).toHaveCount(beforeCount + 1);
    } finally {
      await patchMenuSettings(page, recommendationSeed.restaurantSlug, {
        recommendations: recommendationSeed.originalSettings.recommendations
      });
    }
  });
});
