import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkspace, restoreWorkspace, useWorkspace } from "./helpers/test-env";

const ADMIN_COOKIE = "admin_access=true";
const SECONDARY_HEADERS = {
  "x-admin-secondary-login": "admin",
  "x-admin-secondary-password": "admin"
};

describe("API routes", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = createWorkspace("api");
    useWorkspace(workspace);
    vi.resetModules();
  });

  afterEach(() => {
    restoreWorkspace();
    vi.resetModules();
  });

  it("auth route validates credentials and sets admin cookie", async () => {
    const { POST, DELETE } = await import("@/app/api/admin-auth/route");

    const unauthorized = await POST(
      new NextRequest("http://localhost/api/admin-auth", {
        method: "POST",
        body: JSON.stringify({
          scope: "admin",
          login: "wrong",
          password: "wrong",
          persist: true
        })
      })
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await POST(
      new NextRequest("http://localhost/api/admin-auth", {
        method: "POST",
        body: JSON.stringify({
          scope: "admin",
          login: "admin1",
          password: "admin1",
          persist: true
        })
      })
    );
    expect(authorized.status).toBe(200);
    expect(authorized.cookies.get("admin_access")?.value).toBe("true");

    const cleared = await DELETE(
      new NextRequest("http://localhost/api/admin-auth?scope=admin", {
        method: "DELETE"
      })
    );
    expect(cleared.cookies.get("admin_access")?.maxAge).toBe(0);
  });

  it("orders route supports guest creation and admin-only reads/updates", async () => {
    const ordersRoute = await import("@/app/api/orders/route");

    const createdResponse = await ordersRoute.POST(
      new NextRequest("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          restaurantSlug: "olive-bistro",
          tableNumber: 1,
          items: [{ menuItemId: "m1", quantity: 1 }]
        })
      })
    );
    expect(createdResponse.status).toBe(201);
    const createdOrder = await createdResponse.json();

    const deniedRead = await ordersRoute.GET(
      new NextRequest("http://localhost/api/orders")
    );
    expect(deniedRead.status).toBe(401);

    const allowedRead = await ordersRoute.GET(
      new NextRequest("http://localhost/api/orders", {
        headers: { cookie: ADMIN_COOKIE }
      })
    );
    expect(allowedRead.status).toBe(200);
    const listedOrders = (await allowedRead.json()) as Array<{ id: string }>;
    expect(listedOrders.some((order) => order.id === createdOrder.id)).toBe(true);

    const updated = await ordersRoute.PATCH(
      new NextRequest("http://localhost/api/orders", {
        method: "PATCH",
        headers: { cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          orderId: createdOrder.id,
          status: "served"
        })
      })
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).status).toBe("served");
  });

  it("tables route enforces admin access and closes served sessions", async () => {
    const ordersRoute = await import("@/app/api/orders/route");
    const tablesRoute = await import("@/app/api/tables/route");

    const createdResponse = await ordersRoute.POST(
      new NextRequest("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          restaurantSlug: "olive-bistro",
          tableNumber: 2,
          items: [{ menuItemId: "m4", quantity: 1 }]
        })
      })
    );
    const order = await createdResponse.json();

    const denied = await tablesRoute.GET(new NextRequest("http://localhost/api/tables"));
    expect(denied.status).toBe(401);

    const blockedClose = await tablesRoute.PATCH(
      new NextRequest("http://localhost/api/tables", {
        method: "PATCH",
        headers: { cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          action: "close",
          restaurantSlug: "olive-bistro",
          tableNumber: 2
        })
      })
    );
    expect(blockedClose.status).toBe(400);

    await ordersRoute.PATCH(
      new NextRequest("http://localhost/api/orders", {
        method: "PATCH",
        headers: { cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          orderId: order.id,
          status: "served"
        })
      })
    );

    const closed = await tablesRoute.PATCH(
      new NextRequest("http://localhost/api/tables", {
        method: "PATCH",
        headers: { cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          action: "close",
          restaurantSlug: "olive-bistro",
          tableNumber: 2
        })
      })
    );
    expect(closed.status).toBe(200);
    expect((await closed.json()).tableNumber).toBe(2);
  });

  it("menu and menu-settings routes require secondary credentials", async () => {
    const menuRoute = await import("@/app/api/menu/route");
    const menuSettingsRoute = await import("@/app/api/menu-settings/route");

    const deniedMenu = await menuRoute.GET(
      new NextRequest("http://localhost/api/menu")
    );
    expect(deniedMenu.status).toBe(401);

    const createdMenuItem = await menuRoute.POST(
      new NextRequest("http://localhost/api/menu", {
        method: "POST",
        headers: SECONDARY_HEADERS,
        body: JSON.stringify({
          restaurantSlug: "olive-bistro",
          name: "Test tea",
          nameHe: "תה בדיקה",
          nameEn: "Test tea",
          description: "desc",
          descriptionHe: "תיאור",
          descriptionEn: "desc",
          category: "drinks",
          price: 18,
          available: true,
          showImage: false
        })
      })
    );
    expect(createdMenuItem.status).toBe(201);
    expect((await createdMenuItem.json()).showImage).toBe(false);

    const settingsDenied = await menuSettingsRoute.PATCH(
      new NextRequest("http://localhost/api/menu-settings", {
        method: "PATCH",
        body: JSON.stringify({ tableCount: 15 })
      })
    );
    expect(settingsDenied.status).toBe(401);

    const settingsUpdated = await menuSettingsRoute.PATCH(
      new NextRequest("http://localhost/api/menu-settings", {
        method: "PATCH",
        headers: SECONDARY_HEADERS,
        body: JSON.stringify({ tableCount: 15, kitchenLoadWarningEnabled: true })
      })
    );
    const settings = await settingsUpdated.json();

    expect(settingsUpdated.status).toBe(200);
    expect(settings.tableCount).toBe(15);
    expect(settings.kitchenLoadWarningEnabled).toBe(true);
  });
});
