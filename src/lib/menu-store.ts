import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { menuItems as defaultMenuItems } from "@/lib/mock-data";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  MenuBadge,
  MenuCategory,
  MenuItem,
  MenuVolumeOption,
  TableSession
} from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const MENU_STORE_PATH = path.join(DATA_DIR, "menu-store.json");
const MENU_STORE_KEY = "menu-store";
const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";
const MENU_STORE_CACHE_TTL_MS = 60_000;
const ALLOWED_BADGES: MenuBadge[] = [
  "chef_special",
  "most_popular",
  "vegan",
  "spicy",
  "kids_favorite",
  "new",
  "kosher",
  "meat",
  "dairy",
  "gluten_free",
  "dairy_free",
  "nut_free"
];

type MenuStoreCacheEntry = {
  items: MenuItem[];
  expiresAt: number;
};

type AvailableMenuCacheEntry = {
  items: MenuItem[];
  expiresAt: number;
};

type TableSessionCacheEntry = {
  session: TableSession | null;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __menuStoreCache: MenuStoreCacheEntry | undefined;
  // eslint-disable-next-line no-var
  var __availableMenuCache: Map<string, AvailableMenuCacheEntry> | undefined;
  // eslint-disable-next-line no-var
  var __tableSessionCache: Map<string, TableSessionCacheEntry> | undefined;
}

function cloneMenuItems(items: MenuItem[]): MenuItem[] {
  return items.map((item) => ({
    ...item,
    badges: Array.isArray(item.badges) ? [...item.badges] : [],
    volumeOptions: Array.isArray(item.volumeOptions)
      ? item.volumeOptions.map((option) => ({ ...option }))
      : []
  }));
}

function cloneDefaultMenuItems(): MenuItem[] {
  return cloneMenuItems(defaultMenuItems);
}

function getMenuStoreCache() {
  return globalThis.__menuStoreCache;
}

function setMenuStoreCache(items: MenuItem[]) {
  globalThis.__menuStoreCache = {
    items: cloneMenuItems(items),
    expiresAt: Date.now() + MENU_STORE_CACHE_TTL_MS
  };
}

function getAvailableMenuCache() {
  globalThis.__availableMenuCache ??= new Map();
  const now = Date.now();

  for (const [key, entry] of globalThis.__availableMenuCache.entries()) {
    if (entry.expiresAt <= now) {
      globalThis.__availableMenuCache.delete(key);
    }
  }

  return globalThis.__availableMenuCache;
}

function getTableSessionCache() {
  globalThis.__tableSessionCache ??= new Map();
  const now = Date.now();

  for (const [key, entry] of globalThis.__tableSessionCache.entries()) {
    if (entry.expiresAt <= now) {
      globalThis.__tableSessionCache.delete(key);
    }
  }

  return globalThis.__tableSessionCache;
}

function clearDerivedMenuCaches(restaurantSlug?: string) {
  const availableMenuCache = getAvailableMenuCache();
  const tableSessionCache = getTableSessionCache();

  if (!restaurantSlug) {
    availableMenuCache.clear();
    tableSessionCache.clear();
    return;
  }

  availableMenuCache.delete(restaurantSlug);

  for (const key of tableSessionCache.keys()) {
    if (key.startsWith(`${restaurantSlug}:`)) {
      tableSessionCache.delete(key);
    }
  }
}

function cloneTableSession(session: TableSession | null): TableSession | null {
  if (!session) {
    return null;
  }

  return {
    restaurant: {
      ...session.restaurant,
      tables: session.restaurant.tables.map((table) => ({ ...table }))
    },
    table: { ...session.table },
    menu: cloneMenuItems(session.menu),
    submittedOrders: session.submittedOrders?.map((order) => ({
      ...order,
      items: order.items.map((item) => ({ ...item }))
    }))
  };
}

function normalizeVolumeOptions(
  volumeOptions: MenuItem["volumeOptions"]
): MenuVolumeOption[] {
  if (!Array.isArray(volumeOptions)) {
    return [];
  }

  return volumeOptions
    .map((option, index) => {
      const label = option?.label?.trim() || "";
      const price = Number(option?.price);

      if (!Number.isFinite(price)) {
        return null;
      }

      return {
        id:
          option?.id?.trim() ||
          `volume_${index}_${(label || "empty").replace(/\s+/g, "_")}_${Math.max(
            0,
            Math.round(price)
          )}`,
        label,
        price: Math.max(0, Math.round(price))
      };
    })
    .filter(Boolean) as MenuVolumeOption[];
}

function normalizeMenuItem(item: MenuItem): MenuItem {
  const nameHe = item.nameHe?.trim() || item.name?.trim() || "";
  const descriptionHe =
    item.descriptionHe?.trim() || item.description?.trim() || "";
  const nameEn = item.nameEn?.trim() || nameHe;
  const descriptionEn = item.descriptionEn?.trim() || descriptionHe;
  const image = item.image?.trim() || DEFAULT_MENU_IMAGE;

  return {
    ...item,
    name: nameHe,
    description: descriptionHe,
    nameHe,
    nameEn,
    descriptionHe,
    descriptionEn,
    price: Number.isFinite(item.price) ? Math.max(0, Math.round(item.price)) : 0,
    available: item.available ?? true,
    showImage: item.showImage ?? true,
    image,
    badges: Array.isArray(item.badges)
      ? item.badges.filter((badge): badge is MenuBadge =>
          ALLOWED_BADGES.includes(badge as MenuBadge)
        )
      : [],
    volumeOptions: normalizeVolumeOptions(item.volumeOptions)
  };
}

function loadMenuItemsFromDisk(): MenuItem[] {
  if (!existsSync(MENU_STORE_PATH)) {
    return cloneDefaultMenuItems();
  }

  try {
    const raw = readFileSync(MENU_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as MenuItem[];

    if (!Array.isArray(parsed)) {
      return cloneDefaultMenuItems();
    }

    return parsed.map((item) => normalizeMenuItem(item));
  } catch {
    return cloneDefaultMenuItems();
  }
}

function persistMenuItemsToDisk(items: MenuItem[]) {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(MENU_STORE_PATH, JSON.stringify(items, null, 2), "utf8");
}

async function loadMenuItemsAsync(): Promise<MenuItem[]> {
  const cached = getMenuStoreCache();

  if (cached && cached.expiresAt > Date.now()) {
    return cloneMenuItems(cached.items);
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const localItems = loadMenuItemsFromDisk();
    setMenuStoreCache(localItems);
    return cloneMenuItems(localItems);
  }

  try {
    const { data, error } = await supabase
      .from("app_state")
      .select("value")
      .eq("key", MENU_STORE_KEY)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.value) {
      const defaults = cloneDefaultMenuItems();
      await persistMenuItemsAsync(defaults);
      return cloneMenuItems(defaults);
    }

    const parsed = data.value as MenuItem[];
    const normalized = Array.isArray(parsed)
      ? parsed.map((item) => normalizeMenuItem(item))
      : cloneDefaultMenuItems();

    setMenuStoreCache(normalized);
    return cloneMenuItems(normalized);
  } catch {
    const localItems = loadMenuItemsFromDisk();
    setMenuStoreCache(localItems);
    return cloneMenuItems(localItems);
  }
}

async function persistMenuItemsAsync(items: MenuItem[]) {
  const normalized = items.map((item) => normalizeMenuItem(item));
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    persistMenuItemsToDisk(normalized);
    setMenuStoreCache(normalized);
    clearDerivedMenuCaches();
    return;
  }

  const { error } = await supabase.from("app_state").upsert(
    {
      key: MENU_STORE_KEY,
      value: normalized,
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );

  if (error) {
    throw new Error(`Supabase persist failed: ${error.message}`);
  }

  setMenuStoreCache(normalized);
  clearDerivedMenuCaches();
}

if (!existsSync(MENU_STORE_PATH)) {
  persistMenuItemsToDisk(cloneDefaultMenuItems());
}

function buildMenuItemId() {
  return `m_${Date.now()}`;
}

function buildSessionCacheKey(restaurantSlug: string, tableToken: string) {
  return `${restaurantSlug}:${tableToken}`;
}

export async function getAllMenuItems(restaurantSlug?: string) {
  const items = await loadMenuItemsAsync();
  return items.filter((item) =>
    restaurantSlug ? item.restaurantSlug === restaurantSlug : true
  );
}

export async function getAvailableMenuByRestaurant(restaurantSlug: string) {
  const cache = getAvailableMenuCache();
  const cached = cache.get(restaurantSlug);

  if (cached && cached.expiresAt > Date.now()) {
    return cloneMenuItems(cached.items);
  }

  const items = (await getAllMenuItems(restaurantSlug)).filter((item) => item.available);
  cache.set(restaurantSlug, {
    items: cloneMenuItems(items),
    expiresAt: Date.now() + MENU_STORE_CACHE_TTL_MS
  });

  return cloneMenuItems(items);
}

export function preloadAvailableMenuByRestaurant(restaurantSlug: string) {
  void getAvailableMenuByRestaurant(restaurantSlug);
}

export async function getMenuItemById(menuItemId: string) {
  return (await loadMenuItemsAsync()).find((item) => item.id === menuItemId) ?? null;
}

export async function createMenuItem(
  item: Omit<MenuItem, "id"> & Partial<Pick<MenuItem, "id">>
) {
  const items = await loadMenuItemsAsync();
  const nextItem = normalizeMenuItem({
    ...item,
    id: item.id?.trim() || buildMenuItemId()
  } as MenuItem);

  items.push(nextItem);
  await persistMenuItemsAsync(items);
  return nextItem;
}

export async function updateMenuItem(
  menuItemId: string,
  updates: Partial<
    Pick<
      MenuItem,
      | "name"
      | "description"
      | "nameHe"
      | "nameEn"
      | "descriptionHe"
      | "descriptionEn"
      | "price"
      | "available"
      | "showImage"
      | "category"
      | "image"
      | "badges"
      | "volumeOptions"
    >
  >
) {
  const items = await loadMenuItemsAsync();
  const index = items.findIndex((item) => item.id === menuItemId);

  if (index === -1) {
    throw new Error("Menu item not found");
  }

  const current = items[index];
  const next = normalizeMenuItem({
    ...current,
    ...updates,
    id: current.id,
    restaurantSlug: current.restaurantSlug
  });

  items[index] = next;
  await persistMenuItemsAsync(items);
  return next;
}

export async function deleteMenuItem(menuItemId: string) {
  const items = await loadMenuItemsAsync();
  const index = items.findIndex((item) => item.id === menuItemId);

  if (index === -1) {
    throw new Error("Menu item not found");
  }

  const [deletedItem] = items.splice(index, 1);
  await persistMenuItemsAsync(items);
  return deletedItem;
}

export async function getTableSession(
  restaurantSlug: string,
  tableToken: string
): Promise<TableSession | null> {
  const cache = getTableSessionCache();
  const cacheKey = buildSessionCacheKey(restaurantSlug, tableToken);
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cloneTableSession(cached.session);
  }

  const { getRestaurantBySlug } = await import("@/lib/restaurants");
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    cache.set(cacheKey, {
      session: null,
      expiresAt: Date.now() + MENU_STORE_CACHE_TTL_MS
    });
    return null;
  }

  const table = restaurant.tables.find((item) => item.accessToken === tableToken);

  if (!table) {
    cache.set(cacheKey, {
      session: null,
      expiresAt: Date.now() + MENU_STORE_CACHE_TTL_MS
    });
    return null;
  }

  const session: TableSession = {
    restaurant,
    table,
    menu: await getAvailableMenuByRestaurant(restaurantSlug)
  };

  cache.set(cacheKey, {
    session: cloneTableSession(session),
    expiresAt: Date.now() + MENU_STORE_CACHE_TTL_MS
  });

  return cloneTableSession(session);
}

export function preloadTableSession(restaurantSlug: string, tableToken: string) {
  void getTableSession(restaurantSlug, tableToken);
}
