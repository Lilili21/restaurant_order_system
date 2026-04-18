import { APIRequestContext, expect, Page, test } from "@playwright/test";

import { createMockOrder } from "./fixtures";

type OrderRecord = ReturnType<typeof createMockOrder>;

const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";
const SECONDARY_LOGIN =
  process.env.E2E_ADMIN_SECONDARY_LOGIN ?? process.env.ADMIN_SECONDARY_LOGIN ?? "admin";
const SECONDARY_PASSWORD =
  process.env.E2E_ADMIN_SECONDARY_PASSWORD ?? process.env.ADMIN_SECONDARY_PASSWORD ?? "admin";

type CounterSettingsSnapshot = {
  orderMode: "tables" | "counter";
  kitchenOpenEnabled: boolean;
  kitchenOpenUntil: string | null;
  barOpenEnabled: boolean;
  barOpenUntil: string | null;
  contactRequirement: "none" | "name_or_phone" | "phone_only";
  requireOtp: boolean;
  orderNumberPrefix: string;
};

function cloneOrders(input: OrderRecord[]) {
  return input.map((order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item }))
  }));
}

async function setupAdminAuth(page: Page) {
  await page.route("**/api/admin-auth**", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authorized: true })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });
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
    restaurantSlug: "olive-bistro",
    tableToken: "0"
  };
}

function inFuture(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function getGuestShortNumber(displayOrderNumber: string) {
  const parts = displayOrderNumber.split("-").filter(Boolean);
  const tailSource = (parts.length ? parts[parts.length - 1] : "") || displayOrderNumber;
  const tailDigits = tailSource.replace(/\D/g, "");

  if (tailDigits.length >= 4) {
    return tailDigits.slice(-4);
  }

  if (tailSource.length >= 4) {
    return tailSource.slice(-4).toUpperCase();
  }

  return tailDigits || tailSource;
}

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

async function openMenuInEnglish(page: Page, menuPath: string) {
  await page.goto(menuPath, { waitUntil: "domcontentloaded" });
  await dismissWelcomeDialogIfVisible(page);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await dismissWelcomeDialogIfVisible(page);
  await expect(page.locator(".menu-sections")).toBeVisible();
}

async function addFirstOrderableItem(page: Page) {
  const directAdd = page
    .locator(".menu-card .menu-card__footer button")
    .filter({ hasText: /^Add$/ })
    .first();

  if ((await directAdd.count()) > 0) {
    await directAdd.click();
    return;
  }

  const volumeAdd = page
    .locator(".menu-card__volume-row button")
    .filter({ hasText: /^Add$/ })
    .first();
  await expect(volumeAdd).toBeVisible();
  await volumeAdd.click();
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

async function fetchCounterSettingsSnapshot(
  request: APIRequestContext,
  restaurantSlug: string
): Promise<CounterSettingsSnapshot> {
  const response = await request.get(
    `/api/menu-settings?restaurantSlug=${encodeURIComponent(restaurantSlug)}`
  );
  expect(response.ok()).toBe(true);
  const parsed = (await response.json()) as Partial<CounterSettingsSnapshot>;

  return {
    orderMode: parsed.orderMode === "counter" ? "counter" : "tables",
    kitchenOpenEnabled: Boolean(parsed.kitchenOpenEnabled),
    kitchenOpenUntil:
      typeof parsed.kitchenOpenUntil === "string" ? parsed.kitchenOpenUntil : null,
    barOpenEnabled: Boolean(parsed.barOpenEnabled),
    barOpenUntil: typeof parsed.barOpenUntil === "string" ? parsed.barOpenUntil : null,
    contactRequirement:
      parsed.contactRequirement === "phone_only" ||
      parsed.contactRequirement === "name_or_phone"
        ? parsed.contactRequirement
        : "none",
    requireOtp: Boolean(parsed.requireOtp),
    orderNumberPrefix:
      typeof parsed.orderNumberPrefix === "string" && parsed.orderNumberPrefix.trim()
        ? parsed.orderNumberPrefix.trim()
        : "ORD"
  };
}

async function patchCounterSettings(
  request: APIRequestContext,
  restaurantSlug: string,
  updates: Partial<CounterSettingsSnapshot>
) {
  const response = await request.patch("/api/menu-settings", {
    headers: {
      "Content-Type": "application/json",
      "x-admin-secondary-login": SECONDARY_LOGIN,
      "x-admin-secondary-password": SECONDARY_PASSWORD
    },
    data: {
      restaurantSlug,
      ...updates
    }
  });

  expect(response.ok()).toBe(true);
}

test.describe("Restaurant order scoping", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      process.env.E2E_USE_WEB_SERVER !== "true",
      "Run in local mode (E2E_USE_WEB_SERVER=true) to validate restaurant data isolation."
    );

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await setupAdminAuth(page);
  });

  test("SCOPE-01 each restaurant waiter page reads only its own orders", async ({
    page
  }) => {
    const ordersByRestaurant: Record<string, OrderRecord[]> = {
      "olive-bistro": [
        createMockOrder({
          id: "olive-order-1",
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 11,
          items: [
            {
              id: "olive-item-1",
              menuItemId: "olive-menu-1",
              name: "Olive only dish",
              category: "mains",
              price: 64,
              quantity: 1,
              served: false
            }
          ],
          total: 64
        })
      ],
      beerabar: [
        createMockOrder({
          id: "beer-order-1",
          restaurantSlug: "beerabar",
          restaurantName: "BeeraBar",
          tableNumber: 22,
          items: [
            {
              id: "beer-item-1",
              menuItemId: "beer-menu-1",
              name: "Beer only dish",
              category: "mains",
              price: 52,
              quantity: 1,
              served: false
            }
          ],
          total: 52
        })
      ]
    };

    const seenGetSlugs: string[] = [];

    await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
      if (request.method() !== "GET") {
        await route.continue();
        return;
      }

      const url = new URL(request.url());
      const restaurantSlug = (url.searchParams.get("restaurantSlug") ?? "").toLowerCase();
      seenGetSlugs.push(restaurantSlug);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(cloneOrders(ordersByRestaurant[restaurantSlug] ?? []))
      });
    });

    await page.goto("/olive-bistro/waiter/orders");
    await expect(page.getByText("Olive only dish")).toBeVisible();
    await expect(page.getByText("Beer only dish")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Incoming orders|Counter queue/i })).toBeVisible();
    expect(seenGetSlugs).toContain("olive-bistro");

    await page.goto("/beerabar/waiter/orders");
    await expect(page.getByText("Beer only dish")).toBeVisible();
    await expect(page.getByText("Olive only dish")).toHaveCount(0);
    expect(seenGetSlugs).toContain("beerabar");
  });

  test("SCOPE-02 status change is written only inside current restaurant scope", async ({
    page
  }) => {
    const ordersByRestaurant: Record<string, OrderRecord[]> = {
      "olive-bistro": [
        createMockOrder({
          id: "olive-order-2",
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 7,
          items: [
            {
              id: "olive-item-2",
              menuItemId: "olive-menu-2",
              name: "Scope patch dish",
              category: "mains",
              price: 44,
              quantity: 1,
              served: false
            }
          ],
          total: 44
        })
      ],
      beerabar: [
        createMockOrder({
          id: "beer-order-2",
          restaurantSlug: "beerabar",
          restaurantName: "BeeraBar",
          tableNumber: 8,
          items: [
            {
              id: "beer-item-2",
              menuItemId: "beer-menu-2",
              name: "Beer untouched dish",
              category: "mains",
              price: 51,
              quantity: 1,
              served: false
            }
          ],
          total: 51
        })
      ]
    };
    const seenPatchSlugs: string[] = [];

    await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
      const url = new URL(request.url());
      const restaurantSlug = (url.searchParams.get("restaurantSlug") ?? "").toLowerCase();

      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(cloneOrders(ordersByRestaurant[restaurantSlug] ?? []))
        });
        return;
      }

      if (request.method() === "PATCH") {
        seenPatchSlugs.push(restaurantSlug);
        const payload = request.postDataJSON() as { orderId?: string; status?: string };
        const scopedOrders = ordersByRestaurant[restaurantSlug] ?? [];
        const targetIndex = scopedOrders.findIndex((order) => order.id === payload.orderId);

        if (targetIndex < 0 || payload.status !== "served") {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ message: "Invalid scoped patch payload" })
          });
          return;
        }

        const target = scopedOrders[targetIndex];
        const updatedOrder = {
          ...target,
          status: "served" as const,
          updatedAt: new Date().toISOString()
        };
        scopedOrders[targetIndex] = updatedOrder;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(updatedOrder)
        });
        return;
      }

      await route.continue();
    });

    await page.goto("/olive-bistro/waiter/orders");
    await expect(page.getByText("Scope patch dish")).toBeVisible();

    await page.getByRole("button", { name: "Served" }).first().click();
    await expect(page.getByText("Scope patch dish")).toHaveCount(0);
    expect(seenPatchSlugs).toContain("olive-bistro");
    expect(seenPatchSlugs).not.toContain("beerabar");

    await page.goto("/beerabar/waiter/orders");
    await expect(page.getByText("Beer untouched dish")).toBeVisible();
  });

  test("SCOPE-03 tables page and range export read only current restaurant data", async ({
    page
  }) => {
    const seenTablesSlugs: string[] = [];
    const seenOrdersSlugs: string[] = [];
    const seenSettingsSlugs: string[] = [];
    const seenArchiveSlugs: string[] = [];

    await page.route("**/api/menu-settings**", async (route, request) => {
      if (request.method() !== "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      const url = new URL(request.url());
      seenSettingsSlugs.push(url.searchParams.get("restaurantSlug") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workingHoursFrom: "09:00",
          workingHoursRules: [],
          happyHourEnabled: false,
          happyHourDiscountPercent: 0,
          happyHourCategories: [],
          happyHourStartsFrom: null,
          happyHourUntil: null,
          orderMode: "tables"
        })
      });
    });

    await page.route(/\/api\/orders\/?(?:\?.*)?$/, async (route, request) => {
      if (request.method() !== "GET") {
        await route.continue();
        return;
      }

      const url = new URL(request.url());
      seenOrdersSlugs.push(url.searchParams.get("restaurantSlug") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
    });

    await page.route("**/api/tables**", async (route, request) => {
      if (request.method() !== "GET") {
        await route.continue();
        return;
      }

      const url = new URL(request.url());
      seenTablesSlugs.push(url.searchParams.get("restaurantSlug") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tables: [],
          closedSessions: []
        })
      });
    });

    await page.route("**/api/orders-archive**", async (route, request) => {
      const url = new URL(request.url());
      seenArchiveSlugs.push(url.searchParams.get("restaurantSlug") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          start: url.searchParams.get("start"),
          end: url.searchParams.get("end"),
          closedTableSummaries: []
        })
      });
    });

    await page.goto("/olive-bistro/waiter/tables");
    await expect(page.getByRole("heading", { name: "Closed tables" })).toBeVisible();
    expect(seenTablesSlugs).toContain("olive-bistro");
    expect(seenOrdersSlugs).toContain("olive-bistro");
    expect(seenSettingsSlugs).toContain("olive-bistro");

    await page.getByRole("button", { name: /^Download / }).first().click();
    await expect.poll(() => seenArchiveSlugs.length).toBeGreaterThan(0);
    expect(seenArchiveSlugs).toContain("olive-bistro");
  });

  test("SCOPE-04 counter submit shows short popup number and waiter card shows short + full", async ({
    page,
    request
  }) => {
    const { restaurantSlug } = parseMenuPath(ORDERING_MENU_PATH);
    const originalSettings = await fetchCounterSettingsSnapshot(request, restaurantSlug);
    const kitchenOpenUntil = inFuture(120);
    const barOpenUntil = inFuture(120);

    try {
      await patchCounterSettings(request, restaurantSlug, {
        orderMode: "counter",
        kitchenOpenEnabled: true,
        kitchenOpenUntil,
        barOpenEnabled: true,
        barOpenUntil,
        contactRequirement: "none",
        requireOtp: false,
        orderNumberPrefix: "BB"
      });

      await openMenuInEnglish(page, ORDERING_MENU_PATH);
      await addFirstOrderableItem(page);

      const createdOrderPromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/orders") &&
          response.request().method() === "POST" &&
          response.status() === 201
      );

      await submitOrderFromReviewDialog(page);

      const createdOrderResponse = await createdOrderPromise;
      const createdOrder = (await createdOrderResponse.json()) as {
        displayOrderNumber?: string;
      };
      expect(typeof createdOrder.displayOrderNumber).toBe("string");

      const fullNumber = createdOrder.displayOrderNumber as string;
      const shortNumber = getGuestShortNumber(fullNumber);

      const ackDialog = page.locator(".modal-card").filter({
        hasText: "Your order has been sent"
      });
      await expect(ackDialog).toBeVisible();
      await expect(ackDialog).toContainText(`Order number: ${shortNumber}`);
      await expect(ackDialog).not.toContainText(fullNumber);
      await ackDialog.getByRole("button").first().click({ force: true });

      await page.goto(`/${restaurantSlug}/waiter/orders`, {
        waitUntil: "domcontentloaded"
      });
      await expect(page.getByRole("heading", { name: /Counter queue|Incoming orders/i })).toBeVisible();
      await expect
        .poll(
          async () =>
            page
              .locator(".order-card .muted")
              .filter({
                hasText: `Short: ${shortNumber} · Full: ${fullNumber}`
              })
              .count(),
          { timeout: 15_000 }
        )
        .toBeGreaterThan(0);
    } finally {
      await patchCounterSettings(request, restaurantSlug, originalSettings);
    }
  });
});
