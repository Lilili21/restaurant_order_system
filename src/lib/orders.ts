import { initialOrders } from "@/lib/mock-data";
import { getMenuSettings, PromotionSettings } from "@/lib/menu-settings";
import {
  ClosedTableOrderSnapshot,
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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
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

type LegacyOrderRow = {
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

type ActiveOrderRow = {
  id: string;
  restaurant_id: string;
  table_id?: string | null;
  table_number: number;
  session_id: number;
  kind: "order" | "waiter_call" | "bill_request";
  serve_mode: ServeMode | null;
  status: OrderStatus;
  restaurant_name: string;
  guest_contact_name: string | null;
  guest_contact_phone: string | null;
  created_at: string;
  updated_at: string | null;
  total: number;
};

type LegacyOrderItemRow = {
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

type ActiveOrderItemRow = {
  id: string;
  order_id: string;
  restaurant_id: string;
  menu_item_id: string | null;
  category: string | null;
  name: string;
  volume_option_id: string | null;
  volume_label: string | null;
  price: number;
  quantity: number;
  note: string | null;
  served: boolean;
  created_at?: string;
};

type ClosedSessionRow = {
  id: string;
  restaurant_id: string;
  table_number: number;
  session_id: number;
  closed_at: string;
  total: number;
  order_ids: unknown;
  orders_snapshot: unknown;
};

type RestaurantRow = {
  id: string;
  slug: string;
  name: string;
};

type RestaurantTableSessionRow = {
  restaurant_id: string;
  table_number: number;
  current_session_id: number;
};

type ServiceRequestRow = {
  id: string;
  restaurant_id: string;
  table_number: number;
  session_id: number;
  kind: "waiter_call" | "bill_request";
  status: OrderStatus;
  created_at: string;
  updated_at: string | null;
};

function canWriteToDirectory(directoryPath: string) {
  try {
    mkdirSync(directoryPath, { recursive: true });
    const probePath = path.join(directoryPath, ".write-test");
    writeFileSync(probePath, "ok", "utf8");
    unlinkSync(probePath);
    return true;
  } catch {
    return false;
  }
}

function resolveWritableDataDir() {
  const projectDataDir = path.join(process.cwd(), "data");

  if (canWriteToDirectory(projectDataDir)) {
    return projectDataDir;
  }

  const tempDataDir = path.join(process.env.TMPDIR ?? "/tmp", "menu-data");

  if (canWriteToDirectory(tempDataDir)) {
    return tempDataDir;
  }

  return projectDataDir;
}

const BUNDLED_DATA_DIR = path.join(process.cwd(), "data");
const DATA_DIR = resolveWritableDataDir();
const ORDERS_STORE_PATH = path.join(DATA_DIR, "orders-store.json");
const BUNDLED_ORDERS_STORE_PATH = path.join(BUNDLED_DATA_DIR, "orders-store.json");
const ORDERS_ARCHIVE_DIR = path.join(DATA_DIR, "orders-archive");
const BUNDLED_ORDERS_ARCHIVE_DIR = path.join(BUNDLED_DATA_DIR, "orders-archive");
const AUTO_PREPARING_DELAY_MS = 3 * 60 * 1000;
const SERVICE_REQUEST_AUTO_CLOSE_MS = 10 * 60 * 1000;
const CLOSED_SUMMARIES_RETENTION_DAYS = 14;
const ORDERS_STATE_KEY = "orders-state";
const ORDERS_META_KEY = "orders-meta";
const ORDERS_STATE_CACHE_TTL_MS = 2_000;
const MENU_LOOKUP_CACHE_TTL_MS = 60 * 1000;
const ORDER_REQUEST_CACHE_TTL_MS = 10 * 60 * 1000;
const ORDER_PAYLOAD_DEDUP_WINDOW_MS = 3 * 1000;
const MERGE_ORDER_WINDOW_MS = 3 * 60 * 1000;
const SHIFT_CLOSE_GRACE_MS = 60 * 60 * 1000;
const COOKED_MARKER = "__menu_order_cooked__";
const MAX_WEEKLY_ARCHIVE_FILES = 4;

type WeeklyOrdersArchive = {
  weekKey: string;
  orders: Order[];
  closedTableSummaries: ClosedTableSummary[];
};

export type WeeklyOrdersArchiveMeta = {
  weekKey: string;
  label: string;
  start: string;
  end: string;
};

type MenuSettingsSnapshot = Awaited<ReturnType<typeof getMenuSettings>>;
type ShiftWindow = {
  start: Date;
  end: Date;
};

type OrdersStateCacheEntry = {
  state: OrdersPersistence;
  expiresAt: number;
};

type MenuLookupCacheEntry = {
  lookup: Map<string, MenuItem>;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __ordersStateCache: OrdersStateCacheEntry | undefined;
  // eslint-disable-next-line no-var
  var __ordersPersistedPayload: string | undefined;
  // eslint-disable-next-line no-var
  var __menuLookupCache: Map<string, MenuLookupCacheEntry> | undefined;
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

function normalizeOrderItemNoteValue(note: string | undefined) {
  return typeof note === "string" && note.trim() ? note.trim() : "";
}

function noteHasCookedMarker(note: string | undefined) {
  return normalizeOrderItemNoteValue(note).includes(COOKED_MARKER);
}

function setCookedMarkerOnNote(note: string | undefined, cooked: boolean) {
  const base = normalizeOrderItemNoteValue(note)
    .replaceAll(COOKED_MARKER, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cooked) {
    return base || undefined;
  }

  return base ? `${base} ${COOKED_MARKER}` : COOKED_MARKER;
}

function isOrderCooked(order: Order) {
  return (
    order.kind !== "waiter_call" &&
    order.kind !== "bill_request" &&
    order.items.length > 0 &&
    order.items.some((item) => noteHasCookedMarker(item.note))
  );
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

function getStartOfIsoWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

function getIsoWeekKey(date: Date) {
  const weekStart = getStartOfIsoWeek(date);
  const thursday = new Date(weekStart);
  thursday.setDate(weekStart.getDate() + 3);
  const year = thursday.getFullYear();
  const firstWeekStart = getStartOfIsoWeek(new Date(year, 0, 4));
  const weekNumber =
    Math.floor(
      (weekStart.getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ) + 1;

  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
}

function getWeekDateRangeForKey(weekKey: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const week = Number.parseInt(match[2], 10);

  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) {
    return null;
  }

  const firstWeekStart = getStartOfIsoWeek(new Date(year, 0, 4));
  const weekStart = new Date(firstWeekStart);
  weekStart.setDate(firstWeekStart.getDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const formatDate = (value: Date) => value.toISOString().slice(0, 10);

  return {
    start: formatDate(weekStart),
    end: formatDate(weekEnd)
  };
}

function getWeekLabel(weekKey: string) {
  const dateRange = getWeekDateRangeForKey(weekKey);

  if (!dateRange) {
    return weekKey;
  }

  return `${dateRange.start} - ${dateRange.end}`;
}

function buildOrdersPersistencePayload(state: RuntimeState): OrdersPersistence {
  return {
    orders: state.ordersStore,
    currentTableSessions: [...state.currentTableSessions.entries()],
    closedTableSummaries: state.closedTableSummaries
  };
}

function getWeeklyArchivePath(weekKey: string) {
  const dateRange = getWeekDateRangeForKey(weekKey);
  const fileName = dateRange
    ? `orders-${weekKey}-${dateRange.start}_to_${dateRange.end}.json`
    : `orders-${weekKey}.json`;

  return path.join(ORDERS_ARCHIVE_DIR, fileName);
}

function getLegacyWeeklyArchivePath(weekKey: string) {
  return path.join(ORDERS_ARCHIVE_DIR, `orders-${weekKey}.json`);
}

function getBundledWeeklyArchivePath(weekKey: string) {
  const dateRange = getWeekDateRangeForKey(weekKey);
  const fileName = dateRange
    ? `orders-${weekKey}-${dateRange.start}_to_${dateRange.end}.json`
    : `orders-${weekKey}.json`;

  return path.join(BUNDLED_ORDERS_ARCHIVE_DIR, fileName);
}

function getBundledLegacyWeeklyArchivePath(weekKey: string) {
  return path.join(BUNDLED_ORDERS_ARCHIVE_DIR, `orders-${weekKey}.json`);
}

function readWeeklyArchive(weekKey: string): WeeklyOrdersArchive {
  const archivePath = getWeeklyArchivePath(weekKey);
  const legacyArchivePath = getLegacyWeeklyArchivePath(weekKey);
  const bundledArchivePath = getBundledWeeklyArchivePath(weekKey);
  const bundledLegacyArchivePath = getBundledLegacyWeeklyArchivePath(weekKey);
  const readableArchivePath = [
    archivePath,
    legacyArchivePath,
    bundledArchivePath,
    bundledLegacyArchivePath
  ].find((candidatePath) => existsSync(candidatePath));

  if (!readableArchivePath) {
    return {
      weekKey,
      orders: [],
      closedTableSummaries: []
    };
  }

  try {
    const raw = readFileSync(readableArchivePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WeeklyOrdersArchive>;

    return {
      weekKey,
      orders: Array.isArray(parsed.orders) ? (parsed.orders as Order[]) : [],
      closedTableSummaries: Array.isArray(parsed.closedTableSummaries)
        ? (parsed.closedTableSummaries as ClosedTableSummary[])
        : []
    };
  } catch {
    return {
      weekKey,
      orders: [],
      closedTableSummaries: []
    };
  }
}

export function listWeeklyOrdersArchiveMeta(): WeeklyOrdersArchiveMeta[] {
  const archiveDirectories = [ORDERS_ARCHIVE_DIR, BUNDLED_ORDERS_ARCHIVE_DIR].filter(
    (directoryPath, index, current) =>
      existsSync(directoryPath) && current.indexOf(directoryPath) === index
  );

  if (archiveDirectories.length === 0) {
    return [];
  }

  return archiveDirectories
    .flatMap((directoryPath) => readdirSync(directoryPath))
    .filter((fileName, index, current) => current.indexOf(fileName) === index)
    .map((fileName) => {
      const match = /^orders-(\d{4}-W\d{2})(?:-(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2}))?\.json$/.exec(
        fileName
      );

      if (!match) {
        return null;
      }

      const weekKey = match[1];
      const dateRange = getWeekDateRangeForKey(weekKey);

      return {
        weekKey,
        label: getWeekLabel(weekKey),
        start: match[2] ?? dateRange?.start ?? "",
        end: match[3] ?? dateRange?.end ?? ""
      } satisfies WeeklyOrdersArchiveMeta;
    })
    .filter(Boolean)
    .sort((left, right) => right!.weekKey.localeCompare(left!.weekKey))
    .slice(0, MAX_WEEKLY_ARCHIVE_FILES) as WeeklyOrdersArchiveMeta[];
}

export function getWeeklyOrdersArchive(
  weekKey: string
): WeeklyOrdersArchive | null {
  const archive = readWeeklyArchive(weekKey);

  if (archive.orders.length === 0 && archive.closedTableSummaries.length === 0) {
    return null;
  }

  return archive;
}

function persistWeeklyArchive(archive: WeeklyOrdersArchive) {
  if (!existsSync(ORDERS_ARCHIVE_DIR)) {
    mkdirSync(ORDERS_ARCHIVE_DIR, { recursive: true });
  }

  const legacyArchivePath = getLegacyWeeklyArchivePath(archive.weekKey);

  writeFileSync(
    getWeeklyArchivePath(archive.weekKey),
    JSON.stringify(archive, null, 2),
    "utf8"
  );

  if (existsSync(legacyArchivePath)) {
    unlinkSync(legacyArchivePath);
  }
}

function pruneWeeklyArchiveFiles() {
  if (!existsSync(ORDERS_ARCHIVE_DIR)) {
    return;
  }

  const weeklyFiles = readdirSync(ORDERS_ARCHIVE_DIR)
    .filter(
      (fileName) =>
        /^orders-\d{4}-W\d{2}(?:-\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2})?\.json$/.test(
          fileName
        )
    )
    .sort()
    .reverse();

  for (const fileName of weeklyFiles.slice(MAX_WEEKLY_ARCHIVE_FILES)) {
    unlinkSync(path.join(ORDERS_ARCHIVE_DIR, fileName));
  }
}

function archiveCompletedShiftsForNewActiveShift(
  state: RuntimeState,
  settings: MenuSettingsSnapshot
) {
  const currentShiftWindow = getCurrentAdminShiftWindow(settings);

  if (!currentShiftWindow) {
    return false;
  }

  const ordersByWeek = new Map<string, Order[]>();
  const remainingOrders = state.ordersStore.filter((order) => {
    const createdAtTs = new Date(order.createdAt).getTime();

    if (
      !Number.isFinite(createdAtTs) ||
      createdAtTs >= currentShiftWindow.start.getTime()
    ) {
      return true;
    }

    const shiftWeekKey = getIsoWeekKey(
      getShiftWindowForTimestamp(settings, createdAtTs).start
    );
    const current = ordersByWeek.get(shiftWeekKey) ?? [];
    current.push(order);
    ordersByWeek.set(shiftWeekKey, current);
    return false;
  });

  if (remainingOrders.length === state.ordersStore.length) {
    return false;
  }

  for (const [weekKey, archivedOrders] of ordersByWeek.entries()) {
    const archive = readWeeklyArchive(weekKey);
    const mergedOrders = new Map(archive.orders.map((order) => [order.id, order] as const));

    for (const order of archivedOrders) {
      mergedOrders.set(order.id, order);
    }

    persistWeeklyArchive({
      weekKey,
      orders: [...mergedOrders.values()].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt)
      ),
      closedTableSummaries: archive.closedTableSummaries
    });
  }

  pruneWeeklyArchiveFiles();
  state.ordersStore = remainingOrders;
  return true;
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
        id: order.id,
        createdAt: order.createdAt,
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

function mapOrderToLegacyRow(order: Order): LegacyOrderRow {
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

function mapOrderToActiveRow(order: Order, restaurantId: string): ActiveOrderRow {
  return {
    id: order.id,
    restaurant_id: restaurantId,
    table_number: order.tableNumber,
    session_id: order.sessionId,
    kind: order.kind ?? "order",
    serve_mode: order.serveMode ?? null,
    status: order.status,
    restaurant_name: order.restaurantName,
    guest_contact_name: normalizeGuestContactValue(order.guestContactName) ?? null,
    guest_contact_phone: normalizeGuestContactValue(order.guestContactPhone) ?? null,
    created_at: order.createdAt,
    updated_at: order.updatedAt ?? null,
    total: order.total
  };
}

function mapOrderItemToLegacyRow(orderId: string, item: OrderItem): LegacyOrderItemRow {
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

function mapOrderItemToActiveRow(
  orderId: string,
  restaurantId: string,
  item: OrderItem
): ActiveOrderItemRow {
  const normalizedMenuItemId =
    typeof item.menuItemId === "string" && item.menuItemId.trim()
      ? item.menuItemId.trim()
      : null;

  return {
    id: item.id,
    order_id: orderId,
    restaurant_id: restaurantId,
    menu_item_id: normalizedMenuItemId,
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

function mapLegacyRowsToOrders(
  orderRows: LegacyOrderRow[],
  itemRows: LegacyOrderItemRow[]
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

function mapActiveRowsToOrders(
  orderRows: ActiveOrderRow[],
  itemRows: ActiveOrderItemRow[],
  restaurantLookup: Map<string, RestaurantRow>
): Order[] {
  const itemsByOrder = new Map<string, OrderItem[]>();

  for (const item of itemRows) {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push({
      id: item.id,
      menuItemId:
        typeof item.menu_item_id === "string" && item.menu_item_id.trim()
          ? item.menu_item_id.trim()
          : "__unknown_menu_item__",
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

  return orderRows
    .map((row) => {
      const restaurant = restaurantLookup.get(row.restaurant_id);
      const restaurantSlug = restaurant?.slug;

      if (!restaurantSlug) {
        return null;
      }

      return {
        id: row.id,
        restaurantSlug,
        restaurantName: row.restaurant_name || restaurant.name,
        tableNumber: Number(row.table_number),
        sessionId: Number(row.session_id),
        kind: row.kind === "order" ? undefined : row.kind,
        serveMode: row.serve_mode ?? undefined,
        status: row.status,
        guestContactName: normalizeGuestContactValue(row.guest_contact_name) ?? undefined,
        guestContactPhone: normalizeGuestContactValue(row.guest_contact_phone) ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? undefined,
        items: itemsByOrder.get(row.id) ?? [],
        total: Number(row.total) || 0
      } satisfies Order;
    })
    .filter(Boolean) as Order[];
}

function mapServiceRequestToRow(
  order: Order,
  restaurantId: string
): ServiceRequestRow {
  return {
    id: order.id,
    restaurant_id: restaurantId,
    table_number: order.tableNumber,
    session_id: order.sessionId,
    kind: order.kind === "bill_request" ? "bill_request" : "waiter_call",
    status: order.status,
    created_at: order.createdAt,
    updated_at: order.updatedAt ?? null
  };
}

function mapServiceRequestRowsToOrders(
  rows: ServiceRequestRow[],
  restaurantLookup: Map<string, RestaurantRow>
): Order[] {
  return rows
    .map((row) => {
      const restaurant = restaurantLookup.get(row.restaurant_id);

      if (!restaurant) {
        return null;
      }

      return {
        id: row.id,
        restaurantSlug: restaurant.slug,
        restaurantName: restaurant.name,
        tableNumber: Number(row.table_number),
        sessionId: Number(row.session_id),
        kind: row.kind,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? undefined,
        items: [],
        total: 0
      } satisfies Order;
    })
    .filter(Boolean) as Order[];
}

function mapClosedSummaryToRow(
  summary: ClosedTableSummary,
  restaurantId: string
): ClosedSessionRow {
  return {
    id: `${summary.restaurantSlug}:${summary.tableNumber}:${summary.sessionId}:${summary.closedAt}`,
    restaurant_id: restaurantId,
    table_number: summary.tableNumber,
    session_id: summary.sessionId,
    closed_at: summary.closedAt,
    total: summary.total,
    order_ids: summary.orderIds,
    orders_snapshot: summary.orders
  };
}

function mapClosedSessionRowsToSummaries(
  rows: ClosedSessionRow[],
  restaurantLookup: Map<string, RestaurantRow>
): ClosedTableSummary[] {
  return rows
    .map((row) => {
      const restaurant = restaurantLookup.get(row.restaurant_id);

      if (!restaurant) {
        return null;
      }

      const orderIds = Array.isArray(row.order_ids)
        ? row.order_ids.map((value) => String(value))
        : [];
      const orders = Array.isArray(row.orders_snapshot)
        ? (row.orders_snapshot as ClosedTableOrderSnapshot[])
        : [];

      return {
        restaurantSlug: restaurant.slug,
        restaurantName: restaurant.name,
        tableNumber: Number(row.table_number),
        sessionId: Number(row.session_id),
        closedAt: row.closed_at,
        total: Number(row.total) || 0,
        orderCount: orderIds.length || orders.length,
        orderIds,
        orders
      } satisfies ClosedTableSummary;
    })
    .filter(Boolean) as ClosedTableSummary[];
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
    (
      message.includes("orders_store") ||
      message.includes("order_items_store") ||
      message.includes("orders") ||
      message.includes("order_items") ||
      message.includes("closed_sessions") ||
      message.includes("restaurant_table_sessions") ||
      message.includes("service_requests")
    )
  );
}

async function getMenuLookupForRestaurant(restaurantSlug: string) {
  globalThis.__menuLookupCache ??= new Map();
  const cachedLookup = globalThis.__menuLookupCache.get(restaurantSlug);

  if (cachedLookup && cachedLookup.expiresAt > Date.now()) {
    return cachedLookup.lookup;
  }

  const menuItems = await getAllMenuItems(restaurantSlug);
  const lookup = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem] as const));

  globalThis.__menuLookupCache.set(restaurantSlug, {
    lookup,
    expiresAt: Date.now() + MENU_LOOKUP_CACHE_TTL_MS
  });

  return lookup;
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
    note: setCookedMarkerOnNote(item.note, noteHasCookedMarker(item.note)),
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

async function normalizeClosedTableOrderSnapshot(
  order: ClosedTableOrderSnapshot,
  menuLookup?: Map<string, MenuItem>
): Promise<ClosedTableOrderSnapshot> {
  return {
    id: order.id,
    createdAt: order.createdAt,
    items: await Promise.all(
      (order.items ?? []).map((item) => normalizeOrderItemForAdmin(item, menuLookup))
    )
  };
}

function toClosedTableOrderSnapshot(
  order: Pick<Order, "id" | "createdAt" | "items">
): ClosedTableOrderSnapshot {
  return {
    id: order.id,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({ ...item }))
  };
}

function removeClosedSessionOrdersFromActiveState(state: RuntimeState) {
  const closedOrderIds = new Set(
    state.closedTableSummaries.flatMap((summary) => summary.orderIds ?? [])
  );

  if (closedOrderIds.size === 0) {
    return false;
  }

  const nextOrders = state.ordersStore.filter((order) => !closedOrderIds.has(order.id));

  if (nextOrders.length === state.ordersStore.length) {
    return false;
  }

  state.ordersStore = nextOrders;
  return true;
}

function compactClosedTableSummaries(state: RuntimeState) {
  let changed = false;

  state.closedTableSummaries = state.closedTableSummaries.map((summary) => {
    const nextOrders = (summary.orders ?? []).map((order) => {
      const compactOrder = toClosedTableOrderSnapshot(order);

      if (
        "restaurantSlug" in order ||
        "restaurantName" in order ||
        "tableNumber" in order ||
        "sessionId" in order ||
        "status" in order ||
        "total" in order ||
        "kind" in order ||
        "updatedAt" in order ||
        "guestContactName" in order ||
        "guestContactPhone" in order ||
        "serveMode" in order
      ) {
        changed = true;
      }

      return compactOrder;
    });

    return {
      ...summary,
      orders: nextOrders
    };
  });

  return changed;
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
  const readableStorePath = existsSync(ORDERS_STORE_PATH)
    ? ORDERS_STORE_PATH
    : existsSync(BUNDLED_ORDERS_STORE_PATH)
      ? BUNDLED_ORDERS_STORE_PATH
      : null;

  if (!readableStorePath) {
    return getDefaultState();
  }

  try {
    const raw = readFileSync(readableStorePath, "utf8");
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
      if (summary && typeof summary.restaurantSlug === "string") {
        restaurantSlugs.add(summary.restaurantSlug);
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
                  normalizeClosedTableOrderSnapshot(
                    order as ClosedTableOrderSnapshot,
                    menuLookupByRestaurant.get(summary.restaurantSlug)
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
  let activeOrders: Order[] = [];
  const [
    metaResult,
    closedSessionsResult,
    tableSessionsResult,
    serviceRequestsResult,
    restaurantsResult
  ] = await Promise.all([
    supabase.from("app_state").select("value").eq("key", ORDERS_META_KEY).maybeSingle(),
    supabase.from("closed_sessions").select("*").order("closed_at", { ascending: false }),
    supabase.from("restaurant_table_sessions").select("*"),
    supabase.from("service_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("restaurants").select("id, slug, name")
  ]);

  if (metaResult.error) {
    throw new Error(metaResult.error.message);
  }
  if (closedSessionsResult.error) {
    throw new Error(closedSessionsResult.error.message);
  }
  if (tableSessionsResult.error && !isMissingTableError(tableSessionsResult.error.message)) {
    throw new Error(tableSessionsResult.error.message);
  }
  if (
    serviceRequestsResult.error &&
    !isMissingTableError(serviceRequestsResult.error.message)
  ) {
    throw new Error(serviceRequestsResult.error.message);
  }
  if (restaurantsResult.error) {
    throw new Error(restaurantsResult.error.message);
  }

  const closedSessionRows = (closedSessionsResult.data ?? []) as ClosedSessionRow[];
  const tableSessionRows = Array.isArray(tableSessionsResult.data)
    ? (tableSessionsResult.data as RestaurantTableSessionRow[])
    : [];
  const serviceRequestRows = Array.isArray(serviceRequestsResult.data)
    ? (serviceRequestsResult.data as ServiceRequestRow[])
    : [];
  const restaurantRows = (restaurantsResult.data ?? []) as RestaurantRow[];
  const restaurantLookup = new Map(
    restaurantRows.map((restaurant) => [restaurant.id, restaurant] as const)
  );

  try {
    const [ordersResult, orderItemsResult] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("order_items").select("*")
    ]);

    if (ordersResult.error) {
      throw new Error(ordersResult.error.message);
    }

    if (orderItemsResult.error) {
      throw new Error(orderItemsResult.error.message);
    }

    activeOrders = mapActiveRowsToOrders(
      (ordersResult.data ?? []) as ActiveOrderRow[],
      (orderItemsResult.data ?? []) as ActiveOrderItemRow[],
      restaurantLookup
    );
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }

    const [legacyOrdersResult, legacyOrderItemsResult] = await Promise.all([
      supabase.from("orders_store").select("*").order("created_at", { ascending: false }),
      supabase.from("order_items_store").select("*")
    ]);

    if (legacyOrdersResult.error) {
      throw new Error(legacyOrdersResult.error.message);
    }

    if (legacyOrderItemsResult.error) {
      throw new Error(legacyOrderItemsResult.error.message);
    }

    activeOrders = mapLegacyRowsToOrders(
      (legacyOrdersResult.data ?? []) as LegacyOrderRow[],
      (legacyOrderItemsResult.data ?? []) as LegacyOrderItemRow[]
    );
  }

  const defaultSessionsFromRows = [...createSessionsFromOrders(activeOrders).entries()];
  const parsedMeta = (metaResult.data?.value ?? null) as
    | Partial<OrdersMetaPersistence>
    | null;
  const currentTableSessions =
    tableSessionRows.length > 0
      ? tableSessionRows
          .map((row) => {
            const restaurant = restaurantLookup.get(row.restaurant_id);

            if (!restaurant) {
              return null;
            }

            return [
              createTableKey(restaurant.slug, Number(row.table_number)),
              Number(row.current_session_id) || 1
            ] as [string, number];
          })
          .filter(Boolean) as Array<[string, number]>
      : Array.isArray(parsedMeta?.currentTableSessions)
        ? parsedMeta.currentTableSessions
        : defaultSessionsFromRows;

  const normalized: OrdersPersistence = {
    orders:
      serviceRequestRows.length > 0
        ? [...mapServiceRequestRowsToOrders(serviceRequestRows, restaurantLookup), ...activeOrders]
        : activeOrders,
    currentTableSessions,
    closedTableSummaries:
      closedSessionRows.length > 0
        ? mapClosedSessionRowsToSummaries(closedSessionRows, restaurantLookup)
        : Array.isArray(parsedMeta?.closedTableSummaries)
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
  const standardOrders = state.ordersStore.filter(
    (order) => order.kind !== "waiter_call" && order.kind !== "bill_request"
  );
  const serviceRequestOrders = state.ordersStore.filter(
    (order) => order.kind === "waiter_call" || order.kind === "bill_request"
  );
  const orderIds = standardOrders.map((order) => order.id);
  const restaurantRowsResult = await supabase.from("restaurants").select("id, slug, name");

  if (restaurantRowsResult.error) {
    throw new Error(restaurantRowsResult.error.message);
  }

  const restaurantRows = (restaurantRowsResult.data ?? []) as RestaurantRow[];
  const restaurantIdBySlug = new Map(
    restaurantRows.map((restaurant) => [restaurant.slug, restaurant.id] as const)
  );
  const activeOrderRows = standardOrders
    .map((order) => {
      const restaurantId = restaurantIdBySlug.get(order.restaurantSlug);
      return restaurantId ? mapOrderToActiveRow(order, restaurantId) : null;
    })
    .filter(Boolean);
  const activeOrderItemRows = standardOrders.flatMap((order) => {
    const restaurantId = restaurantIdBySlug.get(order.restaurantSlug);
    return restaurantId
      ? order.items.map((item) => mapOrderItemToActiveRow(order.id, restaurantId, item))
      : [];
  });

  try {
    if (orderIds.length === 0) {
      const { error: deleteAllItemsError } = await supabase
        .from("order_items")
        .delete()
        .neq("id", "");

      if (deleteAllItemsError) {
        throw new Error(deleteAllItemsError.message);
      }

      const { error: deleteAllOrdersError } = await supabase
        .from("orders")
        .delete()
        .neq("id", "");

      if (deleteAllOrdersError) {
        throw new Error(deleteAllOrdersError.message);
      }
    } else {
      const { error: deleteItemsError } = await supabase
        .from("order_items")
        .delete()
        .in("order_id", orderIds);

      if (deleteItemsError) {
        throw new Error(deleteItemsError.message);
      }
    }

    if (activeOrderRows.length > 0) {
      const { error: upsertOrdersError } = await supabase
        .from("orders")
        .upsert(activeOrderRows, { onConflict: "id" });

      if (upsertOrdersError) {
        throw new Error(upsertOrdersError.message);
      }

      const { data: existingRows, error: existingRowsError } = await supabase
        .from("orders")
        .select("id");

      if (existingRowsError) {
        throw new Error(existingRowsError.message);
      }

      const staleIds = (existingRows ?? [])
        .map((row) => String((row as { id: string }).id))
        .filter((id) => !orderIds.includes(id));

      if (staleIds.length > 0) {
        const { error: deleteStaleOrdersError } = await supabase
          .from("orders")
          .delete()
          .in("id", staleIds);

        if (deleteStaleOrdersError) {
          throw new Error(deleteStaleOrdersError.message);
        }
      }
    }

    if (activeOrderItemRows.length > 0) {
      const { error: upsertItemsError } = await supabase
        .from("order_items")
        .upsert(activeOrderItemRows, { onConflict: "id" });

      if (upsertItemsError) {
        throw new Error(upsertItemsError.message);
      }
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }

    const legacyOrderRows = standardOrders.map(mapOrderToLegacyRow);
    const legacyOrderItemRows = standardOrders.flatMap((order) =>
      order.items.map((item) => mapOrderItemToLegacyRow(order.id, item))
    );

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

    if (legacyOrderRows.length > 0) {
      const { error: upsertOrdersError } = await supabase
        .from("orders_store")
        .upsert(legacyOrderRows, { onConflict: "order_id" });

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

    if (legacyOrderItemRows.length > 0) {
      const { error: upsertItemsError } = await supabase
        .from("order_items_store")
        .upsert(legacyOrderItemRows, { onConflict: "id" });

      if (upsertItemsError) {
        throw new Error(upsertItemsError.message);
      }
    }
  }

  const serviceRequestRows = serviceRequestOrders
    .map((order) => {
      const restaurantId = restaurantIdBySlug.get(order.restaurantSlug);
      return restaurantId ? mapServiceRequestToRow(order, restaurantId) : null;
    })
    .filter(Boolean);

  try {
    if (serviceRequestRows.length === 0) {
      const { error: deleteServiceRequestsError } = await supabase
        .from("service_requests")
        .delete()
        .neq("id", "");

      if (
        deleteServiceRequestsError &&
        !isMissingTableError(deleteServiceRequestsError.message)
      ) {
        throw new Error(deleteServiceRequestsError.message);
      }
    } else {
      const { error: upsertServiceRequestsError } = await supabase
        .from("service_requests")
        .upsert(serviceRequestRows, { onConflict: "id" });

      if (
        upsertServiceRequestsError &&
        !isMissingTableError(upsertServiceRequestsError.message)
      ) {
        throw new Error(upsertServiceRequestsError.message);
      }

      const { data: existingServiceRequestRows, error: existingServiceRequestsError } =
        await supabase.from("service_requests").select("id");

      if (
        existingServiceRequestsError &&
        !isMissingTableError(existingServiceRequestsError.message)
      ) {
        throw new Error(existingServiceRequestsError.message);
      }

      const currentServiceRequestIds = serviceRequestRows.map((row) => row!.id);
      const staleServiceRequestIds = (existingServiceRequestRows ?? [])
        .map((row) => String((row as { id: string }).id))
        .filter((id) => !currentServiceRequestIds.includes(id));

      if (staleServiceRequestIds.length > 0) {
        const { error: deleteStaleServiceRequestsError } = await supabase
          .from("service_requests")
          .delete()
          .in("id", staleServiceRequestIds);

        if (
          deleteStaleServiceRequestsError &&
          !isMissingTableError(deleteStaleServiceRequestsError.message)
        ) {
          throw new Error(deleteStaleServiceRequestsError.message);
        }
      }
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  const closedSessionRows = state.closedTableSummaries
    .map((summary) => {
      const restaurantId = restaurantIdBySlug.get(summary.restaurantSlug);
      return restaurantId ? mapClosedSummaryToRow(summary, restaurantId) : null;
    })
    .filter(Boolean);

  if (closedSessionRows.length === 0) {
    const { error: deleteClosedSessionsError } = await supabase
      .from("closed_sessions")
      .delete()
      .neq("id", "");

    if (deleteClosedSessionsError) {
      throw new Error(deleteClosedSessionsError.message);
    }
  } else {
    const { error: upsertClosedSessionsError } = await supabase
      .from("closed_sessions")
      .upsert(closedSessionRows, { onConflict: "id" });

    if (upsertClosedSessionsError) {
      throw new Error(upsertClosedSessionsError.message);
    }

    const { data: existingClosedSessionRows, error: existingClosedSessionsError } =
      await supabase.from("closed_sessions").select("id");

    if (existingClosedSessionsError) {
      throw new Error(existingClosedSessionsError.message);
    }

    const currentClosedSessionIds = closedSessionRows.map((row) => row!.id);
    const staleClosedSessionIds = (existingClosedSessionRows ?? [])
      .map((row) => String((row as { id: string }).id))
      .filter((id) => !currentClosedSessionIds.includes(id));

    if (staleClosedSessionIds.length > 0) {
      const { error: deleteStaleClosedSessionsError } = await supabase
        .from("closed_sessions")
        .delete()
        .in("id", staleClosedSessionIds);

      if (deleteStaleClosedSessionsError) {
        throw new Error(deleteStaleClosedSessionsError.message);
      }
    }
  }

  const tableSessionRows = [...state.currentTableSessions.entries()]
    .map(([key, currentSessionId]) => {
      const [restaurantSlug, tableNumberRaw] = key.split(":");
      const restaurantId = restaurantIdBySlug.get(restaurantSlug);
      const tableNumber = Number.parseInt(tableNumberRaw ?? "", 10);

      if (!restaurantId || !Number.isFinite(tableNumber)) {
        return null;
      }

      return {
        restaurant_id: restaurantId,
        table_number: tableNumber,
        current_session_id: currentSessionId
      };
    })
    .filter(Boolean);
  let tableSessionsStoredInDedicatedTable = false;

  try {
    if (tableSessionRows.length === 0) {
      const { error: deleteTableSessionsError } = await supabase
        .from("restaurant_table_sessions")
        .delete()
        .neq("table_number", -1);

      if (deleteTableSessionsError && !isMissingTableError(deleteTableSessionsError.message)) {
        throw new Error(deleteTableSessionsError.message);
      }

      if (!deleteTableSessionsError) {
        tableSessionsStoredInDedicatedTable = true;
      }
    } else {
      const { error: upsertTableSessionsError } = await supabase
        .from("restaurant_table_sessions")
        .upsert(tableSessionRows, { onConflict: "restaurant_id,table_number" });

      if (upsertTableSessionsError && !isMissingTableError(upsertTableSessionsError.message)) {
        throw new Error(upsertTableSessionsError.message);
      }

      if (!upsertTableSessionsError) {
        tableSessionsStoredInDedicatedTable = true;
      }
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  if (!tableSessionsStoredInDedicatedTable) {
    const { error: metaError } = await supabase.from("app_state").upsert(
      {
        key: ORDERS_META_KEY,
        value: {
          currentTableSessions: toOrdersMetaPersistence(state).currentTableSessions,
          closedTableSummaries: []
        },
        updated_at: new Date().toISOString()
      },
      { onConflict: "key" }
    );

    if (metaError) {
      throw new Error(metaError.message);
    }
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
  const completedShiftOrdersArchived = archiveCompletedShiftsForNewActiveShift(
    state,
    settings
  );
  const staleClosedSummariesPruned = await pruneClosedTableSummariesByWorkingDay(
    state
  );
  const activeOrdersTrimmed = removeClosedSessionOrdersFromActiveState(state);
  const closedSummariesCompacted = compactClosedTableSummaries(state);

  if (
    expiredShiftOrdersClosed ||
    staleServiceRequestsClosed ||
    shiftedSessionsRotated ||
    completedShiftOrdersArchived ||
    staleClosedSummariesPruned ||
    activeOrdersTrimmed ||
    closedSummariesCompacted
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

  const payload = buildOrdersPersistencePayload(state);
  const serializedPayload = JSON.stringify(payload, null, 2);
  const previousPayload =
    globalThis.__ordersPersistedPayload ??
    (existsSync(ORDERS_STORE_PATH) ? readFileSync(ORDERS_STORE_PATH, "utf8") : undefined);

  if (previousPayload !== serializedPayload) {
    writeFileSync(ORDERS_STORE_PATH, serializedPayload, "utf8");
    globalThis.__ordersPersistedPayload = serializedPayload;
  }

  setOrdersStateCache(payload);
}

async function persistStateAsync(state: RuntimeState) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    persistState(state);
    return;
  }

  const payload = buildOrdersPersistencePayload(state);

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

async function mergeOrderItems(
  order: Order,
  nextItems: OrderItem[],
  menuLookup?: Map<string, MenuItem>
) {
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
  return normalizeOrderState(order, menuLookup);
}

async function normalizeOrderState(
  order: Order,
  menuLookup?: Map<string, MenuItem>
) {
  const resolvedMenuLookup =
    menuLookup ?? (await getMenuLookupForRestaurant(order.restaurantSlug));
  order.items = await Promise.all(
    order.items.map((item) => normalizeOrderItemForAdmin(item, resolvedMenuLookup))
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
  const shiftWindow = getCurrentAdminShiftWindow(
    await getMenuSettings(restaurantSlug)
  );

  return ordersStore
    .filter((order) => {
      if (restaurantSlug && order.restaurantSlug !== restaurantSlug) {
        return false;
      }

      return (
        order.status !== "served" &&
        order.status !== "cancelled" &&
        (!shiftWindow || isOrderWithinAdminShiftWindow(order, shiftWindow))
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

    return normalizeOrderState(repeatedPayloadOrder, menuLookup);
  }

  const existingNewOrder = state.ordersStore.find(
    (order) =>
      order.restaurantSlug === restaurant.slug &&
      order.tableNumber === input.tableNumber &&
      order.sessionId === sessionId &&
      order.kind !== "waiter_call" &&
      order.kind !== "bill_request" &&
      order.status === "new" &&
      Date.now() - new Date(order.createdAt).getTime() < MERGE_ORDER_WINDOW_MS
  );

  if (
    existingNewOrder &&
    !hasGuestContactConflict(existingNewOrder, {
      guestContactName: input.guestContactName,
      guestContactPhone: input.guestContactPhone
    })
  ) {
    const mergedOrder = await mergeOrderItems(existingNewOrder, items, menuLookup);

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
  order.updatedAt = new Date().toISOString();

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
  order.updatedAt = new Date().toISOString();
  const normalizedOrder = await normalizeOrderState(order);
  await persistStateAsync(state);

  return normalizedOrder;
}

export async function updateOrderCooked(orderId: string, cooked: boolean) {
  const state = await readRuntimeStateAsync();
  const order = state.ordersStore.find((item) => item.id === orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.kind === "waiter_call" || order.kind === "bill_request") {
    throw new Error("Service request cannot be marked as cooked");
  }

  if (order.status === "served" || order.status === "cancelled") {
    throw new Error("Closed order cannot be updated");
  }

  order.items = order.items.map((item) => ({
    ...item,
    note: setCookedMarkerOnNote(item.note, cooked)
  }));

  if (cooked && order.status === "new") {
    order.status = "preparing";
  }

  order.updatedAt = new Date().toISOString();

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
    orders: orders.map((order) => toClosedTableOrderSnapshot(order))
  };

  state.closedTableSummaries.unshift(summary);
  state.ordersStore = state.ordersStore.filter((order) => !summary.orderIds.includes(order.id));
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
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       