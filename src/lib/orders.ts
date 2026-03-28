import { initialOrders } from "@/lib/mock-data";
import { getMenuSettings, PromotionSettings } from "@/lib/menu-settings";
import {
  CartItem,
  ClosedTableSummary,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  ServeMode,
  TableOverview
} from "@/lib/types";
import { getRestaurantBySlug, getRestaurants } from "@/lib/restaurants";
import { getAllMenuItems, getMenuItemById } from "@/lib/menu-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type OrdersPersistence = {
  orders: Order[];
  currentTableSessions: Array<[string, number]>;
  closedTableSummaries: ClosedTableSummary[];
};

type OrdersMetaPersistence = {
  currentTableSessions: Array<[string, number]>;
  closedTableSummaries: ClosedTableSummary[];
};

type OrderRow = {
  order_id: string;
  restaurant_slug: string;
  restaurant_name: string;
  table_number: number;
  session_id: number;
  kind: "order" | "waiter_call" | "bill_request";
  serve_mode: ServeMode | null;
  status: OrderStatus;
  created_at: string;
  updated_at: string | null;
  total: number;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  menu_item_id: string;
  category: string | null;
  name: string;
  volume_option_id: string | null;
  volume_label: string | null;
  price: number;
  quantity: number;
  note: string | null;
  served: boolean;
};

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_STORE_PATH = path.join(DATA_DIR, "orders-store.json");
const AUTO_PREPARING_DELAY_MS = 5 * 60 * 1000;
const SERVICE_REQUEST_AUTO_CLOSE_MS = 10 * 60 * 1000;
const CLOSED_SUMMARIES_RETENTION_DAYS = 14;
const ORDERS_STATE_KEY = "orders-state";
const ORDERS_META_KEY = "orders-meta";
const ORDERS_STATE_CACHE_TTL_MS = 2_000;
const ORDER_REQUEST_CACHE_TTL_MS = 10 * 60 * 1000;
const ORDER_PAYLOAD_DEDUP_WINDOW_MS = 3 * 1000;
const SHIFT_CLOSE_GRACE_MS = 60 * 60 * 1000;

type MenuSettingsSnapshot = Awaited<ReturnType<typeof getMenuSettings>>;
type ShiftWindow = {
  start: Date;
  end: Date;
};

type OrdersStateCacheEntry = {
  state: OrdersPersistence;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __ordersStateCache: OrdersStateCacheEntry | undefined;
  // eslint-disable-next-line no-var
  var __orderRequestCache:
    | Map<
        string,
        {
          orderId: string;
          restaurantSlug: string;
          tableNumber: number;
          expiresAt: number;
        }
      >
    | undefined;
  // eslint-disable-next-line no-var
  var __recentOrderPayloadCache:
    | Map<
        string,
        {
          orderId: string;
          restaurantSlug: string;
          tableNumber: number;
          sessionId: number;
          payloadSignature: string;
          expiresAt: number;
        }
      >
    | undefined;
}

function createTableKey(restaurantSlug: string, tableNumber: number) {
  return `${restaurantSlug}:${tableNumber}`;
}

function parseClockValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return { hours, minutes };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getRuleForDate(settings: MenuSettingsSnapshot, date: Date) {
  return settings.workingHoursRules.find((rule) => rule.days.includes(date.getDay()));
}

function getShiftWindowForDate(
  settings: MenuSettingsSnapshot,
  date: Date
): ShiftWindow {
  const rule = getRuleForDate(settings, date);
  const fromValue =
    typeof rule?.from === "string" && rule.from.trim()
      ? rule.from.trim()
      : settings.workingHoursFrom;
  const untilValue =
    typeof rule?.until === "string" && rule.until.trim()
      ? rule.until.trim()
      : settings.workingHoursUntil;
  const from = parseClockValue(fromValue);
  const until = parseClockValue(untilValue);

  if (!from || !until) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  const start = new Date(date);
  start.setHours(from.hours, from.minutes, 0, 0);

  const end = new Date(date);
  end.setHours(until.hours, until.minutes, 0, 0);

  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

function getShiftWindowForTimestamp(
  settings: MenuSettingsSnapshot,
  timestamp: number
): ShiftWindow {
  const date = new Date(timestamp);
  const candidates = [
    getShiftWindowForDate(settings, addDays(date, -1)),
    getShiftWindowForDate(settings, date)
  ];

  return (
    candidates.find(
      (candidate) =>
        timestamp >= candidate.start.getTime() &&
        timestamp < candidate.end.getTime()
    ) ?? candidates[1]
  );
}

function getCurrentAdminShiftWindow(
  settings: MenuSettingsSnapshot,
  now = new Date()
): ShiftWindow | null {
  const candidates = [
    getShiftWindowForDate(settings, addDays(now, -1)),
    getShiftWindowForDate(settings, now)
  ];
  const nowTs = now.getTime();
  const matched = candidates
    .filter(
      (candidate) =>
        nowTs >= candidate.start.getTime() &&
        nowTs < candidate.end.getTime() + SHIFT_CLOSE_GRACE_MS
    )
    .sort((left, right) => right.start.getTime() - left.start.getTime())[0];

  return matched ?? null;
}

function isOrderWithinAdminShiftWindow(order: Order, shiftWindow: ShiftWindow | null) {
  if (!shiftWindow) {
    return false;
  }

  const createdAtTs = new Date(order.createdAt).getTime();

  return (
    Number.isFinite(createdAtTs) &&
    createdAtTs >= shiftWindow.start.getTime() &&
    createdAtTs < shiftWindow.end.getTime() + SHIFT_CLOSE_GRACE_MS
  );
}

function cloneInitialOrders() {
  return initialOrders.map((order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item }))
  }));
}

function cloneOrdersPersistence(state: OrdersPersistence): OrdersPersistence {
  return {
    orders: state.orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({ ...item }))
    })),
    currentTableSessions: state.currentTableSessions.map(([key, value]) => [
      key,
      value
    ]),
    closedTableSummaries: state.closedTableSummaries.map((summary) => ({
      ...summary,
      orderIds: [...summary.orderIds],
      orders: summary.orders.map((order) => ({
        ...order,
        items: order.items.map((item) => ({ ...item }))
      }))
    }))
  };
}

function getOrdersStateCache() {
  return globalThis.__ordersStateCache;
}

function setOrdersStateCache(state: OrdersPersistence) {
  globalThis.__ordersStateCache = {
    state: cloneOrdersPersistence(state),
    expiresAt: Date.now() + ORDERS_STATE_CACHE_TTL_MS
  };
}

function getOrderRequestCache() {
  globalThis.__orderRequestCache ??= new Map();
  const now = Date.now();

  for (const [key, entry] of globalThis.__orderRequestCache.entries()) {
    if (entry.expiresAt <= now) {
      globalThis.__orderRequestCache.delete(key);
    }
  }

  return globalThis.__orderRequestCache;
}

function getRecentOrderPayloadCache() {
  globalThis.__recentOrderPayloadCache ??= new Map();
  const now = Date.now();

  for (const [key, entry] of globalThis.__recentOrderPayloadCache.entries()) {
    if (entry.expiresAt <= now) {
      globalThis.__recentOrderPayloadCache.delete(key);
    }
  }

  return globalThis.__recentOrderPayloadCache;
}

function findOrderByClientRequestId(
  state: RuntimeState,
  clientRequestId: string,
  restaurantSlug: string,
  tableNumber: number
) {
  const cache = getOrderRequestCache();
  const entry = cache.get(clientRequestId);

  if (!entry) {
    return null;
  }

  if (
    entry.restaurantSlug !== restaurantSlug ||
    entry.tableNumber !== tableNumber
  ) {
    return null;
  }

  const order = state.ordersStore.find((item) => item.id === entry.orderId);

  if (!order) {
    cache.delete(clientRequestId);
    return null;
  }

  return order;
}

function rememberClientRequestOrder(
  clientRequestId: string,
  order: Order,
  restaurantSlug: string,
  tableNumber: number
) {
  getOrderRequestCache().set(clientRequestId, {
    orderId: order.id,
    restaurantSlug,
    tableNumber,
    expiresAt: Date.now() + ORDER_REQUEST_CACHE_TTL_MS
  });
}

function createOrderPayloadSignature(
  items: CartItem[],
  serveMode?: ServeMode
) {
  const normalizedItems = items
    .map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      note: item.note?.trim() ?? "",
      volumeOptionId: item.volumeOptionId ?? "",
      volumeLabel: item.volumeLabel ?? "",
      priceOverride:
        typeof item.priceOverride === "number" && Number.isFinite(item.priceOverride)
          ? item.priceOverride
          : null
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );

  return JSON.stringify({
    serveMode: serveMode ?? "all_at_once",
    items: normalizedItems
  });
}

function findRecentOrderByPayload(
  state: RuntimeState,
  restaurantSlug: string,
  tableNumber: number,
  sessionId: number,
  payloadSignature: string
) {
  for (const entry of getRecentOrderPayloadCache().values()) {
    if (
      entry.restaurantSlug !== restaurantSlug ||
      entry.tableNumber !== tableNumber ||
      entry.sessionId !== sessionId ||
      entry.payloadSignature !== payloadSignature
    ) {
      continue;
    }

    const order = state.ordersStore.find((item) => item.id === entry.orderId);

    if (!order) {
      continue;
    }

    return order;
  }

  return null;
}

function rememberRecentOrderPayload(
  order: Order,
  restaurantSlug: string,
  tableNumber: number,
  sessionId: number,
  payloadSignature: string
) {
  const cache = getRecentOrderPayloadCache();
  const cacheKey = `${restaurantSlug}:${tableNumber}:${sessionId}:${order.id}`;

  cache.set(cacheKey, {
    orderId: order.id,
    restaurantSlug,
    tableNumber,
    sessionId,
    payloadSignature,
    expiresAt: Date.now() + ORDER_PAYLOAD_DEDUP_WINDOW_MS
  });
}

function normalizeGuestContactValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasGuestContactConflict(
  existingOrder: Order,
  incomingContact: {
    guestContactName?: string;
    guestContactPhone?: string;
  }
) {
  const nextName = normalizeGuestContactValue(incomingContact.guestContactName);
  const nextPhone = normalizeGuestContactValue(incomingContact.guestContactPhone);
  const currentName = normalizeGuestContactValue(existingOrder.guestContactName);
  const currentPhone = normalizeGuestContactValue(existingOrder.guestContactPhone);

  return Boolean(
    (currentName && nextName && currentName !== nextName) ||
      (currentPhone && nextPhone && currentPhone !== nextPhone)
  );
}

function toOrdersMetaPersistence(
  state: OrdersPersistence | RuntimeState
): OrdersMetaPersistence {
  return {
    currentTableSessions:
      state instanceof Object && "currentTableSessions" in state
        ? state.currentTableSessions instanceof Map
          ? [...state.currentTableSessions.entries()]
          : state.currentTableSessions
        : [],
    closedTableSummaries:
      state instanceof Object && "closedTableSummaries" in state
        ? state.closedTableSummaries
        : []
  };
}

function mapOrderToRow(order: Order): OrderRow {
  return {
    order_id: order.id,
    restaurant_slug: order.restaurantSlug,
    restaurant_name: order.restaurantName,
    table_number: order.tableNumber,
    session_id: order.sessionId,
    kind: order.kind ?? "order",
    serve_mode: order.serveMode ?? null,
    status: order.status,
    created_at: order.createdAt,
    updated_at: order.updatedAt ?? null,
    total: order.total
  };
}

function mapOrderItemToRow(orderId: string, item: OrderItem): OrderItemRow {
  return {
    id: item.id,
    order_id: orderId,
    menu_item_id: item.menuItemId,
    category: item.category ?? null,
    name: item.name,
    volume_option_id: item.volumeOptionId ?? null,
    volume_label: item.volumeLabel ?? null,
    price: item.price,
    quantity: item.quantity,
    note: item.note ?? null,
    served: item.served
  };
}

function mapRowsToOrders(
  orderRows: OrderRow[],
  itemRows: OrderItemRow[]
): Order[] {
  const itemsByOrder = new Map<string, OrderItem[]>();

  for (const item of itemRows) {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push({
      id: item.id,
      menuItemId: item.menu_item_id,
      category: (item.category as OrderItem["category"]) ?? undefined,
      name: item.name,
      volumeOptionId: item.volume_option_id ?? undefined,
      volumeLabel: item.volume_label ?? undefined,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0,
      note: item.note ?? undefined,
      served: Boolean(item.served)
    });
    itemsByOrder.set(item.order_id, current);
  }

  return orderRows.map((row) => ({
    id: row.order_id,
    restaurantSlug: row.restaurant_slug,
    restaurantName: row.restaurant_name,
    tableNumber: Number(row.table_number),
    sessionId: Number(row.session_id),
    kind: row.kind === "order" ? undefined : row.kind,
    serveMode: row.serve_mode ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    items: itemsByOrder.get(row.order_id) ?? [],
    total: Number(row.total) || 0
  }));
}

function isMissingTableError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    message.includes("relation") &&
    (message.includes("orders_store") || message.includes("order_items_store"))
  );
}

async function getMenuLookupForRestaurant(restaurantSlug: string) {
  const menuItems = await getAllMenuItems(restaurantSlug);
  return new Map(menuItems.map((menuItem) => [menuItem.id, menuItem] as const));
}

type MenuLookupByRestaurant = Map<string, Map<string, MenuItem>>;

async function normalizeOrderItemForAdmin(
  item: OrderItem,
  menuLookup?: Map<string, MenuItem>
): Promise<OrderItem> {
  const menuItem = menuLookup?.get(item.menuItemId) ?? (await getMenuItemById(item.menuItemId));
  const matchedVolumeOption = menuItem?.volumeOptions?.find(
    (option) => option.id === item.volumeOptionId
  );

  return {
    ...item,
    category: item.category ?? menuItem?.category,
    name: menuItem?.nameEn || item.name,
    volumeLabel: item.volumeLabel ?? matchedVolumeOption?.label,
    price: item.price
  };
}

async function normalizePersistedOrder(
  order: Order,
  menuLookupByRestaurant?: MenuLookupByRestaurant
): Promise<Order> {
  if (order.kind === "waiter_call" || order.kind === "bill_request") {
    return order;
  }

  const menuLookup = menuLookupByRestaurant?.get(order.restaurantSlug);
  const items = await Promise.all(
    order.items.map((item) => normalizeOrderItemForAdmin(item, menuLookup))
  );

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

function createSessionsFromOrders(orders: Order[]) {
  const sessions = createDefaultTableSessions();

  for (const order of orders) {
    const key = createTableKey(order.restaurantSlug, order.tableNumber);
    sessions.set(key, Math.max(sessions.get(key) ?? 1, order.sessionId));
  }

  return sessions;
}

function isServiceRequest(order: Order) {
  return order.kind === "waiter_call" || order.kind === "bill_request";
}

function autoCloseStaleServiceRequests(state: RuntimeState) {
  const now = Date.now();
  let changed = false;

  for (const order of state.ordersStore) {
    if (!isServiceRequest(order)) {
      continue;
    }

    if (order.status === "served" || order.status === "cancelled") {
      continue;
    }

    const createdAtMs = new Date(order.createdAt).getTime();
    const isExpired =
      Number.isFinite(createdAtMs) &&
      now - createdAtMs >= SERVICE_REQUEST_AUTO_CLOSE_MS;

    const currentSessionId = state.currentTableSessions.get(
      createTableKey(order.restaurantSlug, order.tableNumber)
    );
    const isFromClosedSession =
      typeof currentSessionId === "number" && order.sessionId < currentSessionId;

    if (isExpired || isFromClosedSession) {
      order.status = "cancelled";
      order.updatedAt = new Date().toISOString();
      changed = true;
    }
  }

  return changed;
}

function autoCloseExpiredShiftOrders(
  state: RuntimeState,
  settings: MenuSettingsSnapshot
) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  let changed = false;

  for (const order of state.ordersStore) {
    if (order.status === "served" || order.status === "cancelled") {
      continue;
    }

    const createdAtTs = new Date(order.createdAt).getTime();

    if (!Number.isFinite(createdAtTs)) {
      continue;
    }

    const shiftWindow = getShiftWindowForTimestamp(settings, createdAtTs);

    if (now < shiftWindow.end.getTime() + SHIFT_CLOSE_GRACE_MS) {
      continue;
    }

    if (isServiceRequest(order)) {
      order.status = "cancelled";
      order.updatedAt = nowIso;
      changed = true;
      continue;
    }

    order.items = order.items.map((item) => ({
      ...item,
      served: true
    }));
    order.status = "served";
    order.updatedAt = nowIso;
    changed = true;
  }

  return changed;
}

function rotateSessionsForNewShift(
  state: RuntimeState,
  settings: MenuSettingsSnapshot
) {
  const currentShiftWindow = getCurrentAdminShiftWindow(settings);

  if (!currentShiftWindow) {
    return false;
  }

  let changed = false;

  for (const [tableKey, sessionId] of state.currentTableSessions.entries()) {
    const sessionOrders = state.ordersStore.filter(
      (order) =>
        createTableKey(order.restaurantSlug, order.tableNumber) === tableKey &&
        order.sessionId === sessionId
    );

    if (!sessionOrders.length) {
      continue;
    }

    const hasCurrentShiftOrder = sessionOrders.some((order) =>
      isOrderWithinAdminShiftWindow(order, currentShiftWindow)
    );

    if (hasCurrentShiftOrder) {
      continue;
    }

    const hasOlderOrders = sessionOrders.some((order) => {
      const createdAtTs = new Date(order.createdAt).getTime();
      return (
        Number.isFinite(createdAtTs) &&
        createdAtTs < currentShiftWindow.start.getTime()
      );
    });

    if (!hasOlderOrders) {
      continue;
    }

    state.currentTableSessions.set(tableKey, sessionId + 1);
    changed = true;
  }

  return changed;
}

function closeServiceRequestsForSession(
  state: RuntimeState,
  restaurantSlug: string,
  tableNumber: number,
  sessionId: number
) {
  let changed = false;

  for (const order of state.ordersStore) {
    if (
      !isServiceRequest(order) ||
      order.restaurantSlug !== restaurantSlug ||
      order.tableNumber !== tableNumber ||
      order.sessionId !== sessionId
    ) {
      continue;
    }

    if (order.status === "served" || order.status === "cancelled") {
      continue;
    }

    order.status = "cancelled";
    order.updatedAt = new Date().toISOString();
    changed = true;
  }

  return changed;
}

async function pruneClosedTableSummariesByWorkingDay(state: RuntimeState) {
  const retentionCutoffTs =
    Date.now() - CLOSED_SUMMARIES_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const nextClosedSummaries = state.closedTableSummaries.filter((summary) => {
    const closedAtTs = new Date(summary.closedAt).getTime();

    if (!Number.isFinite(closedAtTs)) {
      return false;
    }

    return closedAtTs >= retentionCutoffTs;
  });

  if (nextClosedSummaries.length === state.closedTableSummaries.length) {
    return false;
  }

  state.closedTableSummaries = nextClosedSummaries;
  return true;
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
        ? (parsed.orders as Order[])
        : cloneInitialOrders(),
      currentTableSessions: Array.isArray(parsed.currentTableSessions)
        ? parsed.currentTableSessions
        : [...createDefaultTableSessions().entries()],
      closedTableSummaries: Array.isArray(parsed.closedTableSummaries)
        ? (parsed.closedTableSummaries as ClosedTableSummary[])
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

async function loadStateFromLegacySupabase(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>
): Promise<OrdersPersistence> {
  const { data, error } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", ORDERS_STATE_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.value) {
    return getDefaultState();
  }

  const parsed = data.value as OrdersPersistence;
  const restaurantSlugs = new Set<string>();

  if (Array.isArray(parsed.orders)) {
    for (const order of parsed.orders) {
      if (
        order &&
        typeof order.restaurantSlug === "string" &&
        order.kind !== "waiter_call" &&
        order.kind !== "bill_request"
      ) {
        restaurantSlugs.add(order.restaurantSlug);
      }
    }
  }

  if (Array.isArray(parsed.closedTableSummaries)) {
    for (const summary of parsed.closedTableSummaries) {
      if (Array.isArray(summary?.orders)) {
        for (const order of summary.orders) {
          if (
            order &&
            typeof order.restaurantSlug === "string" &&
            order.kind !== "waiter_call" &&
            order.kind !== "bill_request"
          ) {
            restaurantSlugs.add(order.restaurantSlug);
          }
        }
      }
    }
  }

  const menuLookupByRestaurant: MenuLookupByRestaurant = new Map(
    await Promise.all(
      [...restaurantSlugs].map(
        async (restaurantSlug): Promise<[string, Map<string, MenuItem>]> => [
          restaurantSlug,
          await getMenuLookupForRestaurant(restaurantSlug)
        ]
      )
    )
  );

  const orders = Array.isArray(parsed.orders)
    ? await Promise.all(
        parsed.orders.map((order) =>
          normalizePersistedOrder(order as Order, menuLookupByRestaurant)
        )
      )
    : cloneInitialOrders();
  const closedTableSummaries = Array.isArray(parsed.closedTableSummaries)
    ? await Promise.all(
        parsed.closedTableSummaries.map(async (summary) => ({
          ...summary,
          orders: Array.isArray(summary.orders)
            ? await Promise.all(
                summary.orders.map((order) =>
                  normalizePersistedOrder(
                    order as Order,
                    menuLookupByRestaurant
                  )
                )
              )
            : []
        }))
      )
    : [];

  return {
    orders,
    currentTableSessions: Array.isArray(parsed.currentTableSessions)
      ? parsed.currentTableSessions
      : [...createDefaultTableSessions().entries()],
    closedTableSummaries
  };
}

async function loadStateFromRowSupabase(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>
): Promise<OrdersPersistence> {
  const [ordersResult, orderItemsResult, metaResult] = await Promise.all([
    supabase.from("orders_store").select("*").order("created_at", { ascending: false }),
    supabase.from("order_items_store").select("*"),
    supabase.from("app_state").select("value").eq("key", ORDERS_META_KEY).maybeSingle()
  ]);

  if (ordersResult.error) {
    throw new Error(ordersResult.error.message);
  }

  if (orderItemsResult.error) {
    throw new Error(orderItemsResult.error.message);
  }

  if (metaResult.error) {
    throw new Error(metaResult.error.message);
  }

  const rows = (ordersResult.data ?? []) as OrderRow[];
  const itemRows = (orderItemsResult.data ?? []) as OrderItemRow[];
  const orders = mapRowsToOrders(rows, itemRows);
  const defaultSessionsFromRows = [...createSessionsFromOrders(orders).entries()];
  const parsedMeta = (metaResult.data?.value ?? null) as
    | Partial<OrdersMetaPersistence>
    | null;

  const normalized: OrdersPersistence = {
    orders,
    currentTableSessions: Array.isArray(parsedMeta?.currentTableSessions)
      ? parsedMeta.currentTableSessions
      : defaultSessionsFromRows,
    closedTableSummaries: Array.isArray(parsedMeta?.closedTableSummaries)
      ? (parsedMeta.closedTableSummaries as ClosedTableSummary[])
      : []
  };

  // Backward compatibility: if new tables are empty, try legacy payload once.
  if (
    normalized.orders.length === 0 &&
    normalized.closedTableSummaries.length === 0 &&
    normalized.currentTableSessions.length === 0
  ) {
    return getDefaultState();
  }

  return normalized;
}

async function persistStateToRowSupabase(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  state: RuntimeState
) {
  const orderRows = state.ordersStore.map(mapOrderToRow);
  const orderItemRows = state.ordersStore.flatMap((order) =>
    order.items.map((item) => mapOrderItemToRow(order.id, item))
  );
  const orderIds = state.ordersStore.map((order) => order.id);

  if (orderIds.length === 0) {
    const { error: deleteAllItemsError } = await supabase
      .from("order_items_store")
      .delete()
      .neq("id", "");

    if (deleteAllItemsError) {
      throw new Error(deleteAllItemsError.message);
    }

    const { error: deleteAllOrdersError } = await supabase
      .from("orders_store")
      .delete()
      .neq("order_id", "");

    if (deleteAllOrdersError) {
      throw new Error(deleteAllOrdersError.message);
    }
  } else {
    const { error: deleteItemsError } = await supabase
      .from("order_items_store")
      .delete()
      .in("order_id", orderIds);

    if (deleteItemsError) {
      throw new Error(deleteItemsError.message);
    }
  }

  if (orderRows.length > 0) {
    const { error: upsertOrdersError } = await supabase
      .from("orders_store")
      .upsert(orderRows, { onConflict: "order_id" });

    if (upsertOrdersError) {
      throw new Error(upsertOrdersError.message);
    }

    const { data: existingRows, error: existingRowsError } = await supabase
      .from("orders_store")
      .select("order_id");

    if (existingRowsError) {
      throw new Error(existingRowsError.message);
    }

    const staleIds = (existingRows ?? [])
      .map((row) => String((row as { order_id: string }).order_id))
      .filter((id) => !orderIds.includes(id));

    if (staleIds.length > 0) {
      const { error: deleteStaleOrdersError } = await supabase
        .from("orders_store")
        .delete()
        .in("order_id", staleIds);

      if (deleteStaleOrdersError) {
        throw new Error(deleteStaleOrdersError.message);
      }
    }
  }

  if (orderItemRows.length > 0) {
    const { error: upsertItemsError } = await supabase
      .from("order_items_store")
      .upsert(orderItemRows, { onConflict: "id" });

    if (upsertItemsError) {
      throw new Error(upsertItemsError.message);
    }
  }

  const { error: metaError } = await supabase.from("app_state").upsert(
    {
      key: ORDERS_META_KEY,
      value: toOrdersMetaPersistence(state),
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );

  if (metaError) {
    throw new Error(metaError.message);
  }
}

async function loadStateAsync(): Promise<OrdersPersistence> {
  const cached = getOrdersStateCache();

  if (cached && cached.expiresAt > Date.now()) {
    return cloneOrdersPersistence(cached.state);
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const localState = loadState();
    setOrdersStateCache(localState);
    return cloneOrdersPersistence(localState);
  }

  try {
    const normalizedState = await loadStateFromRowSupabase(supabase);

    if (normalizedState.orders.length === 0) {
      try {
        const legacyState = await loadStateFromLegacySupabase(supabase);
        if (legacyState.orders.length > 0) {
          try {
            await persistStateToRowSupabase(supabase, toRuntimeState(legacyState));
          } catch {
            // ignore migration failures, keep serving legacy state
          }
          setOrdersStateCache(legacyState);
          return cloneOrdersPersistence(legacyState);
        }
      } catch {
        // ignore and keep row-based state
      }
    }

    setOrdersStateCache(normalizedState);
    return cloneOrdersPersistence(normalizedState);
  } catch {
    try {
      const legacyState = await loadStateFromLegacySupabase(supabase);
      setOrdersStateCache(legacyState);
      return cloneOrdersPersistence(legacyState);
    } catch {
      const localState = loadState();
      setOrdersStateCache(localState);
      return cloneOrdersPersistence(localState);
    }
  }
}

async function readRuntimeStateAsync(): Promise<RuntimeState> {
  const persistedState = await loadStateAsync();
  const state: RuntimeState = {
    ordersStore: persistedState.orders,
    currentTableSessions: new Map<string, number>(
      persistedState.currentTableSessions
    ),
    closedTableSummaries: persistedState.closedTableSummaries
  };
  const settings = await getMenuSettings();

  const expiredShiftOrdersClosed = autoCloseExpiredShiftOrders(state, settings);
  const staleServiceRequestsClosed = autoCloseStaleServiceRequests(state);
  const shiftedSessionsRotated = rotateSessionsForNewShift(state, settings);
  const staleClosedSummariesPruned = await pruneClosedTableSummariesByWorkingDay(
    state
  );

  if (
    expiredShiftOrdersClosed ||
    staleServiceRequestsClosed ||
    shiftedSessionsRotated ||
    staleClosedSummariesPruned
  ) {
    await persistStateAsync(state);
  }

  return state;
}

function toRuntimeState(state: OrdersPersistence): RuntimeState {
  return {
    ordersStore: state.orders,
    currentTableSessions: new Map<string, number>(state.currentTableSessions),
    closedTableSummaries: state.closedTableSummaries
  };
}

function persistState(state: RuntimeState) {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const payload = {
    orders: state.ordersStore,
    currentTableSessions: [...state.currentTableSessions.entries()],
    closedTableSummaries: state.closedTableSummaries
  } satisfies OrdersPersistence;

  writeFileSync(ORDERS_STORE_PATH, JSON.stringify(payload, null, 2), "utf8");
  setOrdersStateCache(payload);
}

async function persistStateAsync(state: RuntimeState) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    persistState(state);
    return;
  }

  const payload = {
    orders: state.ordersStore,
    currentTableSessions: [...state.currentTableSessions.entries()],
    closedTableSummaries: state.closedTableSummaries
  } satisfies OrdersPersistence;

  try {
    await persistStateToRowSupabase(supabase, state);
  } catch (error) {
    if (!isMissingTableError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Supabase persist failed: ${message}`);
    }

    // Backward compatibility fallback: keep old app_state storage
    const { error: legacyError } = await supabase.from("app_state").upsert(
      {
        key: ORDERS_STATE_KEY,
        value: payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: "key" }
    );

    if (legacyError) {
      throw new Error(`Supabase persist failed: ${legacyError.message}`);
    }
  }

  setOrdersStateCache(payload);
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

export async function getCurrentTableSessionId(
  restaurantSlug: string,
  tableNumber: number
) {
  const state = await readRuntimeStateAsync();
  const { sessionId, created } = ensureCurrentSessionId(
    state,
    restaurantSlug,
    tableNumber
  );

  if (created) {
    await persistStateAsync(state);
  }

  return sessionId;
}

if (!existsSync(ORDERS_STORE_PATH)) {
  persistState(readRuntimeState());
}

function createOrderItem(
  cartItem: CartItem,
  menuItem: MenuItem,
  menuSettings?: Awaited<ReturnType<typeof getMenuSettings>>
): OrderItem {

  const matchedVolumeOption = menuItem.volumeOptions?.find(
    (option) => option.id === cartItem.volumeOptionId
  );
  const basePrice = matchedVolumeOption?.price ?? menuItem.price;
  const finalPrice = menuSettings
    ? applyHappyHourDiscount(basePrice, menuItem.category, menuSettings)
    : basePrice;

  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    menuItemId: menuItem.id,
    category: menuItem.category,
    name: menuItem.nameEn || menuItem.name,
    volumeOptionId: cartItem.volumeOptionId,
    volumeLabel: cartItem.volumeLabel ?? matchedVolumeOption?.label,
    price: finalPrice,
    quantity: cartItem.quantity,
    note: cartItem.note?.trim() || undefined,
    served: false
  };
}

function isPromotionActiveNow(promotion: PromotionSettings) {
  if (!promotion.enabled || promotion.discountPercent <= 0) {
    return false;
  }

  if (promotion.days.length > 0 && !promotion.days.includes(new Date().getDay())) {
    return false;
  }

  if (!promotion.startsFrom || !promotion.until) {
    return true;
  }

  const startDate = new Date(promotion.startsFrom);
  const untilDate = new Date(promotion.until);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(untilDate.getTime())
  ) {
    return false;
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const untilMinutes = untilDate.getHours() * 60 + untilDate.getMinutes();

  if (startMinutes <= untilMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= untilMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes <= untilMinutes;
}

function getPromotionDiscountForCategory(
  category: MenuItem["category"],
  settings: Awaited<ReturnType<typeof getMenuSettings>>
) {
  const activePromotions = settings.promotions.length
    ? settings.promotions.filter(isPromotionActiveNow)
    : settings.happyHourEnabled
      ? [
          {
            id: "promo-legacy",
            enabled: settings.happyHourEnabled,
            text: settings.happyHourText,
            categories: settings.happyHourCategories,
            days: settings.happyHourDays,
            discountPercent: settings.happyHourDiscountPercent,
            startsFrom: settings.happyHourStartsFrom,
            until: settings.happyHourUntil
          }
        ].filter(isPromotionActiveNow)
      : [];

  return activePromotions.reduce((maxDiscount, promotion) => {
    if (!promotion.categories.includes(category)) {
      return maxDiscount;
    }

    return Math.max(maxDiscount, promotion.discountPercent);
  }, 0);
}

function applyHappyHourDiscount(
  price: number,
  category: MenuItem["category"],
  settings: Awaited<ReturnType<typeof getMenuSettings>>
) {
  const discountPercent = getPromotionDiscountForCategory(category, settings);

  if (discountPercent <= 0) {
    return price;
  }

  const discountMultiplier = 1 - discountPercent / 100;
  return Number(Math.max(0, price * discountMultiplier).toFixed(2));
}

async function mergeOrderItems(order: Order, nextItems: OrderItem[]) {
  const mergedItems = [...order.items];
  const now = new Date().toISOString();

  for (const nextItem of nextItems) {
    const existingItem = mergedItems.find(
      (item) =>
        item.menuItemId === nextItem.menuItemId &&
        (item.volumeOptionId ?? "") === (nextItem.volumeOptionId ?? "") &&
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

async function normalizeOrderState(order: Order) {
  const menuLookup = await getMenuLookupForRestaurant(order.restaurantSlug);
  order.items = await Promise.all(
    order.items.map((item) => normalizeOrderItemForAdmin(item, menuLookup))
  );

  if (order.kind === "waiter_call" || order.kind === "bill_request") {
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
  const shouldAutoPrepare =
    order.status === "new" &&
    Date.now() - new Date(order.createdAt).getTime() >= AUTO_PREPARING_DELAY_MS;

  if (allItemsServed) {
    order.status = "served";
  } else if (someItemsServed || order.status === "preparing" || shouldAutoPrepare) {
    order.status = "preparing";
  } else if (order.status !== "cancelled") {
    order.status = "new";
  }

  return order;
}

export async function getOrders(restaurantSlug?: string) {
  const { ordersStore } = await readRuntimeStateAsync();
  const shiftWindow = getCurrentAdminShiftWindow(await getMenuSettings());

  if (!shiftWindow) {
    return [];
  }

  return ordersStore
    .filter((order) => {
      if (restaurantSlug && order.restaurantSlug !== restaurantSlug) {
        return false;
      }

      return (
        order.status !== "served" &&
        order.status !== "cancelled" &&
        isOrderWithinAdminShiftWindow(order, shiftWindow)
      );
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getAllStoredOrders(restaurantSlug?: string) {
  const { ordersStore } = await readRuntimeStateAsync();

  return ordersStore
    .filter((order) => {
      if (restaurantSlug && order.restaurantSlug !== restaurantSlug) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createWaiterCall(input: {
  restaurantSlug: string;
  tableNumber: number;
}) {
  const state = await readRuntimeStateAsync();
  const restaurant = await getRestaurantBySlug(input.restaurantSlug);

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
  await persistStateAsync(state);

  return waiterCall;
}

export async function createBillRequest(input: {
  restaurantSlug: string;
  tableNumber: number;
}) {
  const state = await readRuntimeStateAsync();
  const restaurant = await getRestaurantBySlug(input.restaurantSlug);

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

  const existingActiveBillRequest = state.ordersStore.find(
    (order) =>
      order.restaurantSlug === restaurant.slug &&
      order.tableNumber === input.tableNumber &&
      order.sessionId === sessionId &&
      order.kind === "bill_request" &&
      order.status !== "cancelled" &&
      order.status !== "served"
  );

  if (existingActiveBillRequest) {
    return existingActiveBillRequest;
  }

  const billRequest: Order = {
    id: `bill_${Date.now()}`,
    restaurantSlug: restaurant.slug,
    restaurantName: restaurant.name,
    tableNumber: input.tableNumber,
    sessionId,
    kind: "bill_request",
    status: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [],
    total: 0
  };

  state.ordersStore.unshift(billRequest);
  await persistStateAsync(state);

  return billRequest;
}

export async function getTableSessionOrders(
  restaurantSlug: string,
  tableNumber: number
) {
  const state = await readRuntimeStateAsync();
  const { sessionId, created } = ensureCurrentSessionId(
    state,
    restaurantSlug,
    tableNumber
  );

  if (created) {
    await persistStateAsync(state);
  }

  return state.ordersStore
    .filter(
      (order) =>
        order.restaurantSlug === restaurantSlug &&
        order.tableNumber === tableNumber &&
        order.sessionId === sessionId &&
        order.status !== "cancelled" &&
        order.kind !== "waiter_call" &&
        order.kind !== "bill_request"
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getTableSessionServiceRequests(
  restaurantSlug: string,
  tableNumber: number
) {
  const state = await readRuntimeStateAsync();
  const { sessionId, created } = ensureCurrentSessionId(
    state,
    restaurantSlug,
    tableNumber
  );

  if (created) {
    await persistStateAsync(state);
  }

  return state.ordersStore
    .filter(
      (order) =>
        order.restaurantSlug === restaurantSlug &&
        order.tableNumber === tableNumber &&
        order.sessionId === sessionId &&
        order.status !== "cancelled" &&
        order.status !== "served" &&
        (order.kind === "waiter_call" || order.kind === "bill_request")
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createOrder(input: {
  restaurantSlug: string;
  tableNumber: number;
  items: CartItem[];
  serveMode?: ServeMode;
  clientRequestId?: string;
  guestContactName?: string;
  guestContactPhone?: string;
}) {
  const state = await readRuntimeStateAsync();
  const restaurant = await getRestaurantBySlug(input.restaurantSlug);

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  const tableExists = restaurant.tables.some(
    (table) => table.number === input.tableNumber
  );

  if (!tableExists) {
    throw new Error("Table not found");
  }

  if (input.clientRequestId) {
    const repeatedOrder = findOrderByClientRequestId(
      state,
      input.clientRequestId,
      input.restaurantSlug,
      input.tableNumber
    );

    if (repeatedOrder) {
      return normalizeOrderState(repeatedOrder);
    }
  }

  if (!input.items.length) {
    throw new Error("Order must contain at least one item");
  }

  const { sessionId } = ensureCurrentSessionId(
    state,
    input.restaurantSlug,
    input.tableNumber
  );
  const payloadSignature = createOrderPayloadSignature(input.items, input.serveMode);

  const menuLookup = await getMenuLookupForRestaurant(input.restaurantSlug);
  const menuSettings = await getMenuSettings();
  const items = input.items.map((cartItem) => {
    const menuItem = menuLookup.get(cartItem.menuItemId);

    if (!menuItem) {
      throw new Error(`Menu item ${cartItem.menuItemId} not found`);
    }

    return createOrderItem(cartItem, menuItem, menuSettings);
  });
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const repeatedPayloadOrder = findRecentOrderByPayload(
    state,
    input.restaurantSlug,
    input.tableNumber,
    sessionId,
    payloadSignature
  );

  if (repeatedPayloadOrder) {
    if (input.clientRequestId) {
      rememberClientRequestOrder(
        input.clientRequestId,
        repeatedPayloadOrder,
        input.restaurantSlug,
        input.tableNumber
      );
    }

    return normalizeOrderState(repeatedPayloadOrder);
  }

  const existingNewOrder = state.ordersStore.find(
    (order) =>
      order.restaurantSlug === restaurant.slug &&
      order.tableNumber === input.tableNumber &&
      order.sessionId === sessionId &&
      order.kind !== "waiter_call" &&
      order.kind !== "bill_request" &&
      order.status === "new"
  );

  if (
    existingNewOrder &&
    !hasGuestContactConflict(existingNewOrder, {
      guestContactName: input.guestContactName,
      guestContactPhone: input.guestContactPhone
    })
  ) {
    const mergedOrder = await mergeOrderItems(existingNewOrder, items);

    if (!normalizeGuestContactValue(mergedOrder.guestContactName)) {
      mergedOrder.guestContactName = normalizeGuestContactValue(input.guestContactName);
    }

    if (!normalizeGuestContactValue(mergedOrder.guestContactPhone)) {
      mergedOrder.guestContactPhone = normalizeGuestContactValue(input.guestContactPhone);
    }

    if (input.serveMode) {
      mergedOrder.serveMode = input.serveMode;
    }

    rememberRecentOrderPayload(
      mergedOrder,
      input.restaurantSlug,
      input.tableNumber,
      sessionId,
      payloadSignature
    );

    if (input.clientRequestId) {
      rememberClientRequestOrder(
        input.clientRequestId,
        mergedOrder,
        input.restaurantSlug,
        input.tableNumber
      );
    }

    await persistStateAsync(state);
    return mergedOrder;
  }

  const order: Order = {
    id: `ord_${Date.now()}`,
    restaurantSlug: restaurant.slug,
    restaurantName: restaurant.name,
    tableNumber: input.tableNumber,
    sessionId,
    guestContactName: normalizeGuestContactValue(input.guestContactName),
    guestContactPhone: normalizeGuestContactValue(input.guestContactPhone),
    status: "new",
    serveMode: input.serveMode ?? "all_at_once",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items,
    total
  };

  state.ordersStore.unshift(order);

  rememberRecentOrderPayload(
    order,
    input.restaurantSlug,
    input.tableNumber,
    sessionId,
    payloadSignature
  );

  if (input.clientRequestId) {
    rememberClientRequestOrder(
      input.clientRequestId,
      order,
      input.restaurantSlug,
      input.tableNumber
    );
  }

  await persistStateAsync(state);

  return order;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const state = await readRuntimeStateAsync();
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

  const normalizedOrder = await normalizeOrderState(order);
  await persistStateAsync(state);

  return normalizedOrder;
}

export async function updateOrderGuestContact(
  orderId: string,
  guestContact: {
    guestContactName?: string;
    guestContactPhone?: string;
  }
) {
  const state = await readRuntimeStateAsync();
  const order = state.ordersStore.find((item) => item.id === orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.kind === "waiter_call" || order.kind === "bill_request") {
    throw new Error("Service request contact cannot be updated");
  }

  order.guestContactName =
    typeof guestContact.guestContactName === "string" &&
    guestContact.guestContactName.trim()
      ? guestContact.guestContactName.trim()
      : undefined;
  order.guestContactPhone =
    typeof guestContact.guestContactPhone === "string" &&
    guestContact.guestContactPhone.trim()
      ? guestContact.guestContactPhone.trim()
      : undefined;
  order.updatedAt = new Date().toISOString();

  const normalizedOrder = await normalizeOrderState(order);
  await persistStateAsync(state);

  return normalizedOrder;
}

export async function updateOrderItemServed(
  orderId: string,
  orderItemId: string,
  served: boolean
) {
  const state = await readRuntimeStateAsync();
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
  const normalizedOrder = await normalizeOrderState(order);
  await persistStateAsync(state);

  return normalizedOrder;
}

export async function removeOrderItem(
  orderId: string,
  orderItemId: string,
  removeQuantity: number
) {
  const state = await readRuntimeStateAsync();
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

  const normalizedOrder = await normalizeOrderState(order);
  await persistStateAsync(state);

  return normalizedOrder;
}

export async function changeOrderItemQuantity(
  orderId: string,
  orderItemId: string,
  delta: number
) {
  const state = await readRuntimeStateAsync();
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

  const normalizedOrder = await normalizeOrderState(order);
  await persistStateAsync(state);

  return normalizedOrder;
}

export async function getTableOverviews(
  restaurantSlug?: string
): Promise<TableOverview[]> {
  const state = await readRuntimeStateAsync();
  const shiftWindow = getCurrentAdminShiftWindow(await getMenuSettings());
  let shouldPersist = false;

  if (!shiftWindow) {
    return [];
  }

  const overviews = (await getRestaurants())
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
            order.status !== "cancelled" &&
            order.kind !== "waiter_call" &&
            order.kind !== "bill_request" &&
            isOrderWithinAdminShiftWindow(order, shiftWindow)
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
    await persistStateAsync(state);
  }

  return overviews;
}

export async function closeTable(restaurantSlug: string, tableNumber: number) {
  const state = await readRuntimeStateAsync();
  const restaurant = await getRestaurantBySlug(restaurantSlug);

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
  closeServiceRequestsForSession(state, restaurantSlug, tableNumber, sessionId);
  const orders = state.ordersStore.filter(
    (order) =>
      order.restaurantSlug === restaurantSlug &&
      order.tableNumber === tableNumber &&
      order.sessionId === sessionId
  );

  const unservedOrders = orders.filter(
    (order) =>
      order.kind !== "waiter_call" &&
      order.kind !== "bill_request" &&
      order.status !== "served" &&
      order.status !== "cancelled"
  );

  if (unservedOrders.length > 0) {
    throw new Error(
      "Check that all the orders are served and change status in Orders."
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
  await persistStateAsync(state);

  return summary;
}

export async function moveTableOrders(
  restaurantSlug: string,
  fromTableNumber: number,
  toTableNumber: number
) {
  const state = await readRuntimeStateAsync();
  const restaurant = await getRestaurantBySlug(restaurantSlug);

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
      order.kind !== "bill_request" &&
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

  await persistStateAsync(state);

  return {
    restaurantSlug,
    fromTableNumber,
    toTableNumber,
    movedOrders: movableOrders.length
  };
}

export async function getClosedTableSummaries(restaurantSlug?: string) {
  const { closedTableSummaries } = await readRuntimeStateAsync();

  return closedTableSummaries.filter((summary) =>
    restaurantSlug ? summary.restaurantSlug === restaurantSlug : true
  );
}
