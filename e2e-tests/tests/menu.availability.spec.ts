import { expect, Page, test } from "@playwright/test";

import { createMockMenuItem } from "./fixtures";

const ORDERING_MENU_PATH =
  process.env.E2E_ORDERING_MENU_PATH?.trim() ||
  process.env.E2E_DEFAULT_ORDERING_MENU_PATH?.trim() ||
  "/olive-bistro/menu/tbl_GkoFz28VwFqC";

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

    const payload = (() => {
      try {
        const parsed = request.postDataJSON() as Record<string, unknown>;
        return parsed ?? {};
      } catch {
        return {};
      }
    })() as { id?: string; available?: boolean };
    lastPatchPayload = payload;

    if (payload.id) {
      const currentItem = menuItems.find((item) => item.id === payload.id);

      if (!currentItem) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: "Item not found" })
        });
        return;
      }

      const nextAvailable =
        typeof payload.available === "boolean" ? payload.available : currentItem.available;
      const updatedItem = { ...currentItem, available: nextAvailable };
      menuItems = menuItems.map((item) =>
        item.id === payload.id ? updatedItem : item
      );

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updatedItem)
      });
      return;
    }

    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ message: "Bad request" })
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
  await expect(page.locator(".status-message")).toContainText(
    "Availability changed to Unavailable. Press Save to apply."
  );
  await expect
    .poll(() => lastPatchPayload)
    .toBeNull();

  await firstCard.getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".status-message")).toContainText("Saved:");
  await expect
    .poll(() => lastPatchPayload as { available?: boolean } | null)
    .toMatchObject({ available: false });
});

test("admin menu description draft keeps multiline text until Save", async ({ page }) => {
  const targetItemId = "menu-item-qa-he";
  const persistedDescription = "תיאור ישן";
  const draftDescription = "שורה ראשונה\nשורה שניה";
  let menuGetCalls = 0;
  let menuItems = [
    createMockMenuItem({
      id: targetItemId,
      name: "QA Hebrew Dish",
      nameHe: "QA Hebrew Dish",
      nameEn: "QA Hebrew Dish",
      nameRu: "QA Hebrew Dish",
      description: persistedDescription,
      descriptionHe: persistedDescription,
      descriptionEn: "old en",
      descriptionRu: "old ru",
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
      menuGetCalls += 1;
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

    const payload = (() => {
      try {
        const parsed = request.postDataJSON() as Record<string, unknown>;
        return parsed ?? {};
      } catch {
        return {};
      }
    })() as Record<string, unknown> & { id?: string };

    lastPatchPayload = payload;

    if (!payload.id) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "Bad request" })
      });
      return;
    }

    const currentItem = menuItems.find((item) => item.id === payload.id);

    if (!currentItem) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "Item not found" })
      });
      return;
    }

    const updatedItem = {
      ...currentItem,
      ...payload
    };
    menuItems = menuItems.map((item) =>
      item.id === payload.id ? updatedItem : item
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(updatedItem)
    });
  });

  await page.goto("/admin/menu");
  await page.getByRole("button", { name: /^Menu$/ }).click();
  await page.getByRole("button", { name: "Edit" }).click();

  const firstCard = page.locator("article.order-card").first();
  await expect(firstCard).toBeVisible();

  const descriptionTextarea = firstCard.locator(".menu-editor__textarea").first();
  const textareaVisibleBeforeToggle = await descriptionTextarea
    .isVisible()
    .catch(() => false);

  if (!textareaVisibleBeforeToggle) {
    await firstCard.getByRole("button", { name: "Show description" }).click();
  }

  await expect(descriptionTextarea).toBeVisible();
  await descriptionTextarea.fill(draftDescription);
  await expect(descriptionTextarea).toHaveValue(draftDescription);

  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect
    .poll(() => menuGetCalls)
    .toBeGreaterThan(1);

  await expect(descriptionTextarea).toHaveValue(draftDescription);
  await expect
    .poll(() => lastPatchPayload)
    .toBeNull();

  await firstCard.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(
      () =>
        lastPatchPayload as
          | {
              id?: string;
              descriptionHe?: string;
            }
          | null
    )
    .toMatchObject({ id: targetItemId, descriptionHe: draftDescription });
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
  const openUntilIso = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const menuPathname = new URL(ORDERING_MENU_PATH, "https://example.local").pathname;
  const menuPathMatch = /^\/([^/]+)\/menu\/([^/]+)/.exec(menuPathname);
  const restaurantSlug = menuPathMatch?.[1] ?? "olive-bistro";
  const tableToken = menuPathMatch?.[2] ?? "0";

  async function fetchGuestMenuIds() {
    return page.evaluate(async ({ slug, token }) => {
      const response = await fetch(`/api/tables/${slug}/${token}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        return [] as string[];
      }

      const payload = (await response.json()) as {
        menu?: Array<{ id?: string }>;
      };

      return Array.isArray(payload.menu)
        ? payload.menu
            .map((item) => (typeof item?.id === "string" ? item.id : ""))
            .filter(Boolean)
        : [];
    }, { slug: restaurantSlug, token: tableToken });
  }

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

  await page.route("**/api/menu-settings**", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kitchenOpenEnabled: true,
        kitchenOpenUntil: openUntilIso,
        barOpenEnabled: true,
        barOpenUntil: openUntilIso,
        happyHourEnabled: false
      })
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

    const payload = (() => {
      try {
        const parsed = request.postDataJSON() as Record<string, unknown>;
        return parsed ?? {};
      } catch {
        return {};
      }
    })() as {
      id?: string;
      available?: boolean;
    };
    lastPatchPayload = payload;

    if (payload.id) {
      const currentItem = menuItems.find((item) => item.id === payload.id);

      if (!currentItem) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: "Item not found" })
        });
        return;
      }

      const nextAvailable =
        typeof payload.available === "boolean" ? payload.available : currentItem.available;
      const updatedItem = { ...currentItem, available: nextAvailable };
      menuItems = menuItems.map((item) =>
        item.id === payload.id ? updatedItem : item
      );

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updatedItem)
      });
      return;
    }

    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ message: "Bad request" })
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
  await expect
    .poll(() => fetchGuestMenuIds())
    .toContain(targetItemId);

  await page.goto("/admin/menu");
  await page.getByRole("button", { name: /^Menu$/ }).click();
  await page.getByRole("button", { name: "Edit" }).click();

  const targetCard = page
    .locator("article.order-card")
    .filter({
      has: page.locator(`input[value="${targetDishName}"]`)
    })
    .first();
  const availabilityToggle = targetCard.locator(
    ".menu-editor__availability-toggle input[type='checkbox']"
  );
  await expect(targetCard).toBeVisible();
  await expect(targetCard.locator(".menu-editor__availability")).toHaveText("Available");
  await availabilityToggle.click();

  await expect
    .poll(() => lastPatchPayload)
    .toBeNull();

  await targetCard.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(() => lastPatchPayload as { id?: string; available?: boolean } | null)
    .toMatchObject({ id: targetItemId, available: false });

  await openMenuInEnglish(page, ORDERING_MENU_PATH);
  await expect
    .poll(() => fetchGuestMenuIds())
    .not.toContain(targetItemId);
  await page.getByRole("button", { name: /Dishes/i }).first().click();
  await expect(page.locator(".menu-card h3", { hasText: targetDishName })).toHaveCount(0);
});
