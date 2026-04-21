import { randomBytes, createHash } from "node:crypto";
import { initialOrders } from "@/lib/mock-data";
import {
  getMenuSettings,
  PromotionSettings
} from "@/lib/menu-settings";
import type { MenuSettings } from "@/lib/menu-settings";
import {
  ClosedTableOrderSnapshot,
  CartItem,
  ClosedTableSummary,
  MenuCategory,
  MenuItem,
  OrderChannel,
  Order,
  OrderItem,
  OrderStatus,
  ServeMode,
  TableOverview
} from "@/lib/types";
import { getRestaurantBySlug, getRestaurants } from "@/lib/restaurants";
import { getAllMenuItems, getMenuItemById } from "@/lib/menu-store";
import {
  agorotToShekels,
  calculatePercentDiscountAgorot,
  multiplyAgorot,
  percentToBps,
  shekelsToAgorot
} from "@/lib/money";
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
  total_agorot?: number;
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
  order_channel?: string | null;
  display_order_number?: string | null;
  guest_token_hash?: string | null;
  guest_contact_name: string | null;
  guest_contact_phone: string | null;
  created_at: string;
  updated_at: string | null;
  total: number;
  total_agorot?: number | null;
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
  price_agorot?: number;
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
  price_agorot?: number | null;
};

type ClosedSessionRow = {
  id: string;
  restaurant_id: string;
  table_number: number;
  session_id: number;
  closed_at: string;
  total: number;
  total_agorot?: number | null;
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
const CLOSED_SESSIONS_RECONCILE_INTERVAL_MS = 2 * 60 * 1000;
const CLOSED_SESSIONS_RECONCILE_MAX_WRITES = 25;
const ORDERS_STATE_KEY = "orders-state";
const ORDERS_META_KEY = "orders-meta";
const ORDERS_STATE_CACHE_TTL_MS = 10_000;
const MENU_LOOKUP_CACHE_TTL_MS = 60 * 1000;
const ORDER_REQUEST_CACHE_TTL_MS = 10 * 60 * 1000;
const ORDER_PAYLOAD_DEDUP_WINDOW_MS = 3 * 1000;
const MERGE_ORDER_WINDOW_MS = 3 * 60 * 1000;
const SHIFT_CLOSE_GRACE_MS = 60 * 60 * 1000;
const LEGACY_COOKED_MARKER = "__menu_order_cooked__";
const KITCHEN_READY_MARKER = "__menu_order_kitchen_ready__";
const BAR_READY_MARKER = "__menu_order_bar_ready__";
const MAX_WEEKLY_ARCHIVE_FILES = 4;
const ORDERS_DEBUG_ENABLED = ["1", "true", "yes", "on"].includes(
  (process.env.DEBUG_ORDERS_STATE ?? "").toLowerCase()
);
const BAR_CATEGORIES = new Set<MenuCategory>([
  "drinks",
  "fluids",
  "draft",
  "bottled",
  "fuel",
  "whiskey",
  "vodka",
  "rum",
  "cognac",
  "gin",
  "tequila",
  "absent",
  "ouzo",
  "likers",
  "alcohol",
  "cocktails",
  "chasers",
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks"
]);

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

type PersistSignatureTableCache = {
  primed: boolean;
  signatures: Map<string, string>;
  lastReconcileAt: number;
  writesSinceReconcile: number;
};

type OrdersPersistSignatureCache = {
  orders: PersistSignatureTableCache;
  orderItems: PersistSignatureTableCache;
  serviceRequests: PersistSignatureTableCache;
  closedSessions: PersistSignatureTableCache;
};

function logOrdersDebug(event: string, payload?: Record<string, unknown>) {
  if (!ORDERS_DEBUG_ENABLED) {
    return;
  }

  console.info("[orders-debug]", event, {
    at: new Date().toISOString(),
    ...(payload ?? {})
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __ordersStateCache: OrdersStateCacheEntry | undefined;
  // eslint-disable-next-line no-var
  var __ordersStateLoadPromise: Promise<OrdersPersistence> | undefined;
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
          orderChannel: OrderChannel;
          guestTokenHash?: string;
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
          orderChannel: OrderChannel;
          guestTokenHash?: string;
          payloadSignature: string;
          expiresAt: number;
        }
      >
    | undefined;
  // eslint-disable-next-line no-var
  var __ordersPersistSignatureCache: OrdersPersistSignatureCache | undefined;
}

function createTableKey(restaurantSlug: string, tableNumber: number) {
  return `${restaurantSlug}:${tableNumber}`;
}

function createPersistSignature(value: unknown) {
  return JSON.stringify(value);
}

function createPersistSignatureTableCache(): PersistSignatureTableCache {
  return {
    primed: false,
    signatures: new Map<string, string>(),
    lastReconcileAt: 0,
    writesSinceReconcile: 0
  };
}

function shouldRunClosedSessionsReconcile(cache: PersistSignatureTableCache) {
  if (!cache.primed) {
    return true;
  }

  const now = Date.now();

  if (now - cache.lastReconcileAt >= CLOSED_SESSIONS_RECONCILE_INTERVAL_MS) {
    return true;
  }

  return cache.writesSinceReconcile >= CLOSED_SESSIONS_RECONCILE_MAX_WRITES;
}

function getOrdersPersistSignatureCache(): OrdersPersistSignatureCache {
  if (!globalThis.__ordersPersistSignatureCache) {
    globalThis.__ordersPersistSignatureCache = {
      orders: createPersistSignatureTableCache(),
      orderItems: createPersistSignatureTableCache(),
      serviceRequests: createPersistSignatureTableCache(),
      closedSessions: createPersistSignatureTableCache()
    };
  }

  return globalThis.__ordersPersistSignatureCache;
}

function buildSignatureMap<Row>(
  rows: Row[],
  getId: (row: Row) => string
) {
  const signatures = new Map<string, string>();

  for (const row of rows) {
    signatures.set(getId(row), createPersistSignature(row));
  }

  return signatures;
}

function getChangedRows<Row>(
  rows: Row[],
  getId: (row: Row) => string,
  tableCache: PersistSignatureTableCache
) {
  const nextSignatures = buildSignatureMap(rows, getId);

  if (!tableCache.primed) {
    return {
      rowsToUpsert: rows,
      staleIdsFromCache: [] as string[],
      nextSignatures
    };
  }

  const rowsToUpsert: Row[] = [];

  for (const row of rows) {
    const id = getId(row);
    const nextSignature = nextSignatures.get(id);
    const previousSignature = tableCache.signatures.get(id);

    if (!nextSignature || nextSignature !== previousSignature) {
      rowsToUpsert.push(row);
    }
  }

  const staleIdsFromCache: string[] = [];

  for (const previousId of tableCache.signatures.keys()) {
    if (!nextSignatures.has(previousId)) {
      staleIdsFromCache.push(previousId);
    }
  }

  return {
    rowsToUpsert,
    staleIdsFromCache,
    nextSignatures
  };
}

function normalizeOrderChannelValue(
  value: unknown,
  fallbackTableNumber?: number
): OrderChannel {
  if (value === "counter") {
    return "counter";
  }

  if (value === "table") {
    return "table";
  }

  if (typeof fallbackTableNumber === "number" && fallbackTableNumber <= 0) {
    return "counter";
  }

  return "table";
}

function normalizeOrderItemNoteValue(note: string | undefined) {
  return typeof note === "string" && note.trim() ? note.trim() : "";
}

function parseReadyMarkersFromNote(note: string | undefined) {
  const normalized = normalizeOrderItemNoteValue(note);
  const hasKitchenReady =
    normalized.includes(KITCHEN_READY_MARKER) ||
    normalized.includes(LEGACY_COOKED_MARKER);
  const hasBarReady = normalized.includes(BAR_READY_MARKER);
  const base = normalized
    .replaceAll(KITCHEN_READY_MARKER, "")
    .replaceAll(LEGACY_COOKED_MARKER, "")
    .replaceAll(BAR_READY_MARKER, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    base,
    hasKitchenReady,
    hasBarReady
  };
}

function composeNoteWithReadyMarkers(input: {
  base: string;
  hasKitchenReady: boolean;
  hasBarReady: boolean;
}) {
  const markers = [
    input.hasKitchenReady ? KITCHEN_READY_MARKER : null,
    input.hasBarReady ? BAR_READY_MARKER : null
  ].filter(Boolean);
  const next = [input.base, ...markers].filter(Boolean).join(" ").trim();
  return next || undefined;
}

function isBarCategory(category: MenuCategory | undefined) {
  return category ? BAR_CATEGORIES.has(category) : false;
}

function isItemInReadyStation(
  item: Pick<OrderItem, "category">,
  station: "kitchen" | "bar"
) {
  return station === "bar" ? isBarCategory(item.category) : !isBarCategory(item.category);
}

function noteHasBarReadyMarker(note: string | undefined) {
  return parseReadyMarkersFromNote(note).hasBarReady;
}

function noteHasCookedMarker(note: string | undefined) {
  return parseReadyMarkersFromNote(note).hasKitchenReady;
}

function setCookedMarkerOnNote(note: string | undefined, cooked: boolean) {
  return setStationReadyMarkerOnNote(note, "kitchen", cooked);
}

function setStationReadyMarkerOnNote(
  note: string | undefined,
  station: "kitchen" | "bar",
  ready: boolean
) {
  const parsed = parseReadyMarkersFromNote(note);
  const hasKitchenReady =
    station === "kitchen" ? ready : parsed.hasKitchenReady;
  const hasBarReady = station === "bar" ? ready : parsed.hasBarReady;

  return composeNoteWithReadyMarkers({
    base: parsed.base,
    hasKitchenReady,
    hasBarReady
  });
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

function getMostRecentCompletedAdminShiftWindow(
  settings: MenuSettingsSnapshot,
  now = new Date()
): ShiftWindow | null {
  const candidates = [
    getShiftWindowForDate(settings, addDays(now, -2)),
    getShiftWindowForDate(settings, addDays(now, -1)),
    getShiftWindowForDate(settings, now)
  ]
    .filter((candidate) => candidate.end.getTime() <= now.getTime())
    .sort((left, right) => right.end.getTime() - left.end.getTime());

  return candidates[0] ?? null;
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
  tableNumber: number,
  orderChannel: OrderChannel,
  guestTokenHash?: string
) {
  const cache = getOrderRequestCache();
  const entry = cache.get(clientRequestId);

  if (!entry) {
    return null;
  }

  if (
    entry.restaurantSlug !== restaurantSlug ||
    entry.tableNumber !== tableNumber ||
    entry.orderChannel !== orderChannel ||
    (entry.guestTokenHash ?? "") !== (guestTokenHash ?? "")
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
  tableNumber: number,
  orderChannel: OrderChannel,
  guestTokenHash?: string
) {
  getOrderRequestCache().set(clientRequestId, {
    orderId: order.id,
    restaurantSlug,
    tableNumber,
    orderChannel,
    guestTokenHash,
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
          : null,
      sortKey: [
        item.menuItemId,
        item.quantity,
        item.note?.trim() ?? "",
        item.volumeOptionId ?? "",
        item.volumeLabel ?? "",
        typeof item.priceOverride === "number" && Number.isFinite(item.priceOverride)
          ? String(item.priceOverride)
          : ""
      ].join("|")
    }))
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map(({ sortKey: _sortKey, ...item }) => item);

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
  payloadSignature: string,
  orderChannel: OrderChannel,
  guestTokenHash?: string
) {
  for (const entry of getRecentOrderPayloadCache().values()) {
    if (
      entry.restaurantSlug !== restaurantSlug ||
      entry.tableNumber !== tableNumber ||
      entry.sessionId !== sessionId ||
      entry.orderChannel !== orderChannel ||
      (entry.guestTokenHash ?? "") !== (guestTokenHash ?? "") ||
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
  payloadSignature: string,
  orderChannel: OrderChannel,
  guestTokenHash?: string
) {
  const cache = getRecentOrderPayloadCache();
  const cacheKey = `${restaurantSlug}:${tableNumber}:${sessionId}:${order.id}`;

  cache.set(cacheKey, {
    orderId: order.id,
    restaurantSlug,
    tableNumber,
    sessionId,
    orderChannel,
    guestTokenHash,
    payloadSignature,
    expiresAt: Date.now() + ORDER_PAYLOAD_DEDUP_WINDOW_MS
  });
}

function normalizeGuestContactValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeGuestTokenValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 256)
    : undefined;
}

function hashGuestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeOrderNumberPrefix(value: string | null | undefined) {
  const cleaned =
    typeof value === "string"
      ? value.trim().slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, "")
      : "";
  return cleaned || "ORD";
}

function generateDisplayOrderNumber(prefix: string) {
  const normalizedPrefix = normalizeOrderNumberPrefix(prefix);
  const now = new Date();
  const datePart = `${now.getFullYear().toString().slice(-2)}${String(
    now.getMonth() + 1
  ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const timePart = `${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes()
  ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const entropyPart = randomBytes(2).toString("hex").toUpperCase();

  return `${normalizedPrefix}-${datePart}-${timePart}${entropyPart}`;
}

function calculateOrderItemsTotal(items: OrderItem[]) {
  const totalAgorot = items.reduce(
    (sum, item) => sum + multiplyAgorot(shekelsToAgorot(item.price), item.quantity),
    0
  );
  return agorotToShekels(totalAgorot);
}

function getEffectiveOrderTotal(order: Pick<Order, "kind" | "items" | "total">) {
  if (order.kind === "waiter_call" || order.kind === "bill_request") {
    return 0;
  }

  return calculateOrderItemsTotal(order.items ?? []);
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
    total: order.total,
    total_agorot: shekelsToAgorot(order.total)
  };
}

function mapOrderToActiveRow(order: Order, restaurantId: string): ActiveOrderRow {
  const orderChannel = normalizeOrderChannelValue(order.orderChannel, order.tableNumber);

  return {
    id: order.id,
    restaurant_id: restaurantId,
    table_number: order.tableNumber,
    session_id: order.sessionId,
    kind: order.kind ?? "order",
    serve_mode: order.serveMode ?? null,
    status: order.status,
    restaurant_name: order.restaurantName,
    order_channel: orderChannel,
    display_order_number:
      typeof order.displayOrderNumber === "string" && order.displayOrderNumber.trim()
        ? order.displayOrderNumber.trim()
        : null,
    guest_token_hash:
      typeof order.guestTokenHash === "string" && order.guestTokenHash.trim()
        ? order.guestTokenHash.trim()
        : null,
    guest_contact_name: normalizeGuestContactValue(order.guestContactName) ?? null,
    guest_contact_phone: normalizeGuestContactValue(order.guestContactPhone) ?? null,
    created_at: order.createdAt,
    updated_at: order.updatedAt ?? null,
    total: order.total,
    total_agorot: shekelsToAgorot(order.total)
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
    price_agorot: shekelsToAgorot(item.price),
    quantity: item.quantity,
    note: item.note ?? null,
    served: item.served
  };
}

function getMoneyFromPersistedRow(
  value: unknown,
  agorotValue?: unknown
) {
  if (typeof agorotValue === "number" && Number.isFinite(agorotValue)) {
    return agorotToShekels(Math.trunc(agorotValue));
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    price_agorot: shekelsToAgorot(item.price),
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
      price: getMoneyFromPersistedRow(item.price, item.price_agorot),
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
    orderChannel: normalizeOrderChannelValue(undefined, Number(row.table_number)),
    kind: row.kind === "order" ? undefined : row.kind,
    serveMode: row.serve_mode ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    items: itemsByOrder.get(row.order_id) ?? [],
    total: getMoneyFromPersistedRow(row.total, row.total_agorot)
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
      price: getMoneyFromPersistedRow(item.price, item.price_agorot),
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
        orderChannel: normalizeOrderChannelValue(
          row.order_channel,
          Number(row.table_number)
        ),
        displayOrderNumber:
          typeof row.display_order_number === "string" &&
          row.display_order_number.trim()
            ? row.display_order_number.trim()
            : undefined,
        guestTokenHash:
          typeof row.guest_token_hash === "string" && row.guest_token_hash.trim()
            ? row.guest_token_hash.trim()
            : undefined,
        kind: row.kind === "order" ? undefined : row.kind,
        serveMode: row.serve_mode ?? undefined,
        status: row.status,
        guestContactName: normalizeGuestContactValue(row.guest_contact_name) ?? undefined,
        guestContactPhone: normalizeGuestContactValue(row.guest_contact_phone) ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? undefined,
        items: itemsByOrder.get(row.id) ?? [],
        total: getMoneyFromPersistedRow(row.total, row.total_agorot)
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
        orderChannel: "table",
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
    id: getClosedSummaryPersistenceId(summary),
    restaurant_id: restaurantId,
    table_number: summary.tableNumber,
    session_id: summary.sessionId,
    closed_at: normalizeTimestampToIso(summary.closedAt),
    total: summary.total,
    total_agorot: shekelsToAgorot(summary.total),
    order_ids: summary.orderIds,
    orders_snapshot: summary.orders
  };
}

function normalizeTimestampToIso(value: string) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp).toISOString();
}

function getClosedSummaryPersistenceId(
  summary: Pick<
    ClosedTableSummary,
    "restaurantSlug" | "tableNumber" | "sessionId"
  >
) {
  return `${summary.restaurantSlug}:${summary.tableNumber}:${summary.sessionId}`;
}

function sortClosedTableSummariesDesc(summaries: ClosedTableSummary[]) {
  return [...summaries].sort((left, right) => {
    const leftTs = new Date(left.closedAt).getTime();
    const rightTs = new Date(right.closedAt).getTime();
    const safeLeftTs = Number.isFinite(leftTs) ? leftTs : 0;
    const safeRightTs = Number.isFinite(rightTs) ? rightTs : 0;
    return safeRightTs - safeLeftTs;
  });
}

function pickPreferredClosedSummary(
  current: ClosedTableSummary,
  candidate: ClosedTableSummary
) {
  const currentTs = new Date(current.closedAt).getTime();
  const candidateTs = new Date(candidate.closedAt).getTime();

  if (Number.isFinite(candidateTs) && Number.isFinite(currentTs)) {
    if (candidateTs > currentTs) {
      return candidate;
    }

    if (candidateTs < currentTs) {
      return current;
    }
  } else if (Number.isFinite(candidateTs) && !Number.isFinite(currentTs)) {
    return candidate;
  }

  const currentOrderIdsCount = Array.isArray(current.orderIds) ? current.orderIds.length : 0;
  const candidateOrderIdsCount = Array.isArray(candidate.orderIds)
    ? candidate.orderIds.length
    : 0;

  if (candidateOrderIdsCount > currentOrderIdsCount) {
    return candidate;
  }

  if (candidateOrderIdsCount < currentOrderIdsCount) {
    return current;
  }

  return shekelsToAgorot(candidate.total) >= shekelsToAgorot(current.total)
    ? candidate
    : current;
}

function mergeClosedTableSummaries(
  ...summaryGroups: ClosedTableSummary[][]
): ClosedTableSummary[] {
  const merged = new Map<string, ClosedTableSummary>();

  for (const group of summaryGroups) {
    for (const summary of group) {
      const id = getClosedSummaryPersistenceId(summary);
      const existing = merged.get(id);

      if (!existing) {
        merged.set(id, summary);
        continue;
      }

      merged.set(id, pickPreferredClosedSummary(existing, summary));
    }
  }

  return sortClosedTableSummariesDesc([...merged.values()]);
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
        closedAt: normalizeTimestampToIso(row.closed_at),
        total: getMoneyFromPersistedRow(row.total, row.total_agorot),
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

function isMissingOrderAdvancedColumnError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    message.includes("column") &&
    (
      message.includes("order_channel") ||
      message.includes("display_order_number") ||
      message.includes("guest_token_hash")
    ) &&
    message.includes("does not exist")
  );
}

function isMissingMoneyColumnError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    message.includes("column") &&
    (message.includes("total_agorot") || message.includes("price_agorot")) &&
    message.includes("does not exist")
  );
}

function isInvalidIntegerMoneyInputError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    message.includes("invalid input syntax for type integer") &&
    /\"-?\d+\.\d+\"/.test(message)
  );
}

function toIntegerMoneyValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value);
}

function toLegacyCompatibleActiveOrderRow(row: ActiveOrderRow) {
  const {
    order_channel: _orderChannel,
    display_order_number: _displayOrderNumber,
    guest_token_hash: _guestTokenHash,
    total_agorot: _totalAgorot,
    ...legacyCompatibleRow
  } = row;

  return legacyCompatibleRow;
}

function toLegacyCompatibleActiveOrderItemRow(row: ActiveOrderItemRow) {
  const { price_agorot: _priceAgorot, ...legacyCompatibleRow } = row;
  return legacyCompatibleRow;
}

function toLegacyCompatibleLegacyOrderRow(row: LegacyOrderRow) {
  const { total_agorot: _totalAgorot, ...legacyCompatibleRow } = row;
  return legacyCompatibleRow;
}

function toLegacyCompatibleLegacyOrderItemRow(row: LegacyOrderItemRow) {
  const { price_agorot: _priceAgorot, ...legacyCompatibleRow } = row;
  return legacyCompatibleRow;
}

function toLegacyCompatibleClosedSessionRow(row: ClosedSessionRow) {
  const { total_agorot: _totalAgorot, ...legacyCompatibleRow } = row;
  return legacyCompatibleRow;
}

function toIntegerCompatibleActiveOrderRow(row: ActiveOrderRow): ActiveOrderRow {
  return {
    ...row,
    total: toIntegerMoneyValue(row.total)
  };
}

function toIntegerCompatibleLegacyOrderRow(row: LegacyOrderRow): LegacyOrderRow {
  return {
    ...row,
    total: toIntegerMoneyValue(row.total)
  };
}

function toIntegerCompatibleActiveOrderItemRow(
  row: ActiveOrderItemRow
): ActiveOrderItemRow {
  return {
    ...row,
    price: toIntegerMoneyValue(row.price)
  };
}

function toIntegerCompatibleLegacyOrderItemRow(
  row: LegacyOrderItemRow
): LegacyOrderItemRow {
  return {
    ...row,
    price: toIntegerMoneyValue(row.price)
  };
}

function toIntegerCompatibleClosedSessionRow(row: ClosedSessionRow): ClosedSessionRow {
  return {
    ...row,
    total: toIntegerMoneyValue(row.total)
  };
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
    total: calculateOrderItemsTotal(items)
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

function dedupeClosedTableSummaries(state: RuntimeState) {
  const merged = mergeClosedTableSummaries(state.closedTableSummaries);

  if (merged.length === state.closedTableSummaries.length) {
    return false;
  }

  const removedCount = state.closedTableSummaries.length - merged.length;
  state.closedTableSummaries = merged;
  logOrdersDebug("dedupeClosedTableSummaries.removed", {
    removedCount
  });
  return true;
}

function pruneCorruptedEmptyClosedSummaries(state: RuntimeState) {
  const nextSummaries = state.closedTableSummaries.filter((summary) => {
    const hasOrderIds = Array.isArray(summary.orderIds) && summary.orderIds.length > 0;
    const hasOrders = Array.isArray(summary.orders) && summary.orders.length > 0;
    const hasOrderCount = Number(summary.orderCount) > 0;
    const hasNonZeroTotal = Number(summary.total) > 0;

    return hasOrderIds || hasOrders || hasOrderCount || hasNonZeroTotal;
  });

  if (nextSummaries.length === state.closedTableSummaries.length) {
    return false;
  }

  const removed = state.closedTableSummaries.length - nextSummaries.length;
  state.closedTableSummaries = nextSummaries;
  logOrdersDebug("pruneCorruptedEmptyClosedSummaries.removed", {
    removedCount: removed
  });
  return true;
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

    const billableOrders = sessionOrders.filter(
      (order) => order.kind !== "waiter_call" && order.kind !== "bill_request"
    );
    const referenceOrder = billableOrders[0] ?? sessionOrders[0];

    if (referenceOrder) {
      const referenceCreatedAtTs = new Date(referenceOrder.createdAt).getTime();
      const referenceShiftWindow = Number.isFinite(referenceCreatedAtTs)
        ? getShiftWindowForTimestamp(settings, referenceCreatedAtTs)
        : null;
      const closedAtIso = referenceShiftWindow
        ? referenceShiftWindow.end.toISOString()
        : new Date().toISOString();
      const summary: ClosedTableSummary = {
        restaurantSlug: referenceOrder.restaurantSlug,
        restaurantName: referenceOrder.restaurantName,
        tableNumber: referenceOrder.tableNumber,
        sessionId,
        closedAt: closedAtIso,
        total: agorotToShekels(
          billableOrders.reduce(
            (sum, order) => sum + shekelsToAgorot(getEffectiveOrderTotal(order)),
            0
          )
        ),
        orderCount: billableOrders.length,
        orderIds: billableOrders.map((order) => order.id),
        orders: billableOrders.map((order) => toClosedTableOrderSnapshot(order))
      };
      const summaryId = getClosedSummaryPersistenceId(summary);
      const hasSummary = state.closedTableSummaries.some(
        (existingSummary) => getClosedSummaryPersistenceId(existingSummary) === summaryId
      );

      if (!hasSummary && summary.orderIds.length > 0) {
        state.closedTableSummaries.unshift(summary);
        logOrdersDebug("rotateSessionsForNewShift.auto_closed_session", {
          restaurantSlug: summary.restaurantSlug,
          tableNumber: summary.tableNumber,
          sessionId: summary.sessionId,
          closedAt: summary.closedAt,
          orderIdsCount: summary.orderIds.length,
          summaryTotal: summary.total
        });
        changed = true;
      }

      if (
        closeServiceRequestsForSession(
          state,
          referenceOrder.restaurantSlug,
          referenceOrder.tableNumber,
          sessionId
        )
      ) {
        changed = true;
      }
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
    supabase
      .from("closed_sessions")
      .select(
        "id, restaurant_id, table_number, session_id, closed_at, total, total_agorot, order_ids, orders_snapshot"
      )
      .order("closed_at", { ascending: false }),
    supabase
      .from("restaurant_table_sessions")
      .select("restaurant_id, table_number, current_session_id"),
    supabase
      .from("service_requests")
      .select("id, restaurant_id, table_number, session_id, kind, status, created_at, updated_at")
      .order("created_at", { ascending: false }),
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
      supabase
        .from("orders")
        .select(
          "id, restaurant_id, table_id, table_number, session_id, kind, serve_mode, status, restaurant_name, order_channel, display_order_number, guest_token_hash, guest_contact_name, guest_contact_phone, created_at, updated_at, total, total_agorot"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("order_items")
        .select(
          "id, order_id, restaurant_id, menu_item_id, category, name, volume_option_id, volume_label, price, quantity, note, served, created_at, price_agorot"
        )
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
      supabase
        .from("orders_store")
        .select(
          "order_id, restaurant_slug, restaurant_name, table_number, session_id, kind, serve_mode, status, created_at, updated_at, total, total_agorot"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("order_items_store")
        .select(
          "id, order_id, menu_item_id, category, name, volume_option_id, volume_label, price, price_agorot, quantity, note, served"
        )
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
  const sessionsFromRows = (tableSessionRows
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
    .filter(Boolean) as Array<[string, number]>);
  const fallbackSessions = Array.isArray(parsedMeta?.currentTableSessions)
    ? parsedMeta.currentTableSessions
    : defaultSessionsFromRows;
  const mergedCurrentSessions = new Map<string, number>(fallbackSessions);

  for (const [tableKey, sessionId] of sessionsFromRows) {
    mergedCurrentSessions.set(tableKey, sessionId);
  }

  const currentTableSessions = [...mergedCurrentSessions.entries()];

  const parsedMetaClosedSummaries = Array.isArray(parsedMeta?.closedTableSummaries)
    ? (parsedMeta.closedTableSummaries as ClosedTableSummary[])
    : [];
  const closedTableSummaries =
    closedSessionRows.length > 0
      ? mergeClosedTableSummaries(
          mapClosedSessionRowsToSummaries(closedSessionRows, restaurantLookup),
          parsedMetaClosedSummaries
        )
      : parsedMetaClosedSummaries;

  const normalized: OrdersPersistence = {
    orders:
      serviceRequestRows.length > 0
        ? [...mapServiceRequestRowsToOrders(serviceRequestRows, restaurantLookup), ...activeOrders]
        : activeOrders,
    currentTableSessions,
    closedTableSummaries
  };

  logOrdersDebug("loadStateFromRowSupabase.normalized", {
    activeOrdersCount: activeOrders.length,
    serviceRequestRowsCount: serviceRequestRows.length,
    closedSessionRowsCount: closedSessionRows.length,
    metaClosedSummariesCount: parsedMetaClosedSummaries.length,
    normalizedOrdersCount: normalized.orders.length,
    normalizedClosedSummariesCount: normalized.closedTableSummaries.length,
    normalizedTableSessionsCount: normalized.currentTableSessions.length
  });

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
  const protectedOrderIdsWithMissingItems = new Set(
    standardOrders
      .filter(
        (order) =>
          order.status !== "cancelled" &&
          order.total > 0 &&
          (!Array.isArray(order.items) || order.items.length === 0)
      )
      .map((order) => order.id)
  );
  const serviceRequestOrders = state.ordersStore.filter(
    (order) => order.kind === "waiter_call" || order.kind === "bill_request"
  );
  const orderIds = standardOrders.map((order) => order.id);
  const orderIdsSet = new Set(orderIds);
  const restaurantRowsResult = await supabase.from("restaurants").select("id, slug, name");

  if (restaurantRowsResult.error) {
    throw new Error(restaurantRowsResult.error.message);
  }

  const restaurantRows = (restaurantRowsResult.data ?? []) as RestaurantRow[];
  const restaurantIdBySlug = new Map(
    restaurantRows.map((restaurant) => [restaurant.slug, restaurant.id] as const)
  );
  const restaurantLookup = new Map(
    restaurantRows.map((restaurant) => [restaurant.id, restaurant] as const)
  );
  const activeOrderRows = standardOrders
    .map((order) => {
      const restaurantId = restaurantIdBySlug.get(order.restaurantSlug);
      return restaurantId ? mapOrderToActiveRow(order, restaurantId) : null;
    })
    .filter((row): row is ActiveOrderRow => Boolean(row));
  const activeOrderItemRows = standardOrders.flatMap((order) => {
    const restaurantId = restaurantIdBySlug.get(order.restaurantSlug);
    return restaurantId
      ? order.items.map((item) => mapOrderItemToActiveRow(order.id, restaurantId, item))
      : [];
  });
  const persistSignatureCache = getOrdersPersistSignatureCache();

  if (protectedOrderIdsWithMissingItems.size > 0) {
    logOrdersDebug("persistStateToRowSupabase.protected_orders_with_missing_items", {
      protectedOrdersCount: protectedOrderIdsWithMissingItems.size,
      protectedOrderIds: [...protectedOrderIdsWithMissingItems]
    });
  }

  try {
    let activeOrderRowsToPersist = [...activeOrderRows];
    let activeOrderItemRowsToPersist = [...activeOrderItemRows];
    const nextOrderSignatures = buildSignatureMap(activeOrderRowsToPersist, (row) => row.id);
    const nextOrderItemSignatures = buildSignatureMap(activeOrderItemRowsToPersist, (row) => row.id);

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

      persistSignatureCache.orders.signatures = new Map();
      persistSignatureCache.orders.primed = true;
      persistSignatureCache.orderItems.signatures = new Map();
      persistSignatureCache.orderItems.primed = true;
    } else {
      const changedOrderRows = getChangedRows(
        activeOrderRowsToPersist,
        (row) => row.id,
        persistSignatureCache.orders
      );

      if (changedOrderRows.rowsToUpsert.length > 0) {
        let { error: upsertOrdersError } = await supabase
          .from("orders")
          .upsert(changedOrderRows.rowsToUpsert, { onConflict: "id" });

        if (upsertOrdersError && isMissingOrderAdvancedColumnError(upsertOrdersError)) {
          const fallbackRows = changedOrderRows.rowsToUpsert.map(
            toLegacyCompatibleActiveOrderRow
          );
          const retryUpsert = await supabase
            .from("orders")
            .upsert(fallbackRows, { onConflict: "id" });
          upsertOrdersError = retryUpsert.error;
        }

        if (upsertOrdersError && isMissingMoneyColumnError(upsertOrdersError)) {
          const fallbackRows = changedOrderRows.rowsToUpsert.map(
            toLegacyCompatibleActiveOrderRow
          );
          const retryUpsert = await supabase
            .from("orders")
            .upsert(fallbackRows, { onConflict: "id" });
          upsertOrdersError = retryUpsert.error;
        }

        if (
          upsertOrdersError &&
          isInvalidIntegerMoneyInputError(upsertOrdersError)
        ) {
          const fallbackRows = changedOrderRows.rowsToUpsert.map(
            toIntegerCompatibleActiveOrderRow
          );
          const retryUpsert = await supabase
            .from("orders")
            .upsert(fallbackRows, { onConflict: "id" });
          upsertOrdersError = retryUpsert.error;
        }

        if (upsertOrdersError) {
          throw new Error(upsertOrdersError.message);
        }
      }

      let staleIds = persistSignatureCache.orders.primed
        ? [...persistSignatureCache.orders.signatures.keys()].filter((id) => !orderIdsSet.has(id))
        : [];

      if (!persistSignatureCache.orders.primed) {
        const { data: existingRows, error: existingRowsError } = await supabase
          .from("orders")
          .select("id");

        if (existingRowsError) {
          throw new Error(existingRowsError.message);
        }

        staleIds = (existingRows ?? [])
          .map((row) => String((row as { id: string }).id))
          .filter((id) => !orderIdsSet.has(id));
      }

      if (staleIds.length > 0) {
        const { error: deleteStaleOrdersError } = await supabase
          .from("orders")
          .delete()
          .in("id", staleIds);

        if (deleteStaleOrdersError) {
          throw new Error(deleteStaleOrdersError.message);
        }
      }

      const changedOrderItems = getChangedRows(
        activeOrderItemRowsToPersist,
        (row) => row.id,
        persistSignatureCache.orderItems
      );

      if (changedOrderItems.rowsToUpsert.length > 0) {
        let { error: upsertItemsError } = await supabase
          .from("order_items")
          .upsert(changedOrderItems.rowsToUpsert, { onConflict: "id" });

        if (upsertItemsError && isMissingMoneyColumnError(upsertItemsError)) {
          const fallbackRows = changedOrderItems.rowsToUpsert.map(
            toLegacyCompatibleActiveOrderItemRow
          );
          const retryUpsert = await supabase
            .from("order_items")
            .upsert(fallbackRows, { onConflict: "id" });
          upsertItemsError = retryUpsert.error;
        }

        if (
          upsertItemsError &&
          isInvalidIntegerMoneyInputError(upsertItemsError)
        ) {
          const fallbackRows = changedOrderItems.rowsToUpsert.map(
            toIntegerCompatibleActiveOrderItemRow
          );
          const retryUpsert = await supabase
            .from("order_items")
            .upsert(fallbackRows, { onConflict: "id" });
          upsertItemsError = retryUpsert.error;
        }

        if (upsertItemsError) {
          throw new Error(upsertItemsError.message);
        }
      }

      const canUseOrderItemCacheForDelete =
        persistSignatureCache.orderItems.primed &&
        protectedOrderIdsWithMissingItems.size === 0;
      const staleItemIdsFromCache = canUseOrderItemCacheForDelete
        ? [...persistSignatureCache.orderItems.signatures.keys()].filter(
            (id) => !nextOrderItemSignatures.has(id)
          )
        : [];
      let staleItemIds = staleItemIdsFromCache;

      if (!canUseOrderItemCacheForDelete) {
        const { data: existingItemRows, error: existingItemRowsError } = await supabase
          .from("order_items")
          .select("id, order_id")
          .in("order_id", orderIds);

        if (existingItemRowsError) {
          throw new Error(existingItemRowsError.message);
        }

        const currentItemIds = new Set(activeOrderItemRowsToPersist.map((row) => row.id));
        staleItemIds = (existingItemRows ?? [])
          .map((row) => ({
            id: String((row as { id: string }).id),
            orderId: String((row as { order_id: string }).order_id)
          }))
          .filter(
            (row) =>
              !currentItemIds.has(row.id) &&
              !protectedOrderIdsWithMissingItems.has(row.orderId)
          )
          .map((row) => row.id);
      }

      if (staleItemIds.length > 0) {
        const { error: deleteStaleItemsError } = await supabase
          .from("order_items")
          .delete()
          .in("id", staleItemIds);

        if (deleteStaleItemsError) {
          throw new Error(deleteStaleItemsError.message);
        }
      }

      persistSignatureCache.orders.signatures = nextOrderSignatures;
      persistSignatureCache.orders.primed = true;
      persistSignatureCache.orderItems.signatures = nextOrderItemSignatures;
      persistSignatureCache.orderItems.primed = true;
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }

    let legacyOrderRows = standardOrders.map(mapOrderToLegacyRow);
    let legacyOrderItemRows = standardOrders.flatMap((order) =>
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
      if (legacyOrderRows.length > 0) {
        let { error: upsertOrdersError } = await supabase
          .from("orders_store")
          .upsert(legacyOrderRows, { onConflict: "order_id" });

        if (upsertOrdersError && isMissingMoneyColumnError(upsertOrdersError)) {
          legacyOrderRows = legacyOrderRows.map(toLegacyCompatibleLegacyOrderRow);
          const retryUpsert = await supabase
            .from("orders_store")
            .upsert(legacyOrderRows, { onConflict: "order_id" });
          upsertOrdersError = retryUpsert.error;
        }

        if (
          upsertOrdersError &&
          isInvalidIntegerMoneyInputError(upsertOrdersError)
        ) {
          legacyOrderRows = legacyOrderRows.map(toIntegerCompatibleLegacyOrderRow);
          const retryUpsert = await supabase
            .from("orders_store")
            .upsert(legacyOrderRows, { onConflict: "order_id" });
          upsertOrdersError = retryUpsert.error;
        }

        if (upsertOrdersError) {
          throw new Error(upsertOrdersError.message);
        }
      }

      const { data: existingRows, error: existingRowsError } = await supabase
        .from("orders_store")
        .select("order_id");

      if (existingRowsError) {
        throw new Error(existingRowsError.message);
      }

      const staleIds = (existingRows ?? [])
        .map((row) => String((row as { order_id: string }).order_id))
        .filter((id) => !orderIdsSet.has(id));

      if (staleIds.length > 0) {
        const { error: deleteStaleOrdersError } = await supabase
          .from("orders_store")
          .delete()
          .in("order_id", staleIds);

        if (deleteStaleOrdersError) {
          throw new Error(deleteStaleOrdersError.message);
        }
      }

      if (legacyOrderItemRows.length > 0) {
        let { error: upsertItemsError } = await supabase
          .from("order_items_store")
          .upsert(legacyOrderItemRows, { onConflict: "id" });

        if (upsertItemsError && isMissingMoneyColumnError(upsertItemsError)) {
          legacyOrderItemRows = legacyOrderItemRows.map(
            toLegacyCompatibleLegacyOrderItemRow
          );
          const retryUpsert = await supabase
            .from("order_items_store")
            .upsert(legacyOrderItemRows, { onConflict: "id" });
          upsertItemsError = retryUpsert.error;
        }

        if (
          upsertItemsError &&
          isInvalidIntegerMoneyInputError(upsertItemsError)
        ) {
          legacyOrderItemRows = legacyOrderItemRows.map(
            toIntegerCompatibleLegacyOrderItemRow
          );
          const retryUpsert = await supabase
            .from("order_items_store")
            .upsert(legacyOrderItemRows, { onConflict: "id" });
          upsertItemsError = retryUpsert.error;
        }

        if (upsertItemsError) {
          throw new Error(upsertItemsError.message);
        }
      }

      const { data: existingItemRows, error: existingItemRowsError } = await supabase
        .from("order_items_store")
        .select("id, order_id")
        .in("order_id", orderIds);

      if (existingItemRowsError) {
        throw new Error(existingItemRowsError.message);
      }

      const currentItemIds = new Set(legacyOrderItemRows.map((row) => row.id));
      const staleItemIds = (existingItemRows ?? [])
        .map((row) => ({
          id: String((row as { id: string }).id),
          orderId: String((row as { order_id: string }).order_id)
        }))
        .filter(
          (row) =>
            !currentItemIds.has(row.id) &&
            !protectedOrderIdsWithMissingItems.has(row.orderId)
        )
        .map((row) => row.id);

      if (staleItemIds.length > 0) {
        const { error: deleteStaleItemsError } = await supabase
          .from("order_items_store")
          .delete()
          .in("id", staleItemIds);

        if (deleteStaleItemsError) {
          throw new Error(deleteStaleItemsError.message);
        }
      }
    }
  }

  const serviceRequestRows = serviceRequestOrders
    .map((order) => {
      const restaurantId = restaurantIdBySlug.get(order.restaurantSlug);
      return restaurantId ? mapServiceRequestToRow(order, restaurantId) : null;
    })
    .filter((row): row is ServiceRequestRow => Boolean(row));
  const nextServiceRequestSignatures = buildSignatureMap(serviceRequestRows, (row) => row.id);

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

      persistSignatureCache.serviceRequests.signatures = new Map();
      persistSignatureCache.serviceRequests.primed = true;
    } else {
      const changedServiceRequests = getChangedRows(
        serviceRequestRows,
        (row) => row.id,
        persistSignatureCache.serviceRequests
      );

      let upsertServiceRequestsError: { message: string } | null = null;

      if (changedServiceRequests.rowsToUpsert.length > 0) {
        const upsertResult = await supabase
          .from("service_requests")
          .upsert(changedServiceRequests.rowsToUpsert, { onConflict: "id" });
        upsertServiceRequestsError = upsertResult.error;
      }

      if (
        upsertServiceRequestsError &&
        !isMissingTableError(upsertServiceRequestsError.message)
      ) {
        throw new Error(upsertServiceRequestsError.message);
      }

      let staleServiceRequestIds = persistSignatureCache.serviceRequests.primed
        ? [...persistSignatureCache.serviceRequests.signatures.keys()].filter(
            (id) => !nextServiceRequestSignatures.has(id)
          )
        : [];

      if (!persistSignatureCache.serviceRequests.primed) {
        const { data: existingServiceRequestRows, error: existingServiceRequestsError } =
          await supabase.from("service_requests").select("id");

        if (
          existingServiceRequestsError &&
          !isMissingTableError(existingServiceRequestsError.message)
        ) {
          throw new Error(existingServiceRequestsError.message);
        }

        const currentServiceRequestIdsSet = new Set(serviceRequestRows.map((row) => row.id));
        staleServiceRequestIds = (existingServiceRequestRows ?? [])
          .map((row) => String((row as { id: string }).id))
          .filter((id) => !currentServiceRequestIdsSet.has(id));
      }

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

      persistSignatureCache.serviceRequests.signatures = nextServiceRequestSignatures;
      persistSignatureCache.serviceRequests.primed = true;
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  const stateClosedSummariesBeforeMerge = state.closedTableSummaries.length;
  const retentionCutoffTs =
    Date.now() - CLOSED_SUMMARIES_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const retainedStateClosedSummaries = state.closedTableSummaries.filter((summary) => {
    const closedAtTs = new Date(summary.closedAt).getTime();
    return Number.isFinite(closedAtTs) && closedAtTs >= retentionCutoffTs;
  });
  let existingClosedSessionRowsData: ClosedSessionRow[] = [];
  const shouldReconcileClosedSessions = shouldRunClosedSessionsReconcile(
    persistSignatureCache.closedSessions
  );

  if (shouldReconcileClosedSessions) {
    const { data: existingClosedSessionsData, error: existingClosedSessionsError } =
      await supabase
        .from("closed_sessions")
        .select(
          "id, restaurant_id, table_number, session_id, closed_at, total, total_agorot, order_ids, orders_snapshot"
        );

    if (existingClosedSessionsError) {
      throw new Error(existingClosedSessionsError.message);
    }

    existingClosedSessionRowsData = (existingClosedSessionsData ?? []) as ClosedSessionRow[];
  }

  const existingClosedSummaries = shouldReconcileClosedSessions
    ? mapClosedSessionRowsToSummaries(existingClosedSessionRowsData, restaurantLookup)
    : [];
  const mergedClosedSummaries = shouldReconcileClosedSessions
    ? mergeClosedTableSummaries(existingClosedSummaries, retainedStateClosedSummaries)
    : retainedStateClosedSummaries;
  state.closedTableSummaries = mergedClosedSummaries;

  logOrdersDebug("persistStateToRowSupabase.closed_merge", {
    shouldReconcileClosedSessions,
    closedReconcileWritesSinceLast:
      persistSignatureCache.closedSessions.writesSinceReconcile,
    stateClosedSummariesBeforeMerge,
    retainedStateClosedSummariesCount: retainedStateClosedSummaries.length,
    existingClosedSessionRowsCount: existingClosedSessionRowsData.length,
    mergedClosedSummariesCount: mergedClosedSummaries.length
  });

  let closedSessionRows = mergedClosedSummaries
    .map((summary) => {
      const restaurantId = restaurantIdBySlug.get(summary.restaurantSlug);
      return restaurantId ? mapClosedSummaryToRow(summary, restaurantId) : null;
    })
    .filter((row): row is ClosedSessionRow => Boolean(row));

  const changedClosedSessions = getChangedRows(
    closedSessionRows,
    (row) => row.id,
    persistSignatureCache.closedSessions
  );
  const nextClosedSessionSignatures = buildSignatureMap(closedSessionRows, (row) => row.id);

  if (closedSessionRows.length === 0) {
    if (mergedClosedSummaries.length === 0) {
      const { error: deleteClosedSessionsError } = await supabase
        .from("closed_sessions")
        .delete()
        .neq("id", "");

      if (deleteClosedSessionsError) {
        throw new Error(deleteClosedSessionsError.message);
      }

      logOrdersDebug("persistStateToRowSupabase.closed_delete_all", {
        reason: "merged_closed_summaries_empty"
      });

      persistSignatureCache.closedSessions.signatures = new Map();
      persistSignatureCache.closedSessions.primed = true;
    }
  } else {
    let upsertClosedSessionsError: { message: string } | null = null;

    if (changedClosedSessions.rowsToUpsert.length > 0) {
      const upsertResult = await supabase
        .from("closed_sessions")
        .upsert(changedClosedSessions.rowsToUpsert, { onConflict: "id" });
      upsertClosedSessionsError = upsertResult.error;
    }

    if (
      upsertClosedSessionsError &&
      isMissingMoneyColumnError(upsertClosedSessionsError)
    ) {
      const fallbackRows = changedClosedSessions.rowsToUpsert.map(
        toLegacyCompatibleClosedSessionRow
      );
      const retryUpsert = await supabase
        .from("closed_sessions")
        .upsert(fallbackRows, { onConflict: "id" });
      upsertClosedSessionsError = retryUpsert.error;
    }

    if (
      upsertClosedSessionsError &&
      isInvalidIntegerMoneyInputError(upsertClosedSessionsError)
    ) {
      const fallbackRows = changedClosedSessions.rowsToUpsert.map(
        toIntegerCompatibleClosedSessionRow
      );
      const retryUpsert = await supabase
        .from("closed_sessions")
        .upsert(fallbackRows, { onConflict: "id" });
      upsertClosedSessionsError = retryUpsert.error;
    }

    if (upsertClosedSessionsError) {
      throw new Error(upsertClosedSessionsError.message);
    }

    let staleClosedSessionIds = persistSignatureCache.closedSessions.primed
      ? [...persistSignatureCache.closedSessions.signatures.keys()].filter(
          (id) => !nextClosedSessionSignatures.has(id)
        )
      : existingClosedSessionRowsData
          .map((row) => String(row.id))
          .filter((id) => !nextClosedSessionSignatures.has(id));

    if (staleClosedSessionIds.length > 0) {
      const { error: deleteStaleClosedSessionsError } = await supabase
        .from("closed_sessions")
        .delete()
        .in("id", staleClosedSessionIds);

      if (deleteStaleClosedSessionsError) {
        throw new Error(deleteStaleClosedSessionsError.message);
      }

      logOrdersDebug("persistStateToRowSupabase.closed_delete_stale", {
        staleClosedSessionIdsCount: staleClosedSessionIds.length,
        upsertedClosedSessionRowsCount: closedSessionRows.length
      });
    }

    persistSignatureCache.closedSessions.signatures = nextClosedSessionSignatures;
    persistSignatureCache.closedSessions.primed = true;
  }

  if (shouldReconcileClosedSessions) {
    persistSignatureCache.closedSessions.lastReconcileAt = Date.now();
    persistSignatureCache.closedSessions.writesSinceReconcile = 0;
  } else {
    persistSignatureCache.closedSessions.writesSinceReconcile += 1;
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

  const { error: metaError } = await supabase.from("app_state").upsert(
    {
      key: ORDERS_META_KEY,
      // Keep a full fallback copy even when dedicated tables are available,
      // so session ids are not lost if dedicated rows are temporarily incomplete.
      value: toOrdersMetaPersistence(state),
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );

  if (metaError) {
    throw new Error(metaError.message);
  }

  logOrdersDebug("persistStateToRowSupabase.completed", {
    standardOrdersCount: standardOrders.length,
    serviceRequestOrdersCount: serviceRequestOrders.length,
    closedSummariesCount: state.closedTableSummaries.length,
    tableSessionsCount: state.currentTableSessions.size,
    tableSessionsStoredInDedicatedTable
  });
}

async function loadStateAsync(): Promise<OrdersPersistence> {
  const cached = getOrdersStateCache();

  if (cached && cached.expiresAt > Date.now()) {
    return cloneOrdersPersistence(cached.state);
  }

  if (globalThis.__ordersStateLoadPromise) {
    const inflightState = await globalThis.__ordersStateLoadPromise;
    return cloneOrdersPersistence(inflightState);
  }

  globalThis.__ordersStateLoadPromise = (async () => {
    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      const localState = loadState();
      logOrdersDebug("loadStateAsync.local_no_supabase", {
        ordersCount: localState.orders.length,
        closedSummariesCount: localState.closedTableSummaries.length,
        tableSessionsCount: localState.currentTableSessions.length
      });
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
            logOrdersDebug("loadStateAsync.legacy_fallback_after_empty_row_state", {
              rowOrdersCount: normalizedState.orders.length,
              rowClosedSummariesCount: normalizedState.closedTableSummaries.length,
              legacyOrdersCount: legacyState.orders.length,
              legacyClosedSummariesCount: legacyState.closedTableSummaries.length
            });
            setOrdersStateCache(legacyState);
            return cloneOrdersPersistence(legacyState);
          }
        } catch {
          // ignore and keep row-based state
        }
      }

      logOrdersDebug("loadStateAsync.row_state", {
        ordersCount: normalizedState.orders.length,
        closedSummariesCount: normalizedState.closedTableSummaries.length,
        tableSessionsCount: normalizedState.currentTableSessions.length
      });
      setOrdersStateCache(normalizedState);
      return cloneOrdersPersistence(normalizedState);
    } catch (rowLoadError) {
      logOrdersDebug("loadStateAsync.row_state_error", {
        message: rowLoadError instanceof Error ? rowLoadError.message : String(rowLoadError)
      });

      try {
        const legacyState = await loadStateFromLegacySupabase(supabase);
        logOrdersDebug("loadStateAsync.legacy_state", {
          ordersCount: legacyState.orders.length,
          closedSummariesCount: legacyState.closedTableSummaries.length,
          tableSessionsCount: legacyState.currentTableSessions.length
        });
        setOrdersStateCache(legacyState);
        return cloneOrdersPersistence(legacyState);
      } catch {
        const localState = loadState();
        logOrdersDebug("loadStateAsync.local_fallback_after_legacy_error", {
          ordersCount: localState.orders.length,
          closedSummariesCount: localState.closedTableSummaries.length,
          tableSessionsCount: localState.currentTableSessions.length
        });
        setOrdersStateCache(localState);
        return cloneOrdersPersistence(localState);
      }
    }
  })();

  try {
    const loadedState = await globalThis.__ordersStateLoadPromise;
    return cloneOrdersPersistence(loadedState);
  } finally {
    globalThis.__ordersStateLoadPromise = undefined;
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
  const countsBeforeCleanup = {
    ordersCount: state.ordersStore.length,
    closedSummariesCount: state.closedTableSummaries.length,
    tableSessionsCount: state.currentTableSessions.size
  };

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
  const corruptedEmptyClosedSummariesPruned = pruneCorruptedEmptyClosedSummaries(state);
  const closedSummariesDeduped = dedupeClosedTableSummaries(state);
  const activeOrdersTrimmed = removeClosedSessionOrdersFromActiveState(state);
  const closedSummariesCompacted = compactClosedTableSummaries(state);

  if (
    expiredShiftOrdersClosed ||
    staleServiceRequestsClosed ||
    shiftedSessionsRotated ||
    completedShiftOrdersArchived ||
    staleClosedSummariesPruned ||
    corruptedEmptyClosedSummariesPruned ||
    closedSummariesDeduped ||
    activeOrdersTrimmed ||
    closedSummariesCompacted
  ) {
    const countsAfterCleanup = {
      ordersCount: state.ordersStore.length,
      closedSummariesCount: state.closedTableSummaries.length,
      tableSessionsCount: state.currentTableSessions.size
    };
    logOrdersDebug("readRuntimeStateAsync.cleanup_and_persist", {
      ordersCountBeforeCleanup: countsBeforeCleanup.ordersCount,
      closedSummariesCountBeforeCleanup: countsBeforeCleanup.closedSummariesCount,
      tableSessionsCountBeforeCleanup: countsBeforeCleanup.tableSessionsCount,
      ordersCountAfterCleanup: countsAfterCleanup.ordersCount,
      closedSummariesCountAfterCleanup: countsAfterCleanup.closedSummariesCount,
      tableSessionsCountAfterCleanup: countsAfterCleanup.tableSessionsCount,
      expiredShiftOrdersClosed,
      staleServiceRequestsClosed,
      shiftedSessionsRotated,
      completedShiftOrdersArchived,
      staleClosedSummariesPruned,
      corruptedEmptyClosedSummariesPruned,
      closedSummariesDeduped,
      activeOrdersTrimmed,
      closedSummariesCompacted
    });
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
  const basePrice =
    typeof cartItem.priceOverride === "number" && Number.isFinite(cartItem.priceOverride)
      ? cartItem.priceOverride
      : matchedVolumeOption?.price ?? menuItem.price;
  const finalPrice = menuSettings
    ? applyHappyHourDiscount(basePrice, menuItem.category, menuSettings)
    : agorotToShekels(shekelsToAgorot(basePrice));

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
  const basePriceAgorot = shekelsToAgorot(price);
  const discountPercent = getPromotionDiscountForCategory(category, settings);

  if (discountPercent <= 0) {
    return agorotToShekels(basePriceAgorot);
  }

  const discountAgorot = calculatePercentDiscountAgorot(
    basePriceAgorot,
    percentToBps(discountPercent)
  );
  return agorotToShekels(Math.max(0, basePriceAgorot - discountAgorot));
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

  order.total = calculateOrderItemsTotal(order.items);

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

export async function getOrdersByGuestToken(
  restaurantSlug: string,
  guestToken: string
) {
  const normalizedGuestToken = normalizeGuestTokenValue(guestToken);

  if (!normalizedGuestToken) {
    return [] as Order[];
  }

  const guestTokenHash = hashGuestToken(normalizedGuestToken);
  const { ordersStore } = await readRuntimeStateAsync();

  return ordersStore
    .filter(
      (order) =>
        order.restaurantSlug === restaurantSlug &&
        order.kind !== "waiter_call" &&
        order.kind !== "bill_request" &&
        order.status !== "cancelled" &&
        (order.guestTokenHash ?? "").trim() === guestTokenHash
    )
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
    orderChannel: "table",
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
    orderChannel: "table",
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
  const snapshot = await getTableSessionSnapshot(restaurantSlug, tableNumber);
  return snapshot.submittedOrders;
}

export async function getTableSessionServiceRequests(
  restaurantSlug: string,
  tableNumber: number
) {
  const snapshot = await getTableSessionSnapshot(restaurantSlug, tableNumber);
  return snapshot.activeServiceRequests;
}

export async function getTableSessionSnapshot(
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

  const submittedOrders: Order[] = [];
  const activeServiceRequests: Order[] = [];

  for (const order of state.ordersStore) {
    if (
      order.restaurantSlug !== restaurantSlug ||
      order.tableNumber !== tableNumber ||
      order.sessionId !== sessionId ||
      order.status === "cancelled"
    ) {
      continue;
    }

    if (order.kind === "waiter_call" || order.kind === "bill_request") {
      if (order.status !== "served") {
        activeServiceRequests.push(order);
      }
      continue;
    }

    submittedOrders.push(order);
  }

  submittedOrders.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  activeServiceRequests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    currentSessionId: sessionId,
    submittedOrders,
    activeServiceRequests
  };
}

export async function createOrder(input: {
  restaurantSlug: string;
  tableNumber: number;
  items: CartItem[];
  serveMode?: ServeMode;
  orderChannel?: OrderChannel;
  clientRequestId?: string;
  guestToken?: string;
  guestContactName?: string;
  guestContactPhone?: string;
  menuSettings?: MenuSettings;
}) {
  const state = await readRuntimeStateAsync();
  const restaurant = await getRestaurantBySlug(input.restaurantSlug);
  const menuSettings = input.menuSettings ?? (await getMenuSettings(input.restaurantSlug));
  const guestToken = normalizeGuestTokenValue(input.guestToken);
  const guestTokenHash = guestToken ? hashGuestToken(guestToken) : undefined;
  const requestedOrderChannel = normalizeOrderChannelValue(
    input.orderChannel,
    input.tableNumber
  );
  const orderChannel: OrderChannel =
    menuSettings.orderMode === "counter" ? "counter" : requestedOrderChannel;
  const resolvedTableNumber =
    orderChannel === "counter"
      ? Math.max(
          0,
          Number.isFinite(input.tableNumber) ? Math.trunc(input.tableNumber) : 0
        )
      : input.tableNumber;

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  if (orderChannel === "table") {
    const tableExists = restaurant.tables.some(
      (table) => table.number === resolvedTableNumber
    );

    if (!tableExists) {
      throw new Error("Table not found");
    }
  }

  if (input.clientRequestId) {
    const repeatedOrder = findOrderByClientRequestId(
      state,
      input.clientRequestId,
      input.restaurantSlug,
      resolvedTableNumber,
      orderChannel,
      guestTokenHash
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
    resolvedTableNumber
  );
  const payloadSignature = createOrderPayloadSignature(input.items, input.serveMode);

  const menuLookup = await getMenuLookupForRestaurant(input.restaurantSlug);
  const items = input.items.map((cartItem) => {
    const menuItem = menuLookup.get(cartItem.menuItemId);

    if (!menuItem) {
      throw new Error(`Menu item ${cartItem.menuItemId} not found`);
    }

    return createOrderItem(cartItem, menuItem, menuSettings);
  });
  const total = calculateOrderItemsTotal(items);

  const repeatedPayloadOrder = findRecentOrderByPayload(
    state,
    input.restaurantSlug,
    resolvedTableNumber,
    sessionId,
    payloadSignature,
    orderChannel,
    guestTokenHash
  );
  const now = Date.now();
  const isMergeableRepeatedPayloadOrder =
    repeatedPayloadOrder &&
    repeatedPayloadOrder.kind !== "waiter_call" &&
    repeatedPayloadOrder.kind !== "bill_request" &&
    normalizeOrderChannelValue(
      repeatedPayloadOrder.orderChannel,
      repeatedPayloadOrder.tableNumber
    ) === orderChannel &&
    (orderChannel !== "counter" ||
      Boolean(guestTokenHash && repeatedPayloadOrder.guestTokenHash === guestTokenHash)) &&
    repeatedPayloadOrder.status === "new" &&
    now - new Date(repeatedPayloadOrder.createdAt).getTime() < MERGE_ORDER_WINDOW_MS;
  const existingNewOrder = isMergeableRepeatedPayloadOrder
    ? repeatedPayloadOrder
    : state.ordersStore.find(
        (order) =>
          order.restaurantSlug === restaurant.slug &&
          order.tableNumber === resolvedTableNumber &&
          order.sessionId === sessionId &&
          order.kind !== "waiter_call" &&
          order.kind !== "bill_request" &&
          normalizeOrderChannelValue(order.orderChannel, order.tableNumber) ===
            orderChannel &&
          (orderChannel !== "counter" ||
            Boolean(guestTokenHash && order.guestTokenHash === guestTokenHash)) &&
          order.status === "new" &&
          now - new Date(order.createdAt).getTime() < MERGE_ORDER_WINDOW_MS
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

    mergedOrder.orderChannel = orderChannel;
    if (!mergedOrder.displayOrderNumber) {
      mergedOrder.displayOrderNumber = generateDisplayOrderNumber(
        menuSettings.orderNumberPrefix
      );
    }
    if (!mergedOrder.guestTokenHash && guestTokenHash) {
      mergedOrder.guestTokenHash = guestTokenHash;
    }

    rememberRecentOrderPayload(
      mergedOrder,
      input.restaurantSlug,
      resolvedTableNumber,
      sessionId,
      payloadSignature,
      orderChannel,
      guestTokenHash
    );

    if (input.clientRequestId) {
      rememberClientRequestOrder(
        input.clientRequestId,
        mergedOrder,
        input.restaurantSlug,
        resolvedTableNumber,
        orderChannel,
        guestTokenHash
      );
    }

    await persistStateAsync(state);
    return mergedOrder;
  }

  const order: Order = {
    id: `ord_${Date.now()}`,
    restaurantSlug: restaurant.slug,
    restaurantName: restaurant.name,
    tableNumber: resolvedTableNumber,
    sessionId,
    orderChannel,
    displayOrderNumber: generateDisplayOrderNumber(menuSettings.orderNumberPrefix),
    guestTokenHash,
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
    resolvedTableNumber,
    sessionId,
    payloadSignature,
    orderChannel,
    guestTokenHash
  );

  if (input.clientRequestId) {
    rememberClientRequestOrder(
      input.clientRequestId,
      order,
      input.restaurantSlug,
      resolvedTableNumber,
      orderChannel,
      guestTokenHash
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

export async function updateOrderCooked(
  orderId: string,
  cooked: boolean,
  station: "kitchen" | "bar" = "kitchen"
) {
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

  let touchedItems = 0;
  order.items = order.items.map((item) => {
    if (!isItemInReadyStation(item, station)) {
      return item;
    }

    touchedItems += 1;
    return {
      ...item,
      note: setStationReadyMarkerOnNote(item.note, station, cooked)
    };
  });

  if (cooked && touchedItems > 0 && order.status === "new") {
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
  const settings = await getMenuSettings(restaurantSlug);
  const shiftWindow = getCurrentAdminShiftWindow(settings);

  if (!shiftWindow) {
    logOrdersDebug("getTableOverviews.no_active_shift", {
      restaurantSlug: restaurantSlug ?? null,
      nowIso: new Date().toISOString(),
      workingHoursFrom: settings.workingHoursFrom,
      workingHoursUntil: settings.workingHoursUntil,
      workingHoursRulesCount: settings.workingHoursRules.length,
      ordersCount: state.ordersStore.length,
      closedSummariesCount: state.closedTableSummaries.length
    });
    return [];
  }

  const overviews = (await getRestaurants())
    .filter((restaurant) =>
      restaurantSlug ? restaurant.slug === restaurantSlug : true
    )
    .flatMap((restaurant) =>
      restaurant.tables.map((table) => {
        const { sessionId: currentSessionId } = ensureCurrentSessionId(
          state,
          restaurant.slug,
          table.number
        );

        const sessionOrders = state.ordersStore
          .filter(
            (order) =>
              order.restaurantSlug === restaurant.slug &&
              order.tableNumber === table.number &&
              order.sessionId === currentSessionId
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const visibleOrders = sessionOrders
          .filter(
            (order) =>
              order.status !== "cancelled" &&
              order.kind !== "waiter_call" &&
              order.kind !== "bill_request" &&
              isOrderWithinAdminShiftWindow(order, shiftWindow)
          )
          .flatMap((order) => {
            if ((order.items ?? []).length === 0) {
              if (order.total > 0) {
                logOrdersDebug("getTableOverviews.skip_order_with_empty_items", {
                  orderId: order.id,
                  restaurantSlug: order.restaurantSlug,
                  tableNumber: order.tableNumber,
                  sessionId: order.sessionId,
                  storedTotal: order.total
                });
              }

              return [];
            }

            const effectiveTotal = getEffectiveOrderTotal(order);
            const storedTotalAgorot = shekelsToAgorot(order.total);
            const effectiveTotalAgorot = shekelsToAgorot(effectiveTotal);

            if (storedTotalAgorot === effectiveTotalAgorot) {
              return [order];
            }

            logOrdersDebug("getTableOverviews.adjust_order_total_from_items", {
              orderId: order.id,
              restaurantSlug: order.restaurantSlug,
              tableNumber: order.tableNumber,
              sessionId: order.sessionId,
              storedTotal: order.total,
              effectiveTotal
            });

            return [
              {
                ...order,
                total: agorotToShekels(effectiveTotalAgorot)
              }
            ];
          });

        return {
          restaurantSlug: restaurant.slug,
          restaurantName: restaurant.name,
          tableNumber: table.number,
          currentSessionId,
          orderCount: visibleOrders.length,
          total: agorotToShekels(
            visibleOrders.reduce(
              (sum, order) => sum + shekelsToAgorot(getEffectiveOrderTotal(order)),
              0
            )
          ),
          statuses: [...new Set(visibleOrders.map((order) => order.status))],
          orders: visibleOrders
        };
      })
    )
    .filter((table) => table.orders.length > 0)
    .sort((left, right) => left.tableNumber - right.tableNumber);

  logOrdersDebug("getTableOverviews.result", {
    restaurantSlug: restaurantSlug ?? null,
    shiftStartIso: shiftWindow.start.toISOString(),
    shiftEndIso: shiftWindow.end.toISOString(),
    overviewsCount: overviews.length,
    ordersCount: state.ordersStore.length,
    closedSummariesCount: state.closedTableSummaries.length
  });

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

  const billableOrders = orders.filter(
    (order) => order.kind !== "waiter_call" && order.kind !== "bill_request"
  );

  const existingSummary = state.closedTableSummaries.find(
    (summary) =>
      summary.restaurantSlug === restaurantSlug &&
      summary.tableNumber === tableNumber &&
      summary.sessionId === sessionId
  );

  if (existingSummary && billableOrders.length === 0) {
    const sessionOrderIds = new Set(orders.map((order) => order.id));
    let recovered = false;

    if (sessionOrderIds.size > 0) {
      state.ordersStore = state.ordersStore.filter(
        (order) => !sessionOrderIds.has(order.id)
      );
      recovered = true;
    }

    const sessionKey = createTableKey(restaurantSlug, tableNumber);
    const currentSession = state.currentTableSessions.get(sessionKey);

    if (currentSession === sessionId) {
      state.currentTableSessions.set(sessionKey, sessionId + 1);
      recovered = true;
    }

    if (recovered) {
      await persistStateAsync(state);
    }

    logOrdersDebug("closeTable.already_closed_session", {
      restaurantSlug,
      tableNumber,
      sessionId,
      existingClosedAt: existingSummary.closedAt,
      recovered
    });
    return existingSummary;
  }

  if (billableOrders.length === 0) {
    logOrdersDebug("closeTable.blocked_empty_session", {
      restaurantSlug,
      tableNumber,
      sessionId,
      allSessionOrdersCount: orders.length
    });
    throw new Error("No food/drink orders in this session. Nothing to close.");
  }

  const unservedOrders = billableOrders.filter(
    (order) =>
      order.status !== "served" &&
      order.status !== "cancelled"
  );

  if (unservedOrders.length > 0) {
    throw new Error(
      "Check that all the orders are served and change status in Orders."
    );
  }

  let closingSessionId = sessionId;

  if (existingSummary && billableOrders.length > 0) {
    const maxClosedSessionIdForTable = state.closedTableSummaries
      .filter(
        (summary) =>
          summary.restaurantSlug === restaurantSlug &&
          summary.tableNumber === tableNumber
      )
      .reduce((maxSessionId, summary) => Math.max(maxSessionId, summary.sessionId), 0);
    closingSessionId = Math.max(sessionId, maxClosedSessionIdForTable + 1);

    logOrdersDebug("closeTable.session_collision_bump", {
      restaurantSlug,
      tableNumber,
      previousSessionId: sessionId,
      nextSessionId: closingSessionId,
      closedSummariesForTable: state.closedTableSummaries.filter(
        (summary) =>
          summary.restaurantSlug === restaurantSlug &&
          summary.tableNumber === tableNumber
      ).length
    });
  }

  const summary: ClosedTableSummary = {
    restaurantSlug,
    restaurantName: restaurant.name,
    tableNumber,
    sessionId: closingSessionId,
    closedAt: new Date().toISOString(),
    total: agorotToShekels(
      billableOrders.reduce(
        (sum, order) => sum + shekelsToAgorot(getEffectiveOrderTotal(order)),
        0
      )
    ),
    orderCount: billableOrders.length,
    orderIds: billableOrders.map((order) => order.id),
    orders: billableOrders.map((order) => toClosedTableOrderSnapshot(order))
  };

  const summaryId = getClosedSummaryPersistenceId(summary);
  state.closedTableSummaries = [
    summary,
    ...state.closedTableSummaries.filter(
      (existing) => getClosedSummaryPersistenceId(existing) !== summaryId
    )
  ];
  state.closedTableSummaries = mergeClosedTableSummaries(state.closedTableSummaries);
  logOrdersDebug("closeTable.summary_created", {
    restaurantSlug,
    tableNumber,
    sessionId: summary.sessionId,
    summaryOrderIdsCount: summary.orderIds.length,
    summaryTotal: summary.total,
    stateClosedSummariesCountAfterPush: state.closedTableSummaries.length
  });
  const sessionOrderIds = new Set(orders.map((order) => order.id));
  state.ordersStore = state.ordersStore.filter((order) => !sessionOrderIds.has(order.id));
  const sessionKey = createTableKey(restaurantSlug, tableNumber);
  const currentSession = state.currentTableSessions.get(sessionKey) ?? 1;
  state.currentTableSessions.set(
    sessionKey,
    Math.max(currentSession, closingSessionId + 1)
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

  const movableOrderIds = new Set(movableOrders.map((order) => order.id));
  state.ordersStore = state.ordersStore.map((order) =>
    movableOrderIds.has(order.id)
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

export async function getClosedTableSummaries(
  restaurantSlug?: string,
  options?: { scope?: "all" | "current_shift" }
) {
  const { closedTableSummaries } = await readRuntimeStateAsync();
  const restaurantFiltered = closedTableSummaries.filter((summary) =>
    restaurantSlug ? summary.restaurantSlug === restaurantSlug : true
  );

  if (options?.scope !== "current_shift") {
    return restaurantFiltered;
  }

  const settingsByRestaurant = new Map<string, MenuSettingsSnapshot>();
  const nowTs = Date.now();
  const filteredOut: Array<{
    restaurantSlug: string;
    tableNumber: number;
    sessionId: number;
    closedAt: string;
  }> = [];

  const result = (
    await Promise.all(
      restaurantFiltered.map(async (summary) => {
        const closedAtTs = new Date(summary.closedAt).getTime();

        if (!Number.isFinite(closedAtTs)) {
          filteredOut.push({
            restaurantSlug: summary.restaurantSlug,
            tableNumber: summary.tableNumber,
            sessionId: summary.sessionId,
            closedAt: summary.closedAt
          });
          return null;
        }

        const summaryRestaurantSlug = summary.restaurantSlug;
        let settings = settingsByRestaurant.get(summaryRestaurantSlug);

        if (!settings) {
          settings = await getMenuSettings(summaryRestaurantSlug);
          settingsByRestaurant.set(summaryRestaurantSlug, settings);
        }

        const summaryShiftWindow = getShiftWindowForTimestamp(settings, closedAtTs);
        const isInSummaryShiftWindow =
          closedAtTs >= summaryShiftWindow.start.getTime() &&
          closedAtTs < summaryShiftWindow.end.getTime() + SHIFT_CLOSE_GRACE_MS;
        const isSummaryShiftStillVisible =
          nowTs < summaryShiftWindow.end.getTime() + SHIFT_CLOSE_GRACE_MS;

        if (isInSummaryShiftWindow && isSummaryShiftStillVisible) {
          return summary;
        }

        filteredOut.push({
          restaurantSlug: summary.restaurantSlug,
          tableNumber: summary.tableNumber,
          sessionId: summary.sessionId,
          closedAt: summary.closedAt
        });
        return null;
      })
    )
  ).filter(Boolean) as ClosedTableSummary[];

  logOrdersDebug("getClosedTableSummaries.current_shift", {
    restaurantSlug: restaurantSlug ?? null,
    sourceCount: restaurantFiltered.length,
    returnedCount: result.length,
    filteredOutCount: filteredOut.length,
    filteredOut
  });

  return result;
}
