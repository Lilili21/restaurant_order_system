import { expect, test } from "@playwright/test";

import { createMockMenuItem } from "./fixtures";

test("admin menu availability toggle updates item state", async ({ page }) => {
  let menuItems = [
    createMockMenuItem({ id: "menu-item-qa-1", name: "QA Dish 1", available: true }),
    createMockMenuItem({ id: "menu-item-qa-2", name: "QA Dish 2", available: false })
  ];
  let lastPatchPayload: unknown = null;

  await page.route("**/api/admin-auth?scope=secondary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authorized: true })
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
      menuItems = menuItems.map((item) =>
        item.id === payload.id ? { ...item, available: payload.available } : item
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

  const firstCard = page.locator(".order-card").filter({ hasText: "QA Dish 1" }).first();
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
