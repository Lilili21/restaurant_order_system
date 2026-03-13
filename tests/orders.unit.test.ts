import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkspace, restoreWorkspace, useWorkspace } from "./helpers/test-env";

describe("orders", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = createWorkspace("orders");
    useWorkspace(workspace);
    vi.resetModules();
  });

  afterEach(() => {
    restoreWorkspace();
    vi.resetModules();
  });

  it("merges repeated new orders into the same table session order", async () => {
    const { createOrder, getTableSessionOrders } = await import("@/lib/orders");

    const first = createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 1,
      items: [{ menuItemId: "m1", quantity: 1 }],
      serveMode: "all_at_once"
    });
    const merged = createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 1,
      items: [{ menuItemId: "m1", quantity: 2 }],
      serveMode: "as_ready"
    });

    const orders = getTableSessionOrders("olive-bistro", 1);

    expect(merged.id).toBe(first.id);
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toHaveLength(1);
    expect(orders[0].items[0].quantity).toBe(3);
    expect(orders[0].serveMode).toBe("as_ready");
    expect(orders[0].updatedAt).toBeTruthy();
  });

  it("updates item served state and transitions order status", async () => {
    const { createOrder, updateOrderItemServed } = await import("@/lib/orders");

    const order = createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 2,
      items: [
        { menuItemId: "m1", quantity: 1 },
        { menuItemId: "m3", quantity: 1 }
      ]
    });

    const preparing = updateOrderItemServed(order.id, order.items[0].id, true);
    const served = updateOrderItemServed(order.id, order.items[1].id, true);

    expect(preparing.status).toBe("preparing");
    expect(served.status).toBe("served");
    expect(served.items.every((item) => item.served)).toBe(true);
  });

  it("prevents closing a table until all orders are served and increments session afterwards", async () => {
    const { closeTable, createOrder, getCurrentTableSessionId, updateOrderStatus } =
      await import("@/lib/orders");

    const order = createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 3,
      items: [{ menuItemId: "m4", quantity: 1 }]
    });

    expect(() => closeTable("olive-bistro", 3)).toThrow(
      "Нельзя закрыть столик, пока не все заказы имеют статус 'Подан'"
    );

    updateOrderStatus(order.id, "served");
    const summary = closeTable("olive-bistro", 3);

    expect(summary.tableNumber).toBe(3);
    expect(summary.orderIds).toContain(order.id);
    expect(getCurrentTableSessionId("olive-bistro", 3)).toBe(order.sessionId + 1);
  });

  it("moves active orders to a target table current session", async () => {
    const { createOrder, getTableOverviews, moveTableOrders } = await import("@/lib/orders");

    const order = createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 4,
      items: [{ menuItemId: "m5", quantity: 2 }]
    });

    const result = moveTableOrders("olive-bistro", 4, 5);
    const tables = getTableOverviews("olive-bistro");
    const target = tables.find((table) => table.tableNumber === 5);

    expect(result.movedOrders).toBe(1);
    expect(target?.orders.some((item) => item.id === order.id)).toBe(true);
    expect(tables.find((table) => table.tableNumber === 4)).toBeUndefined();
  });
});
