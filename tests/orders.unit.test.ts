import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createWorkspace,
  restoreWorkspace,
  useWorkspace,
  writeJson
} from "./helpers/test-env";

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

    const first = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 1,
      items: [{ menuItemId: "m1", quantity: 1 }],
      serveMode: "all_at_once"
    });
    const merged = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 1,
      items: [{ menuItemId: "m1", quantity: 2 }],
      serveMode: "as_ready"
    });

    const orders = await getTableSessionOrders("olive-bistro", 1);

    expect(merged.id).toBe(first.id);
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toHaveLength(1);
    expect(orders[0].items[0].quantity).toBe(3);
    expect(orders[0].serveMode).toBe("as_ready");
    expect(orders[0].updatedAt).toBeTruthy();
  });

  it("updates item served state and transitions order status", async () => {
    const { createOrder, updateOrderItemServed } = await import("@/lib/orders");

    const order = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 2,
      items: [
        { menuItemId: "m1", quantity: 1 },
        { menuItemId: "m3", quantity: 1 }
      ]
    });

    const preparing = await updateOrderItemServed(order.id, order.items[0].id, true);
    const served = await updateOrderItemServed(order.id, order.items[1].id, true);

    expect(preparing.status).toBe("preparing");
    expect(served.status).toBe("served");
    expect(served.items.every((item) => item.served)).toBe(true);
  });

  it("prevents closing a table until all orders are served and increments session afterwards", async () => {
    const { closeTable, createOrder, getCurrentTableSessionId, updateOrderStatus } =
      await import("@/lib/orders");

    const order = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 3,
      items: [{ menuItemId: "m4", quantity: 1 }]
    });

    await expect(closeTable("olive-bistro", 3)).rejects.toThrow(
      "Check that all the orders are served and change status in Orders."
    );

    await updateOrderStatus(order.id, "served");
    const summary = await closeTable("olive-bistro", 3);

    expect(summary.tableNumber).toBe(3);
    expect(summary.orderIds).toContain(order.id);
    await expect(getCurrentTableSessionId("olive-bistro", 3)).resolves.toBe(
      order.sessionId + 1
    );
  });

  it("moves active orders to a target table current session", async () => {
    const { createOrder, getTableOverviews, moveTableOrders } = await import("@/lib/orders");

    const order = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 4,
      items: [{ menuItemId: "m5", quantity: 2 }]
    });

    const result = await moveTableOrders("olive-bistro", 4, 5);
    const tables = await getTableOverviews("olive-bistro");
    const target = tables.find((table) => table.tableNumber === 5);

    expect(result.movedOrders).toBe(1);
    expect(target?.orders.some((item) => item.id === order.id)).toBe(true);
    expect(tables.find((table) => table.tableNumber === 4)).toBeUndefined();
  });

  it("deduplicates closed table summaries for the same table session", async () => {
    const duplicateSessionSummaries = [
      {
        restaurantSlug: "olive-bistro",
        restaurantName: "Olive Bistro",
        tableNumber: 7,
        sessionId: 701,
        closedAt: "2026-04-04T21:04:38.123Z",
        total: 96,
        orderCount: 1,
        orderIds: ["order-701"],
        orders: []
      },
      {
        restaurantSlug: "olive-bistro",
        restaurantName: "Olive Bistro",
        tableNumber: 7,
        sessionId: 701,
        closedAt: "2026-04-04T21:04:38.123+00:00",
        total: 96,
        orderCount: 1,
        orderIds: ["order-701"],
        orders: []
      }
    ];

    writeJson(workspace, "data/orders-store.json", {
      orders: [],
      currentTableSessions: [["olive-bistro:7", 702]],
      closedTableSummaries: duplicateSessionSummaries
    });

    const { getClosedTableSummaries } = await import("@/lib/orders");
    const summaries = await getClosedTableSummaries("olive-bistro");

    expect(summaries).toHaveLength(1);
    expect(summaries[0].tableNumber).toBe(7);
    expect(summaries[0].sessionId).toBe(701);

    const persisted = JSON.parse(
      readFileSync(path.join(workspace, "data/orders-store.json"), "utf8")
    ) as {
      closedTableSummaries: unknown[];
    };

    expect(Array.isArray(persisted.closedTableSummaries)).toBe(true);
    expect(persisted.closedTableSummaries).toHaveLength(1);
  });

  it("closeTable recovers when a closed summary exists but table session still hangs in active list", async () => {
    const {
      closeTable,
      createOrder,
      getClosedTableSummaries,
      getCurrentTableSessionId,
      getTableOverviews,
      updateOrderStatus
    } = await import("@/lib/orders");

    const created = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 6,
      items: [{ menuItemId: "m1", quantity: 1 }]
    });
    const served = await updateOrderStatus(created.id, "served");
    const firstClose = await closeTable("olive-bistro", 6);

    writeJson(workspace, "data/orders-store.json", {
      orders: [served],
      currentTableSessions: [["olive-bistro:6", served.sessionId]],
      closedTableSummaries: [firstClose]
    });

    const secondClose = await closeTable("olive-bistro", 6);
    const tables = await getTableOverviews("olive-bistro");
    const closed = await getClosedTableSummaries("olive-bistro");
    const nextSessionId = await getCurrentTableSessionId("olive-bistro", 6);

    expect(secondClose.sessionId).toBe(served.sessionId);
    expect(tables.find((table) => table.tableNumber === 6)).toBeUndefined();
    expect(closed.filter((summary) => summary.tableNumber === 6)).toHaveLength(1);
    expect(nextSessionId).toBe(served.sessionId + 1);
  });
});
