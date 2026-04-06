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

  it("merges quick identical payload submissions into one order", async () => {
    const { createOrder, getTableSessionOrders } = await import("@/lib/orders");

    const first = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 1,
      items: [{ menuItemId: "m1", quantity: 1 }],
      serveMode: "as_ready"
    });
    const merged = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 1,
      items: [{ menuItemId: "m1", quantity: 1 }],
      serveMode: "as_ready"
    });

    const orders = await getTableSessionOrders("olive-bistro", 1);

    expect(merged.id).toBe(first.id);
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toHaveLength(1);
    expect(orders[0].items[0].quantity).toBe(2);
  });

  it("applies active promotion discount to order item price and total", async () => {
    writeJson(workspace, "data/menu-settings.json", {
      promotions: [
        {
          id: "promo-starters-20",
          enabled: true,
          text: "Starters promo",
          categories: ["starters"],
          days: [],
          discountPercent: 20,
          startsFrom: null,
          until: null
        }
      ],
      businessLunches: []
    });

    const { createOrder } = await import("@/lib/orders");
    const order = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 1,
      items: [{ menuItemId: "m1", quantity: 2 }]
    });

    expect(order.items).toHaveLength(1);
    expect(order.items[0].price).toBe(19.2);
    expect(order.total).toBe(38.4);
  });

  it("uses the maximum active promotion for category and keeps 2-decimal rounding", async () => {
    writeJson(workspace, "data/menu-settings.json", {
      promotions: [
        {
          id: "promo-starters-10",
          enabled: true,
          text: "Low promo",
          categories: ["starters"],
          days: [],
          discountPercent: 10,
          startsFrom: null,
          until: null
        },
        {
          id: "promo-starters-33",
          enabled: true,
          text: "High promo",
          categories: ["starters"],
          days: [],
          discountPercent: 33,
          startsFrom: null,
          until: null
        }
      ],
      businessLunches: []
    });

    const { createOrder } = await import("@/lib/orders");
    const order = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 1,
      items: [{ menuItemId: "m1", quantity: 1 }]
    });

    expect(order.items).toHaveLength(1);
    expect(order.items[0].price).toBe(16.08);
    expect(order.total).toBe(16.08);
  });

  it("does not change price when only business lunch is active (without promotions)", async () => {
    writeJson(workspace, "data/menu-settings.json", {
      promotions: [],
      businessLunches: [
        {
          id: "bl-starters",
          enabled: true,
          text: "Business lunch",
          categories: ["starters"],
          days: [],
          startsFrom: null,
          until: null
        }
      ]
    });

    const { createOrder } = await import("@/lib/orders");
    const order = await createOrder({
      restaurantSlug: "olive-bistro",
      tableNumber: 1,
      items: [{ menuItemId: "m1", quantity: 1 }]
    });

    expect(order.items).toHaveLength(1);
    expect(order.items[0].price).toBe(24);
    expect(order.total).toBe(24);
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

  it("recalculates active table totals from order items when stored order total is stale", async () => {
    writeJson(workspace, "data/orders-store.json", {
      orders: [
        {
          id: "stale-total-order",
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 4,
          sessionId: 1,
          status: "served",
          createdAt: new Date().toISOString(),
          items: [
            {
              id: "item-1",
              menuItemId: "m2",
              name: "Wrong total salad",
              category: "salads",
              price: 32,
              quantity: 2,
              served: true
            }
          ],
          total: 164
        }
      ],
      currentTableSessions: [["olive-bistro:4", 1]],
      closedTableSummaries: []
    });

    const { getTableOverviews } = await import("@/lib/orders");
    const tables = await getTableOverviews("olive-bistro");
    const table = tables.find((entry) => entry.tableNumber === 4);

    expect(table).toBeTruthy();
    expect(table?.total).toBe(64);
    expect(table?.orders).toHaveLength(1);
    expect(table?.orders[0].total).toBe(64);
  });

  it("does not show active table cards for orders without items", async () => {
    writeJson(workspace, "data/orders-store.json", {
      orders: [
        {
          id: "empty-order",
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 4,
          sessionId: 1,
          status: "served",
          createdAt: new Date().toISOString(),
          items: [],
          total: 164
        }
      ],
      currentTableSessions: [["olive-bistro:4", 1]],
      closedTableSummaries: []
    });

    const { getTableOverviews } = await import("@/lib/orders");
    const tables = await getTableOverviews("olive-bistro");

    expect(tables.find((table) => table.tableNumber === 4)).toBeUndefined();
  });

  it("keeps two consecutive closed sessions for the same table in current shift scope", async () => {
    const now = new Date();
    const firstClosedAt = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
    const secondClosedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    writeJson(workspace, "data/orders-store.json", {
      orders: [],
      currentTableSessions: [["olive-bistro:4", 3]],
      closedTableSummaries: [
        {
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 4,
          sessionId: 1,
          closedAt: firstClosedAt,
          total: 61,
          orderCount: 1,
          orderIds: ["order-s1"],
          orders: []
        },
        {
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 4,
          sessionId: 2,
          closedAt: secondClosedAt,
          total: 96,
          orderCount: 1,
          orderIds: ["order-s2"],
          orders: []
        }
      ]
    });

    const { getClosedTableSummaries } = await import("@/lib/orders");
    const summaries = await getClosedTableSummaries("olive-bistro", {
      scope: "current_shift"
    });

    const table4 = summaries.filter((summary) => summary.tableNumber === 4);
    expect(table4).toHaveLength(2);
    expect(table4.map((summary) => summary.sessionId).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("keeps just-ended shift and current shift closed sessions visible during grace overlap", async () => {
    vi.useFakeTimers();
    try {
      const now = new Date(2026, 0, 10, 3, 30, 0, 0);
      vi.setSystemTime(now);

      writeJson(workspace, "data/menu-settings.json", {
        workingHoursFrom: "03:00",
        workingHoursUntil: "03:00",
        workingHoursRules: []
      });

      writeJson(workspace, "data/orders-store.json", {
        orders: [],
        currentTableSessions: [["olive-bistro:4", 3]],
        closedTableSummaries: [
          {
            restaurantSlug: "olive-bistro",
            restaurantName: "Olive Bistro",
            tableNumber: 4,
            sessionId: 1,
            closedAt: new Date(2026, 0, 10, 2, 55, 0, 0).toISOString(),
            total: 61,
            orderCount: 1,
            orderIds: ["order-prev"],
            orders: []
          },
          {
            restaurantSlug: "olive-bistro",
            restaurantName: "Olive Bistro",
            tableNumber: 4,
            sessionId: 2,
            closedAt: new Date(2026, 0, 10, 3, 10, 0, 0).toISOString(),
            total: 96,
            orderCount: 1,
            orderIds: ["order-current"],
            orders: []
          }
        ]
      });

      const { getClosedTableSummaries } = await import("@/lib/orders");
      const summaries = await getClosedTableSummaries("olive-bistro", {
        scope: "current_shift"
      });

      const table4 = summaries.filter((summary) => summary.tableNumber === 4);
      expect(table4).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closeTable avoids overwriting when session id collides with existing closed summary", async () => {
    const nowIso = new Date().toISOString();

    writeJson(workspace, "data/orders-store.json", {
      orders: [
        {
          id: "order-collision",
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 4,
          sessionId: 1,
          status: "served",
          createdAt: nowIso,
          items: [
            {
              id: "item-collision",
              menuItemId: "m1",
              name: "Test item",
              category: "starters",
              price: 24,
              quantity: 1,
              served: true
            }
          ],
          total: 24
        }
      ],
      currentTableSessions: [["olive-bistro:4", 1]],
      closedTableSummaries: [
        {
          restaurantSlug: "olive-bistro",
          restaurantName: "Olive Bistro",
          tableNumber: 4,
          sessionId: 1,
          closedAt: new Date(Date.now() - 60_000).toISOString(),
          total: 61,
          orderCount: 1,
          orderIds: ["already-closed-order"],
          orders: []
        }
      ]
    });

    const { closeTable, getClosedTableSummaries } = await import("@/lib/orders");
    const summary = await closeTable("olive-bistro", 4);
    const allClosed = await getClosedTableSummaries("olive-bistro");
    const table4 = allClosed
      .filter((entry) => entry.tableNumber === 4)
      .sort((left, right) => left.sessionId - right.sessionId);

    expect(summary.sessionId).toBe(2);
    expect(table4).toHaveLength(2);
    expect(table4.map((entry) => entry.sessionId)).toEqual([1, 2]);
  });
});
