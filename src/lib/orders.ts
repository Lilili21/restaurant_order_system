import { initialOrders } from "@/lib/mock-data";
import { getMenuSettings } from "@/lib/menu-settings";
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
const ORDERS_STATE_KEY = "orders-state";
const ORDERS_META_KEY = "orders-meta";
const ORDERS_STATE_CACHE_TTL_MS = 2_000;

type OrdersStateCacheEntry = {
  state: OrdersPersistence;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __ordersStateCache: OrdersStateCacheEntry | undefined;
}

function createTableKey(restaurantSlug: string, tableNumber: number) {
  return `${restaurantSlug}:${tableNumber}`;
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

  if (autoCloseStaleServiceRequests(state)) {
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

function isHappyHourActiveNow(settings: Awaited<ReturnType<typeof getMenuSettings>>) {
  if (!settings.happyHourEnabled) {
    return false;
  }

  if (!settings.happyHourStartsFrom || !settings.happyHourUntil) {
    return true;
  }

  const startDate = new Date(settings.happyHourStartsFrom);
  const untilDate = new Date(settings.happyHourUntil);

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

function applyHappyHourDiscount(
  price: number,
  category: MenuItem["category"],
  settings: Awaited<ReturnType<typeof getMenuSettings>>
) {
  if (!isHappyHourActiveNow(settings)) {
    return price;
  }

  if (!settings.happyHourCategories.includes(category)) {
    return price;
  }

  if (settings.happyHourDiscountPercent <= 0) {
    return price;
  }

  const discountMultiplier = 1 - settings.happyHourDiscountPercent / 100;
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

  return ordersStore
    .filter((order) => {
      if (restaurantSlug && order.restaurantSlug !== restaurantSlug) {
        return false;
      }

      return order.status !== "served" && order.status !== "cancelled";
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

  const existingActiveWaiterCall = state.ordersStore.find(
    (order) =>
      order.restaurantSlug === restaurant.slug &&
      order.tableNumber === input.tableNumber &&
      order.sessionId === sessionId &&
      order.kind === "waiter_call" &&
      order.status !== "cancelled" &&
      order.status !== "served"
  );

  if (existingActiveWaiterCall) {
    return existingActiveWaiterCall;
  }

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

  if (!input.items.length) {
    throw new Error("Order must contain at least one item");
  }

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
      order.kind !== "bill_request" &&
      order.status === "new"
  );

  if (existingNewOrder) {
    const mergedOrder = await mergeOrderItems(existingNewOrder, items);

    if (input.serveMode) {
      mergedOrder.serveMode = input.serveMode;
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
    status: "new",
    serveMode: input.serveMode ?? "all_at_once",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items,
    total
  };

  state.ordersStore.unshift(order);
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
  let shouldPersist = false;

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
            order.kind !== "bill_request"
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
