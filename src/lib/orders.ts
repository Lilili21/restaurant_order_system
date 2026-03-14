import { initialOrders } from "@/lib/mock-data";
import {
  CartItem,
  ClosedTableSummary,
  Order,
  OrderItem,
  OrderStatus,
  ServeMode,
  TableOverview
} from "@/lib/types";
import { getRestaurantBySlug, getRestaurants } from "@/lib/restaurants";
import { getMenuItemById } from "@/lib/menu-store";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type OrdersPersistence = {
  orders: Order[];
  currentTableSessions: Array<[string, number]>;
  closedTableSummaries: ClosedTableSummary[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_STORE_PATH = path.join(DATA_DIR, "orders-store.json");

function createTableKey(restaurantSlug: string, tableNumber: number) {
  return `${restaurantSlug}:${tableNumber}`;
}

function cloneInitialOrders() {
  return initialOrders.map((order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item }))
  }));
}

function normalizeOrderItemForAdmin(item: OrderItem): OrderItem {
  const menuItem = getMenuItemById(item.menuItemId);

  return {
    ...item,
    category: item.category ?? menuItem?.category,
    name: menuItem?.nameEn || item.name,
    price: menuItem?.price ?? item.price
  };
}

function normalizePersistedOrder(order: Order): Order {
  if (order.kind === "waiter_call") {
    return order;
  }

  const items = order.items.map(normalizeOrderItemForAdmin);

  return {
    ...order,
    items,
    total: items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  };
}

function createDefaultTableSessions() {
  const sessions = new Map<string, number>();

  for (const order of initialOrders) {
    const key = createTableKey(order.restaurantSlug, order.tableNumber);

    sessions.set(key, Math.max(sessions.get(key) ?? 1, order.sessionId));
  }

  return sessions;
}

function getDefaultState(): OrdersPersistence {
  return {
    orders: cloneInitialOrders(),
    currentTableSessions: [...createDefaultTableSessions().entries()],
    closedTableSummaries: []
  };
}

function loadState(): OrdersPersistence {
  if (!existsSync(ORDERS_STORE_PATH)) {
    return getDefaultState();
  }

  try {
    const raw = readFileSync(ORDERS_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<OrdersPersistence>;

    return {
      orders: Array.isArray(parsed.orders)
        ? parsed.orders.map((order) => normalizePersistedOrder(order as Order))
        : cloneInitialOrders(),
      currentTableSessions: Array.isArray(parsed.currentTableSessions)
        ? parsed.currentTableSessions
        : [...createDefaultTableSessions().entries()],
      closedTableSummaries: Array.isArray(parsed.closedTableSummaries)
        ? parsed.closedTableSummaries.map((summary) => ({
            ...summary,
            orders: Array.isArray(summary.orders)
              ? summary.orders.map((order) =>
                  normalizePersistedOrder(order as Order)
                )
              : []
          }))
        : []
    };
  } catch {
    return getDefaultState();
  }
}

type RuntimeState = {
  ordersStore: Order[];
  currentTableSessions: Map<string, number>;
  closedTableSummaries: ClosedTableSummary[];
};

function readRuntimeState(): RuntimeState {
  const persistedState = loadState();

  return {
    ordersStore: persistedState.orders,
    currentTableSessions: new Map<string, number>(
      persistedState.currentTableSessions
    ),
    closedTableSummaries: persistedState.closedTableSummaries
  };
}

function persistState(state: RuntimeState) {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(
    ORDERS_STORE_PATH,
    JSON.stringify(
      {
        orders: state.ordersStore,
        currentTableSessions: [...state.currentTableSessions.entries()],
        closedTableSummaries: state.closedTableSummaries
      } satisfies OrdersPersistence,
      null,
      2
    ),
    "utf8"
  );
}

function ensureCurrentSessionId(
  state: RuntimeState,
  restaurantSlug: string,
  tableNumber: number
) {
  const key = createTableKey(restaurantSlug, tableNumber);
  const existing = state.currentTableSessions.get(key);

  if (existing) {
    return { sessionId: existing, created: false };
  }

  state.currentTableSessions.set(key, 1);
  return { sessionId: 1, created: true };
}

export function getCurrentTableSessionId(
  restaurantSlug: string,
  tableNumber: number
) {
  const state = readRuntimeState();
  const { sessionId, created } = ensureCurrentSessionId(
    state,
    restaurantSlug,
    tableNumber
  );

  if (created) {
    persistState(state);
  }

  return sessionId;
}

if (!existsSync(ORDERS_STORE_PATH)) {
  persistState(readRuntimeState());
}

function createOrderItem(cartItem: CartItem): OrderItem {
  const menuItem = getMenuItemById(cartItem.menuItemId);

  if (!menuItem) {
    throw new Error(`Menu item ${cartItem.menuItemId} not found`);
  }

  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    menuItemId: menuItem.id,
    category: menuItem.category,
    name: menuItem.nameEn || menuItem.name,
    price: menuItem.price,
    quantity: cartItem.quantity,
    note: cartItem.note?.trim() || undefined,
    served: false
  };
}

function mergeOrderItems(order: Order, nextItems: OrderItem[]) {
  const mergedItems = [...order.items];
  const now = new Date().toISOString();

  for (const nextItem of nextItems) {
    const existingItem = mergedItems.find(
      (item) =>
        item.menuItemId === nextItem.menuItemId &&
        (item.note ?? "") === (nextItem.note ?? "") &&
        !item.served
    );

    if (existingItem) {
      existingItem.quantity += nextItem.quantity;
      continue;
    }

    mergedItems.push(nextItem);
  }

  order.items = mergedItems;
  order.updatedAt = now;
  return normalizeOrderState(order);
}

function normalizeOrderState(order: Order) {
  order.items = order.items.map(normalizeOrderItemForAdmin);

  if (order.kind === "waiter_call") {
    order.total = 0;
    return order;
  }

  order.total = order.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  if (order.items.length === 0) {
    order.status = "cancelled";
    return order;
  }

  const allItemsServed = order.items.every((item) => item.served);
  const someItemsServed = order.items.some((item) => item.served);

  if (allItemsServed) {
    order.status = "served";
  } else if (someItemsServed || order.status === "preparing") {
    order.status = "preparing";
  } else if (order.status !== "cancelled") {
    order.status = "new";
  }

  return order;
}

export function getOrders(restaurantSlug?: string) {
  const { ordersStore } = readRuntimeState();

  return ordersStore
    .filter((order) => {
      if (restaurantSlug && order.restaurantSlug !== restaurantSlug) {
        return false;
      }

      return order.status !== "served" && order.status !== "cancelled";
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function createWaiterCall(input: {
  restaurantSlug: string;
  tableNumber: number;
}) {
  const state = readRuntimeState();
  const restaurant = getRestaurantBySlug(input.restaurantSlug);

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  const tableExists = restaurant.tables.some(
    (table) => table.number === input.tableNumber
  );

  if (!tableExists) {
    throw new Error("Table not found");
  }

  const { sessionId } = ensureCurrentSessionId(
    state,
    input.restaurantSlug,
    input.tableNumber
  );

  const waiterCall: Order = {
    id: `call_${Date.now()}`,
    restaurantSlug: restaurant.slug,
    restaurantName: restaurant.name,
    tableNumber: input.tableNumber,
    sessionId,
    kind: "waiter_call",
    status: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [],
    total: 0
  };

  state.ordersStore.unshift(waiterCall);
  persistState(state);

  return waiterCall;
}

export function getTableSessionOrders(
  restaurantSlug: string,
  tableNumber: number
) {
  const state = readRuntimeState();
  const { sessionId, created } = ensureCurrentSessionId(
    state,
    restaurantSlug,
    tableNumber
  );

  if (created) {
    persistState(state);
  }

  return state.ordersStore
    .filter(
      (order) =>
        order.restaurantSlug === restaurantSlug &&
        order.tableNumber === tableNumber &&
        order.sessionId === sessionId &&
        order.status !== "cancelled" &&
        order.kind !== "waiter_call"
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function createOrder(input: {
  restaurantSlug: string;
  tableNumber: number;
  items: CartItem[];
  serveMode?: ServeMode;
}) {
  const state = readRuntimeState();
  const restaurant = getRestaurantBySlug(input.restaurantSlug);

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  const tableExists = restaurant.tables.some(
    (table) => table.number === input.tableNumber
  );

  if (!tableExists) {
    throw new Error("Table not found");
  }

  if (!input.items.length) {
    throw new Error("Order must contain at least one item");
  }

  const items = input.items.map(createOrderItem);
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const { sessionId } = ensureCurrentSessionId(
    state,
    input.restaurantSlug,
    input.tableNumber
  );
  const existingNewOrder = state.ordersStore.find(
    (order) =>
      order.restaurantSlug === restaurant.slug &&
      order.tableNumber === input.tableNumber &&
      order.sessionId === sessionId &&
      order.kind !== "waiter_call" &&
      order.status === "new"
  );

  if (existingNewOrder) {
    const mergedOrder = mergeOrderItems(existingNewOrder, items);

    if (input.serveMode) {
      mergedOrder.serveMode = input.serveMode;
    }

    persistState(state);
    return mergedOrder;
  }

  const order: Order = {
    id: `ord_${Date.now()}`,
    restaurantSlug: restaurant.slug,
    restaurantName: restaurant.name,
    tableNumber: input.tableNumber,
    sessionId,
    status: "new",
    serveMode: input.serveMode ?? "all_at_once",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items,
    total
  };

  state.ordersStore.unshift(order);
  persistState(state);

  return order;
}

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  const state = readRuntimeState();
  const order = state.ordersStore.find((item) => item.id === orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  order.status = status;

  if (status === "served") {
    order.items = order.items.map((item) => ({
      ...item,
      served: true
    }));
  }

  if (status === "cancelled") {
    order.items = order.items.map((item) => ({
      ...item,
      served: false
    }));
  }

  const normalizedOrder = normalizeOrderState(order);
  persistState(state);

  return normalizedOrder;
}

export function updateOrderItemServed(
  orderId: string,
  orderItemId: string,
  served: boolean
) {
  const state = readRuntimeState();
  const order = state.ordersStore.find((item) => item.id === orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.status === "cancelled") {
    throw new Error("Cancelled order cannot be updated");
  }

  const orderItem = order.items.find((item) => item.id === orderItemId);

  if (!orderItem) {
    throw new Error("Order item not found");
  }

  orderItem.served = served;
  const normalizedOrder = normalizeOrderState(order);
  persistState(state);

  return normalizedOrder;
}

export function removeOrderItem(
  orderId: string,
  orderItemId: string,
  removeQuantity: number
) {
  const state = readRuntimeState();
  const order = state.ordersStore.find((item) => item.id === orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.status === "served" || order.status === "cancelled") {
    throw new Error("Closed order cannot be edited");
  }

  const orderItem = order.items.find((item) => item.id === orderItemId);

  if (!orderItem) {
    throw new Error("Order item not found");
  }

  if (removeQuantity <= 0) {
    throw new Error("removeQuantity must be greater than 0");
  }

  order.items = order.items
    .map((item) =>
      item.id === orderItemId
        ? {
            ...item,
            quantity: item.quantity - removeQuantity
          }
        : item
    )
    .filter((item) => item.quantity > 0);

  const normalizedOrder = normalizeOrderState(order);
  persistState(state);

  return normalizedOrder;
}

export function changeOrderItemQuantity(
  orderId: string,
  orderItemId: string,
  delta: number
) {
  const state = readRuntimeState();
  const order = state.ordersStore.find((item) => item.id === orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.status === "served" || order.status === "cancelled") {
    throw new Error("Closed order cannot be edited");
  }

  const orderItem = order.items.find((item) => item.id === orderItemId);

  if (!orderItem) {
    throw new Error("Order item not found");
  }

  order.items = order.items
    .map((item) =>
      item.id === orderItemId
        ? {
            ...item,
            quantity: item.quantity + delta
          }
        : item
    )
    .filter((item) => item.quantity > 0);

  const normalizedOrder = normalizeOrderState(order);
  persistState(state);

  return normalizedOrder;
}

export function getTableOverviews(restaurantSlug?: string): TableOverview[] {
  const state = readRuntimeState();
  let shouldPersist = false;

  const overviews = getRestaurants()
    .filter((restaurant) =>
      restaurantSlug ? restaurant.slug === restaurantSlug : true
    )
    .flatMap((restaurant) =>
      restaurant.tables.map((table) => {
        const { sessionId: currentSessionId, created } = ensureCurrentSessionId(
          state,
          restaurant.slug,
          table.number
        );

        if (created) {
          shouldPersist = true;
        }

        const sessionOrders = state.ordersStore
          .filter(
            (order) =>
              order.restaurantSlug === restaurant.slug &&
              order.tableNumber === table.number &&
              order.sessionId === currentSessionId
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const visibleOrders = sessionOrders.filter(
          (order) =>
            order.status !== "cancelled" && order.kind !== "waiter_call"
        );

        return {
          restaurantSlug: restaurant.slug,
          restaurantName: restaurant.name,
          tableNumber: table.number,
          currentSessionId,
          orderCount: visibleOrders.length,
          total: visibleOrders.reduce((sum, order) => sum + order.total, 0),
          statuses: [...new Set(visibleOrders.map((order) => order.status))],
          orders: visibleOrders
        };
      })
    )
    .filter((table) => table.orders.length > 0)
    .sort((left, right) => left.tableNumber - right.tableNumber);

  if (shouldPersist) {
    persistState(state);
  }

  return overviews;
}

export function closeTable(restaurantSlug: string, tableNumber: number) {
  const state = readRuntimeState();
  const restaurant = getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  const tableExists = restaurant.tables.some(
    (table) => table.number === tableNumber
  );

  if (!tableExists) {
    throw new Error("Table not found");
  }

  const { sessionId } = ensureCurrentSessionId(state, restaurantSlug, tableNumber);
  const orders = state.ordersStore.filter(
    (order) =>
      order.restaurantSlug === restaurantSlug &&
      order.tableNumber === tableNumber &&
      order.sessionId === sessionId
  );

  const unservedOrders = orders.filter(
    (order) => order.status !== "served" && order.status !== "cancelled"
  );

  if (unservedOrders.length > 0) {
    throw new Error(
      "You cannot close the table until all orders are marked as served."
    );
  }

  const summary: ClosedTableSummary = {
    restaurantSlug,
    restaurantName: restaurant.name,
    tableNumber,
    sessionId,
    closedAt: new Date().toISOString(),
    total: orders.reduce((sum, order) => sum + order.total, 0),
    orderCount: orders.length,
    orderIds: orders.map((order) => order.id),
    orders: orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({ ...item }))
    }))
  };

  state.closedTableSummaries.unshift(summary);
  state.currentTableSessions.set(
    createTableKey(restaurantSlug, tableNumber),
    sessionId + 1
  );
  persistState(state);

  return summary;
}

export function moveTableOrders(
  restaurantSlug: string,
  fromTableNumber: number,
  toTableNumber: number
) {
  const state = readRuntimeState();
  const restaurant = getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  if (fromTableNumber === toTableNumber) {
    throw new Error("Choose a different table.");
  }

  const fromTableExists = restaurant.tables.some(
    (table) => table.number === fromTableNumber
  );
  const toTableExists = restaurant.tables.some(
    (table) => table.number === toTableNumber
  );

  if (!fromTableExists || !toTableExists) {
    throw new Error("Table not found.");
  }

  const { sessionId: fromSessionId } = ensureCurrentSessionId(
    state,
    restaurantSlug,
    fromTableNumber
  );
  const { sessionId: toSessionId } = ensureCurrentSessionId(
    state,
    restaurantSlug,
    toTableNumber
  );

  const movableOrders = state.ordersStore.filter(
    (order) =>
      order.restaurantSlug === restaurantSlug &&
      order.tableNumber === fromTableNumber &&
      order.sessionId === fromSessionId &&
      order.kind !== "waiter_call" &&
      order.status !== "cancelled"
  );

  if (!movableOrders.length) {
    throw new Error("There are no active orders on this table to move.");
  }

  state.ordersStore = state.ordersStore.map((order) =>
    movableOrders.some((item) => item.id === order.id)
      ? {
          ...order,
          tableNumber: toTableNumber,
          sessionId: toSessionId
        }
      : order
  );

  persistState(state);

  return {
    restaurantSlug,
    fromTableNumber,
    toTableNumber,
    movedOrders: movableOrders.length
  };
}

export function getClosedTableSummaries(restaurantSlug?: string) {
  const { closedTableSummaries } = readRuntimeState();

  return closedTableSummaries.filter((summary) =>
    restaurantSlug ? summary.restaurantSlug === restaurantSlug : true
  );
}
