import { expect, Page, test } from "@playwright/test";

import { createMockMenuItem } from "./fixtures";

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

async function clickLanguageButtonWithRetry(
  page: Page,
  language: "EN" | "RU" | "HE"
) {
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

async function openMenuInEnglish(
  page: Page,
  menuPath: string
) {
  await page.goto(menuPath, { waitUntil: "domcontentloaded" });
  await dismissWelcomeDialogIfVisible(page);
  await clickLanguageButtonWithRetry(page, "EN");
  await dismissWelcomeDialogIfVisible(page);
  await expect(page.locator(".menu-sections")).toBeVisible();
}

test("admin menu availability toggle updates item state", async ({ page }) => {
  let menuItems = [
    createMockMenuItem({ id: "menu-item-qa-1", name: "QA Dish 1", available: true }),
    createMockMenuItem({ id: "menu-item-qa-2", name: "QA Dish 2", available: false })
  ];
  let lastPatchPayload: unknown = null;

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

  await page.route("**/api/menu-settings?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.route("**/api/admin-analytics?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.route("**/api/menu?**", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(menuItems)
      });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/menu", async (route, request) => {
    if (request.method() !== "PATCH") {
      await route.continue();
      return;
    }

    const rawBody = request.postData() ?? "{}";
    const payload = JSON.parse(rawBody) as { id?: string; available?: boolean };
    lastPatchPayload = payload;

    if (payload.id && typeof payload.available === "boolean") {
      const nextAvailable = payload.available;
      menuItems = menuItems.map((item) =>
        item.id === payload.id ? { ...item, available: nextAvailable } : item
      );
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto("/admin/menu");

  await page.getByRole("button", { name: /^Menu$/ }).click();
  await page.getByRole("button", { name: "Edit" }).click();

  const firstCard = page
    .locator("article.order-card")
    .filter({
      has: page.locator(".menu-editor__availability", { hasText: "Available" })
    })
    .first();
  const availabilityToggle = firstCard.locator(
    ".menu-editor__availability-toggle input[type='checkbox']"
  );
  const availabilityPill = firstCard.locator(".menu-editor__availability");

  await expect(firstCard).toBeVisible();
  await expect(availabilityPill).toHaveText("Available");

  await availabilityToggle.click();

  await expect(availabilityPill).toHaveText("Unavailable");
  await expect(page.locator(".status-message")).toContainText("Item is now unavailable.");
  await expect
    .poll(() => lastPatchPayload as { available?: boolean } | null)
    .toMatchObject({ available: false });
});

test("item switched to unavailable in admin disappears from guest menu", async ({ page }) => {
  test.skip(
    !ORDERING_MENU_PATH,
    "Set E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<realTableToken> to run this case."
  );

  const targetItemId = "menu-item-qa-hidden";
  const targetDishName = "E2E Availability Dish";
  let menuItems = [
    createMockMenuItem({
      id: targetItemId,
      name: targetDishName,
      nameHe: targetDishName,
      nameEn: targetDishName,
      nameRu: targetDishName,
      available: true
    }),
    createMockMenuItem({
      id: "menu-item-qa-secondary",
      name: "E2E Secondary Dish",
      nameHe: "E2E Secondary Dish",
      nameEn: "E2E Secondary Dish",
      nameRu: "E2E Secondary Dish",
      available: true
    })
  ];
  let lastPatchPayload: unknown = null;

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

  await page.route("**/api/menu-settings?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.route("**/api/admin-analytics?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.route("**/api/menu?**", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(menuItems)
      });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/menu", async (route, request) => {
    if (request.method() !== "PATCH") {
      await route.continue();
      return;
    }

    const payload = JSON.parse(request.postData() ?? "{}") as {
      id?: string;
      available?: boolean;
    };
    lastPatchPayload = payload;

    if (payload.id && typeof payload.available === "boolean") {
      const nextAvailable = payload.available;
      menuItems = menuItems.map((item) =>
        item.id === payload.id ? { ...item, available: nextAvailable } : item
      );
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

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
        activeServiceRequests: [],
        menu: menuItems.filter((item) => item.available)
      })
    });
  });

  await openMenuInEnglish(page, ORDERING_MENU_PATH);
  await expect(
    page.locator(".menu-card h3", { hasText: targetDishName }).first()
  ).toBeVisible();

  await page.goto("/admin/menu");
  await page.getByRole("button", { name: /^Menu$/ }).click();
  await page.getByRole("button", { name: "Edit" }).click();

  const firstCard = page
    .locator("article.order-card")
    .filter({
      has: page.locator(".menu-editor__availability", { hasText: "Available" })
    })
    .first();
  const availabilityToggle = firstCard.locator(
    ".menu-editor__availability-toggle input[type='checkbox']"
  );
  await availabilityToggle.click();

  await expect
    .poll(() => lastPatchPayload as { id?: string; available?: boolean } | null)
    .toMatchObject({ id: targetItemId, available: false });

  await openMenuInEnglish(page, ORDERING_MENU_PATH);
  await expect(page.locator(".menu-card h3", { hasText: targetDishName })).toHaveCount(0);
});
