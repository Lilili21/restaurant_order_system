import { expect, Page, test } from "@playwright/test";

const PREVIEW_MENU_PATH = process.env.E2E_MENU_PREVIEW_PATH ?? "/menu/olive-bistro/0";
const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";
const SECONDARY_LOGIN =
  process.env.E2E_ADMIN_SECONDARY_LOGIN ?? process.env.ADMIN_SECONDARY_LOGIN ?? "admin";
const SECONDARY_PASSWORD =
  process.env.E2E_ADMIN_SECONDARY_PASSWORD ?? process.env.ADMIN_SECONDARY_PASSWORD ?? "admin";

type BannerSettingsPayload = {
  promotions: Array<{
    id: string;
    enabled: boolean;
    text: string;
    categories: string[];
    days: number[];
    discountPercent: number;
    startsFrom: string | null;
    until: string | null;
  }>;
  businessLunches: Array<{
    id: string;
    enabled: boolean;
    text: string;
    categories: string[];
    days: number[];
    startsFrom: string | null;
    until: string | null;
  }>;
};

function parseRestaurantSlugFromPath(menuPath: string) {
  const pathname = new URL(menuPath, "https://example.local").pathname;
  const prefixedMatch = /^\/menu\/([^/]+)\//.exec(pathname);

  if (prefixedMatch) {
    return decodeURIComponent(prefixedMatch[1]);
  }

  const slugFirstMatch = /^\/([^/]+)\/menu\//.exec(pathname);
  if (slugFirstMatch) {
    return decodeURIComponent(slugFirstMatch[1]);
  }

  return "olive-bistro";
}

function buildBannerTestSettings() {
  const now = Date.now();
  const day = new Date(now).getDay();

  const activeStart = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const activeEnd = new Date(now + 2 * 60 * 60 * 1000).toISOString();
  const inactiveStart = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const inactiveEnd = new Date(now - 4 * 60 * 60 * 1000).toISOString();

  return {
    promotions: [
      {
        id: "qa-promo-active",
        enabled: true,
        text: "QA Promo Active",
        categories: ["starters"],
        days: [day],
        discountPercent: 20,
        startsFrom: activeStart,
        until: activeEnd
      },
      {
        id: "qa-promo-inactive",
        enabled: true,
        text: "QA Promo Inactive",
        categories: ["mains"],
        days: [day],
        discountPercent: 15,
        startsFrom: inactiveStart,
        until: inactiveEnd
      }
    ],
    businessLunches: [
      {
        id: "qa-lunch-active",
        enabled: true,
        text: "QA Lunch Active",
        categories: ["starters"],
        days: [day],
        startsFrom: activeStart,
        until: activeEnd
      },
      {
        id: "qa-lunch-inactive",
        enabled: true,
        text: "QA Lunch Inactive",
        categories: ["mains"],
        days: [day],
        startsFrom: inactiveStart,
        until: inactiveEnd
      }
    ]
  } satisfies BannerSettingsPayload;
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

function buildScheduleWindow(mode: "future" | "active" | "past") {
  const now = Date.now();

  if (mode === "future") {
    return {
      startsFrom: new Date(now + 60 * 60 * 1000).toISOString(),
      until: new Date(now + 2 * 60 * 60 * 1000).toISOString()
    };
  }

  if (mode === "past") {
    return {
      startsFrom: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      until: new Date(now - 60 * 60 * 1000).toISOString()
    };
  }

  return {
    startsFrom: new Date(now - 60 * 60 * 1000).toISOString(),
    until: new Date(now + 60 * 60 * 1000).toISOString()
  };
}

async function patchMenuSettings(
  page: Page,
  restaurantSlug: string,
  updates: Partial<BannerSettingsPayload>
) {
  const result = await page.evaluate(
    async ({ payload, login, password, slug }) => {
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
      payload: updates,
      login: SECONDARY_LOGIN,
      password: SECONDARY_PASSWORD,
      slug: restaurantSlug
    }
  );

  expect(result.status, `menu-settings PATCH failed: ${result.body}`).toBe(200);
}

async function fetchMenuSettingsSnapshot(
  page: Page,
  restaurantSlug: string
): Promise<BannerSettingsPayload> {
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
  const parsed = JSON.parse(result.body) as Partial<BannerSettingsPayload>;

  return {
    promotions: Array.isArray(parsed.promotions) ? parsed.promotions : [],
    businessLunches: Array.isArray(parsed.businessLunches) ? parsed.businessLunches : []
  };
}

async function withRestoredBannerSettings(
  page: Page,
  restaurantSlug: string,
  run: () => Promise<void>
) {
  const originalSettings = await fetchMenuSettingsSnapshot(page, restaurantSlug);

  try {
    await run();
  } finally {
    await patchMenuSettings(page, restaurantSlug, {
      promotions: originalSettings.promotions,
      businessLunches: originalSettings.businessLunches
    });
  }
}

async function addFirstDish(page: Page, quantity = 1) {
  await page.getByRole("button", { name: /Dishes/i }).first().click();

  for (let attempt = 0; attempt < quantity; attempt += 1) {
    const addButton = page
      .locator(".menu-card .menu-card__footer button")
      .filter({ hasText: "Add" })
      .first();
    await expect(addButton).toBeVisible();
    await addButton.click();
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
  await reviewDialog.getByRole("button", { name: "OK" }).first().click();
  await expect(reviewDialog).toBeHidden();
}

async function closeMessageDialogIfVisible(page: Page) {
  const ackButton = page.locator(".modal-card__ack").first();
  const visible = await ackButton
    .waitFor({ state: "visible", timeout: 2500 })
    .then(() => true)
    .catch(() => false);

  if (!visible) {
    return;
  }

  await ackButton.click();
}

function extractCurrencyAmount(text: string) {
  const normalized = text.replace(/\u00a0/g, " ");
  const match = normalized.match(/([0-9]+(?:[.,][0-9]+)?)\s*₪/);

  if (!match) {
    return null;
  }

  const raw = match[1].trim();
  const numeric =
    raw.includes(",") && raw.includes(".")
      ? Number(raw.replace(/,/g, ""))
      : Number(raw.replace(",", "."));

  return Number.isFinite(numeric) ? numeric : null;
}

test.describe("Client menu banners", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("BANNER-01 active promo is shown and inactive promo is hidden", async ({ page }) => {
    const restaurantSlug = parseRestaurantSlugFromPath(PREVIEW_MENU_PATH);
    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    await withRestoredBannerSettings(page, restaurantSlug, async () => {
      const seeded = buildBannerTestSettings();
      await patchMenuSettings(page, restaurantSlug, seeded);
      await openMenuInEnglish(page, PREVIEW_MENU_PATH);

      const promoBanners = page.locator(".menu-alert-banner.menu-happy-hour:not(.menu-business-lunch)");
      await expect(promoBanners).toHaveCount(1);
      await expect(promoBanners.first()).toContainText("QA Promo Active");
      await expect(promoBanners.first()).toContainText("-20%");
      await expect(page.getByText("QA Promo Inactive")).toHaveCount(0);
    });
  });

  test("BANNER-02 active business lunch is shown and inactive lunch categories stay hidden", async ({
    page
  }) => {
    const restaurantSlug = parseRestaurantSlugFromPath(PREVIEW_MENU_PATH);
    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    await withRestoredBannerSettings(page, restaurantSlug, async () => {
      const seeded = buildBannerTestSettings();
      await patchMenuSettings(page, restaurantSlug, seeded);
      await openMenuInEnglish(page, PREVIEW_MENU_PATH);

      const lunchBanner = page.locator(".menu-alert-banner.menu-business-lunch").first();
      await expect(lunchBanner).toBeVisible();
      await expect(lunchBanner).toContainText("QA Lunch Active");
      await expect(page.getByText("QA Lunch Inactive")).toHaveCount(0);

      await expect(page.locator(".menu-section h2", { hasText: /Starters/i })).toHaveCount(1);
      await expect(page.locator(".menu-section h2", { hasText: /Main courses/i })).toHaveCount(0);
    });
  });

  test("BANNER-03 business lunch is shown only inside its schedule window", async ({ page }) => {
    const restaurantSlug = parseRestaurantSlugFromPath(PREVIEW_MENU_PATH);
    const day = new Date().getDay();
    const futureWindow = buildScheduleWindow("future");
    const activeWindow = buildScheduleWindow("active");
    const pastWindow = buildScheduleWindow("past");

    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    await withRestoredBannerSettings(page, restaurantSlug, async () => {
      await patchMenuSettings(page, restaurantSlug, {
        promotions: [],
        businessLunches: [
          {
            id: "qa-lunch-scheduled",
            enabled: true,
            text: "QA Lunch Scheduled",
            categories: ["mains"],
            days: [day],
            startsFrom: futureWindow.startsFrom,
            until: futureWindow.until
          }
        ]
      });
      await openMenuInEnglish(page, PREVIEW_MENU_PATH);
      await expect(page.getByText("QA Lunch Scheduled")).toHaveCount(0);
      await expect(page.locator(".menu-section h2", { hasText: /Main courses/i })).toHaveCount(0);

      await patchMenuSettings(page, restaurantSlug, {
        promotions: [],
        businessLunches: [
          {
            id: "qa-lunch-scheduled",
            enabled: true,
            text: "QA Lunch Scheduled",
            categories: ["mains"],
            days: [day],
            startsFrom: activeWindow.startsFrom,
            until: activeWindow.until
          }
        ]
      });
      await openMenuInEnglish(page, PREVIEW_MENU_PATH);
      await expect(page.getByText("QA Lunch Scheduled")).toHaveCount(1);
      await expect(page.locator(".menu-section h2", { hasText: /Main courses/i })).toHaveCount(1);

      await patchMenuSettings(page, restaurantSlug, {
        promotions: [],
        businessLunches: [
          {
            id: "qa-lunch-scheduled",
            enabled: true,
            text: "QA Lunch Scheduled",
            categories: ["mains"],
            days: [day],
            startsFrom: pastWindow.startsFrom,
            until: pastWindow.until
          }
        ]
      });
      await openMenuInEnglish(page, PREVIEW_MENU_PATH);
      await expect(page.getByText("QA Lunch Scheduled")).toHaveCount(0);
      await expect(page.locator(".menu-section h2", { hasText: /Main courses/i })).toHaveCount(0);
    });
  });

  test("BANNER-04 happy hour is shown only inside its schedule window", async ({ page }) => {
    const restaurantSlug = parseRestaurantSlugFromPath(PREVIEW_MENU_PATH);
    const day = new Date().getDay();
    const futureWindow = buildScheduleWindow("future");
    const activeWindow = buildScheduleWindow("active");
    const pastWindow = buildScheduleWindow("past");
    const promoBanner = page.locator(".menu-alert-banner.menu-happy-hour:not(.menu-business-lunch)");

    await openMenuInEnglish(page, PREVIEW_MENU_PATH);

    await withRestoredBannerSettings(page, restaurantSlug, async () => {
      await patchMenuSettings(page, restaurantSlug, {
        promotions: [
          {
            id: "qa-promo-scheduled",
            enabled: true,
            text: "QA Promo Scheduled",
            categories: ["mains"],
            days: [day],
            discountPercent: 20,
            startsFrom: futureWindow.startsFrom,
            until: futureWindow.until
          }
        ],
        businessLunches: []
      });
      await openMenuInEnglish(page, PREVIEW_MENU_PATH);
      await expect(promoBanner).toHaveCount(0);

      await patchMenuSettings(page, restaurantSlug, {
        promotions: [
          {
            id: "qa-promo-scheduled",
            enabled: true,
            text: "QA Promo Scheduled",
            categories: ["mains"],
            days: [day],
            discountPercent: 20,
            startsFrom: activeWindow.startsFrom,
            until: activeWindow.until
          }
        ],
        businessLunches: []
      });
      await openMenuInEnglish(page, PREVIEW_MENU_PATH);
      await expect(promoBanner).toHaveCount(1);
      await expect(promoBanner.first()).toContainText("QA Promo Scheduled");
      await expect(promoBanner.first()).toContainText("-20%");

      await patchMenuSettings(page, restaurantSlug, {
        promotions: [
          {
            id: "qa-promo-scheduled",
            enabled: true,
            text: "QA Promo Scheduled",
            categories: ["mains"],
            days: [day],
            discountPercent: 20,
            startsFrom: pastWindow.startsFrom,
            until: pastWindow.until
          }
        ],
        businessLunches: []
      });
      await openMenuInEnglish(page, PREVIEW_MENU_PATH);
      await expect(promoBanner).toHaveCount(0);
    });
  });

  test("BANNER-05 submitted order keeps discounted total after happy-hour ends", async ({
    page
  }) => {
    const restaurantSlug = parseRestaurantSlugFromPath(ORDERING_MENU_PATH);
    const day = new Date().getDay();
    const activeWindow = buildScheduleWindow("active");
    const pastWindow = buildScheduleWindow("past");

    await openMenuInEnglish(page, ORDERING_MENU_PATH);

    await withRestoredBannerSettings(page, restaurantSlug, async () => {
      await patchMenuSettings(page, restaurantSlug, {
        promotions: [
          {
            id: "qa-promo-persist",
            enabled: true,
            text: "QA Promo Persist",
            categories: ["mains", "starters"],
            days: [day],
            discountPercent: 20,
            startsFrom: activeWindow.startsFrom,
            until: activeWindow.until
          }
        ],
        businessLunches: []
      });
      await openMenuInEnglish(page, ORDERING_MENU_PATH);

      const createOrderResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/orders") &&
          response.request().method() === "POST" &&
          response.status() === 201
      );

      await addFirstDish(page, 1);
      await submitOrderViaReviewDialog(page);
      await closeMessageDialogIfVisible(page);

      const createOrderResponse = await createOrderResponsePromise;
      const createdOrder = (await createOrderResponse.json()) as { total?: number };
      expect(typeof createdOrder.total).toBe("number");

      const submittedSummary = page.locator(".submitted-orders__summary");
      await expect(submittedSummary).toBeVisible({ timeout: 10_000 });
      const beforeText = await submittedSummary.innerText();
      const beforeAmount = extractCurrencyAmount(beforeText);
      expect(beforeAmount).not.toBeNull();

      await patchMenuSettings(page, restaurantSlug, {
        promotions: [
          {
            id: "qa-promo-persist",
            enabled: true,
            text: "QA Promo Persist",
            categories: ["mains", "starters"],
            days: [day],
            discountPercent: 20,
            startsFrom: pastWindow.startsFrom,
            until: pastWindow.until
          }
        ],
        businessLunches: []
      });

      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await expect(
        page.locator(".menu-alert-banner.menu-happy-hour:not(.menu-business-lunch)")
      ).toHaveCount(0);
      await expect(submittedSummary).toBeVisible({ timeout: 10_000 });

      const afterText = await submittedSummary.innerText();
      const afterAmount = extractCurrencyAmount(afterText);
      expect(afterAmount).not.toBeNull();
      expect(afterAmount).toBe(beforeAmount);

      if (typeof createdOrder.total === "number" && beforeAmount !== null) {
        expect(Math.abs(beforeAmount - createdOrder.total)).toBeLessThanOrEqual(0.01);
      }
    });
  });
});
