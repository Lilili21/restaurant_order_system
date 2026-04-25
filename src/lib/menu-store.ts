import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { menuItems as defaultMenuItems } from "@/lib/mock-data";
import { resolveMenuImageForRestaurant } from "@/lib/menu-images";
import { agorotToShekels, shekelsToAgorot } from "@/lib/money";
import { getRestaurantBySlug, invalidateRestaurantsCache } from "@/lib/restaurants";
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
const MENU_STORE_CACHE_TTL_MS = 5_000;
const RESTAURANT_LOOKUP_CACHE_TTL_MS = 5 * 60_000;
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

type RestaurantRow = {
  id: string;
  slug: string;
};

type RestaurantLookupCacheEntry = {
  restaurant: RestaurantRow;
  expiresAt: number;
};

type MenuItemRow = {
  id: string;
  restaurant_id: string;
  category_id?: string | null;
  category: string;
  name_he: string | null;
  name_en: string | null;
  name_ru: string | null;
  description_he: string | null;
  description_en: string | null;
  description_ru: string | null;
  price: number | null;
  price_agorot?: number | null;
  image: string | null;
  show_image: boolean | null;
  available: boolean | null;
  badges: unknown;
  volume_options: unknown;
  sort_order: number | null;
};

type MenuCategoryRow = {
  id: string;
  slug: string;
};

function toCategoryLabelFromSlug(slug: string) {
  if (!slug) {
    return "Category";
  }

  return slug
    .replace(/^addon_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function guessMenuCategoryKindBySlug(slug: string) {
  if (slug.startsWith("addon_")) {
    return "dishes";
  }

  if (
    /drink|alcohol|cocktail|draft|beer|wine|vodka|rum|whisk|tequila|gin|cognac|liker|liqueur|ouzo|absent|chaser|fluid|juice|soda|coffee|tea|kompot|kvas/.test(
      slug
    )
  ) {
    return "drinks";
  }

  return "dishes";
}

function normalizeLegacyMenuCategory(value: string): MenuCategory {
  return value === "main_dishes" ? "mains" : (value as MenuCategory);
}

function isMissingPriceAgorotColumnError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    message.includes("column") &&
    message.includes("price_agorot") &&
    message.includes("does not exist")
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __menuStoreCache: MenuStoreCacheEntry | undefined;
  // eslint-disable-next-line no-var
  var __availableMenuCache: Map<string, AvailableMenuCacheEntry> | undefined;
  // eslint-disable-next-line no-var
  var __tableSessionCache: Map<string, TableSessionCacheEntry> | undefined;
  // eslint-disable-next-line no-var
  var __restaurantLookupCache:
    | Map<string, RestaurantLookupCacheEntry>
    | undefined;
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

function appendMissingRestaurantDefaults(items: MenuItem[]) {
  const normalizedItems = cloneMenuItems(items);
  const existingRestaurantSlugs = new Set(
    normalizedItems.map((item) => item.restaurantSlug.trim().toLowerCase())
  );
  const missingDefaultItems = cloneDefaultMenuItems().filter(
    (item) => !existingRestaurantSlugs.has(item.restaurantSlug.trim().toLowerCase())
  );

  if (missingDefaultItems.length === 0) {
    return normalizedItems;
  }

  return [...normalizedItems, ...missingDefaultItems];
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

function getRestaurantLookupCache() {
  globalThis.__restaurantLookupCache ??= new Map();

  for (const [key, entry] of globalThis.__restaurantLookupCache.entries()) {
    if (entry.expiresAt <= Date.now()) {
      globalThis.__restaurantLookupCache.delete(key);
    }
  }

  return globalThis.__restaurantLookupCache;
}

async function getRestaurantSlugMap(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>
) {
  const { data, error } = await supabase.from("restaurants").select("id, slug");

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? (data as RestaurantRow[]) : [];
  return new Map(rows.map((row) => [row.id, row.slug] as const));
}

async function getRestaurantIdBySlug(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  restaurantSlug: string
) {
  const normalizedSlug = restaurantSlug.trim().toLowerCase();
  const lookupCache = getRestaurantLookupCache();
  const cached = lookupCache.get(normalizedSlug);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.restaurant;
  }

  const exactMatch = await supabase
    .from("restaurants")
    .select("id, slug")
    .eq("slug", restaurantSlug)
    .maybeSingle();

  if (!exactMatch.error && exactMatch.data) {
    const restaurant = exactMatch.data as RestaurantRow;
    lookupCache.set(normalizedSlug, {
      restaurant,
      expiresAt: Date.now() + RESTAURANT_LOOKUP_CACHE_TTL_MS
    });
    return restaurant;
  }

  const fallbackMatch = await supabase
    .from("restaurants")
    .select("id, slug")
    .ilike("slug", restaurantSlug)
    .maybeSingle();

  if (fallbackMatch.error || !fallbackMatch.data) {
    return null;
  }

  const restaurant = fallbackMatch.data as RestaurantRow;
  lookupCache.set(normalizedSlug, {
    restaurant,
    expiresAt: Date.now() + RESTAURANT_LOOKUP_CACHE_TTL_MS
  });
  return restaurant;
}

async function getMenuCategoryIdBySlug(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  restaurantId: string,
  categorySlug: string
) {
  const normalizedSlug = normalizeLegacyMenuCategory(categorySlug).trim().toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  const { data, error } = await supabase
    .from("menu_categories")
    .select("id, slug")
    .eq("restaurant_id", restaurantId)
    .eq("slug", normalizedSlug)
    .maybeSingle();

  if (!error && data) {
    return (data as MenuCategoryRow).id;
  }

  const fallback = await supabase
    .from("menu_categories")
    .select("id, slug")
    .eq("restaurant_id", restaurantId)
    .ilike("slug", normalizedSlug)
    .maybeSingle();

  if (!fallback.error && fallback.data) {
    return (fallback.data as MenuCategoryRow).id;
  }

  const nowIso = new Date().toISOString();
  const label = toCategoryLabelFromSlug(normalizedSlug);
  const inferredKind = guessMenuCategoryKindBySlug(normalizedSlug);

  const { error: insertError } = await supabase.from("menu_categories").insert({
    restaurant_id: restaurantId,
    slug: normalizedSlug,
    kind: inferredKind,
    category_type: "regular",
    name_en: label,
    name_he: label,
    name_ru: label,
    sort_order: 0,
    is_active: true,
    created_at: nowIso,
    updated_at: nowIso
  });

  if (insertError) {
    const duplicateConflict =
      insertError.message.includes("duplicate key") ||
      insertError.message.includes("already exists");

    if (!duplicateConflict) {
      return null;
    }
  }

  const retry = await supabase
    .from("menu_categories")
    .select("id, slug")
    .eq("restaurant_id", restaurantId)
    .eq("slug", normalizedSlug)
    .maybeSingle();

  if (retry.error || !retry.data) {
    return null;
  }

  return (retry.data as MenuCategoryRow).id;
}

function mapMenuItemRowToMenuItem(
  row: MenuItemRow,
  restaurantSlug: string
): MenuItem {
  const normalizedPrice =
    typeof row.price_agorot === "number" && Number.isFinite(row.price_agorot)
      ? agorotToShekels(Math.trunc(row.price_agorot))
      : Number(row.price ?? 0);

  return normalizeMenuItem({
    id: row.id,
    restaurantSlug,
    category: normalizeLegacyMenuCategory(row.category),
    name: row.name_he ?? row.name_en ?? row.name_ru ?? "",
    description:
      row.description_he ?? row.description_en ?? row.description_ru ?? "",
    nameHe: row.name_he ?? "",
    nameEn: row.name_en ?? row.name_he ?? "",
    nameRu: row.name_ru ?? row.name_en ?? row.name_he ?? "",
    descriptionHe: row.description_he ?? "",
    descriptionEn: row.description_en ?? row.description_he ?? "",
    descriptionRu:
      row.description_ru ?? row.description_en ?? row.description_he ?? "",
    price: normalizedPrice,
    image: row.image ?? "",
    showImage: row.show_image ?? true,
    available: row.available ?? true,
    badges: Array.isArray(row.badges) ? (row.badges as MenuBadge[]) : [],
    volumeOptions: Array.isArray(row.volume_options)
      ? (row.volume_options as MenuVolumeOption[])
      : []
  });
}

function mapMenuItemToRow(item: MenuItem, restaurantId: string) {
  return {
    id: item.id,
    restaurant_id: restaurantId,
    category_id: null as string | null,
    category: normalizeLegacyMenuCategory(item.category),
    name_he: item.nameHe,
    name_en: item.nameEn,
    name_ru: item.nameRu ?? item.nameEn,
    description_he: item.descriptionHe,
    description_en: item.descriptionEn,
    description_ru: item.descriptionRu ?? item.descriptionEn,
    price: item.price,
    price_agorot: shekelsToAgorot(item.price),
    image: item.image,
    show_image: item.showImage,
    available: item.available,
    badges: item.badges ?? [],
    volume_options: item.volumeOptions ?? []
  };
}

type MenuItemUpsertRow = ReturnType<typeof mapMenuItemToRow>;
type LegacyMenuItemUpsertRow = Omit<MenuItemUpsertRow, "price_agorot" | "category_id">;

function toLegacyCompatibleMenuItemRow(
  row: ReturnType<typeof mapMenuItemToRow>
): LegacyMenuItemUpsertRow {
  const {
    price_agorot: _priceAgorot,
    category_id: _categoryId,
    ...legacyCompatibleRow
  } = row;
  return legacyCompatibleRow;
}

async function loadMenuItemsFromSupabase() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const restaurantSlugMap = await getRestaurantSlugMap(supabase);
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      "id, restaurant_id, category, name_he, name_en, name_ru, description_he, description_en, description_ru, price, price_agorot, image, show_image, available, badges, volume_options, sort_order"
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  let rows: MenuItemRow[] = [];

  if (error) {
    if (!isMissingPriceAgorotColumnError(error.message)) {
      throw new Error(error.message);
    }

    const legacyResult = await supabase
      .from("menu_items")
      .select(
        "id, restaurant_id, category, name_he, name_en, name_ru, description_he, description_en, description_ru, price, image, show_image, available, badges, volume_options, sort_order"
      )
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (legacyResult.error) {
      throw new Error(legacyResult.error.message);
    }

    rows = Array.isArray(legacyResult.data) ? (legacyResult.data as MenuItemRow[]) : [];
  } else {
    rows = Array.isArray(data) ? (data as MenuItemRow[]) : [];
  }

  return rows
    .map((row) => {
      const restaurantSlug = restaurantSlugMap.get(row.restaurant_id);
      return restaurantSlug ? mapMenuItemRowToMenuItem(row, restaurantSlug) : null;
    })
    .filter(Boolean) as MenuItem[];
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
      const normalizedPrice = agorotToShekels(shekelsToAgorot(price));

      if (!Number.isFinite(price)) {
        return null;
      }

      return {
        id:
          option?.id?.trim() ||
          `volume_${index}_${(label || "empty").replace(/\s+/g, "_")}_${Math.max(
            0,
            shekelsToAgorot(price)
          )}`,
        label,
        labelHe: option?.labelHe?.trim() || undefined,
        labelEn: option?.labelEn?.trim() || undefined,
        labelRu: option?.labelRu?.trim() || undefined,
        price: Math.max(0, normalizedPrice)
      };
    })
    .filter(Boolean) as MenuVolumeOption[];
}

function normalizeMenuItem(item: MenuItem): MenuItem {
  const nameHe = item.nameHe?.trim() || item.name?.trim() || "";
  const descriptionHe =
    item.descriptionHe?.trim() || item.description?.trim() || "";
  const nameEn = item.nameEn?.trim() || nameHe;
  const nameRu = item.nameRu?.trim() || nameEn;
  const descriptionEn = item.descriptionEn?.trim() || descriptionHe;
  const descriptionRu = item.descriptionRu?.trim() || descriptionEn;
  const image = resolveMenuImageForRestaurant(item.image, item.restaurantSlug);

  return {
    ...item,
    category: normalizeLegacyMenuCategory(item.category),
    name: nameHe,
    description: descriptionHe,
    nameHe,
    nameEn,
    nameRu,
    descriptionHe,
    descriptionEn,
    descriptionRu,
    price: Number.isFinite(item.price)
      ? Math.max(0, agorotToShekels(shekelsToAgorot(item.price)))
      : 0,
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

    return appendMissingRestaurantDefaults(
      parsed.map((item) => normalizeMenuItem(item))
    );
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
    const supabaseItems = await loadMenuItemsFromSupabase();

    if (supabaseItems && supabaseItems.length > 0) {
      const mergedItems = appendMissingRestaurantDefaults(supabaseItems);
      setMenuStoreCache(mergedItems);
      return cloneMenuItems(mergedItems);
    }

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

  try {
    const restaurantRows = await getRestaurantSlugMap(supabase);
    const slugToId = new Map(
      [...restaurantRows.entries()].map(([id, slug]) => [slug, id] as const)
    );
    const rows = normalized
      .map((item) => {
        const restaurantId = slugToId.get(item.restaurantSlug);
        return restaurantId ? mapMenuItemToRow(item, restaurantId) : null;
      })
      .filter((row): row is MenuItemUpsertRow => Boolean(row));

    if (rows.length > 0) {
      let { error } = await supabase
        .from("menu_items")
        .upsert(rows, { onConflict: "id" });

      if (error && isMissingPriceAgorotColumnError(error.message)) {
        const legacyRows: LegacyMenuItemUpsertRow[] = rows.map(
          toLegacyCompatibleMenuItemRow
        );
        const retryUpsert = await supabase
          .from("menu_items")
          .upsert(legacyRows, { onConflict: "id" });
        error = retryUpsert.error;
      }

      if (error) {
        throw new Error(error.message);
      }

      setMenuStoreCache(normalized);
      clearDerivedMenuCaches();
      return;
    }
  } catch {
    // Fallback to legacy storage below while migration is in progress.
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
  const nextItem = normalizeMenuItem({
    ...item,
    id: item.id?.trim() || buildMenuItemId()
  } as MenuItem);

  const supabase = getSupabaseAdminClient();

  if (supabase) {
    const restaurant = await getRestaurantIdBySlug(supabase, nextItem.restaurantSlug);

    if (!restaurant) {
      throw new Error(`Restaurant "${nextItem.restaurantSlug}" not found.`);
    }

    const row = mapMenuItemToRow(nextItem, restaurant.id);
    const categoryId = await getMenuCategoryIdBySlug(
      supabase,
      restaurant.id,
      nextItem.category
    );

    if (!categoryId) {
      throw new Error(
        `Category "${nextItem.category}" is not registered in menu_categories for ${nextItem.restaurantSlug}.`
      );
    }

    row.category_id = categoryId;
    let { error } = await supabase.from("menu_items").insert(row);

    if (error && isMissingPriceAgorotColumnError(error.message)) {
      const retryInsert = await supabase
        .from("menu_items")
        .insert(toLegacyCompatibleMenuItemRow(row));
      error = retryInsert.error;
    }

    if (error) {
      throw new Error(error.message);
    }

    const current = getMenuStoreCache()?.items ?? [];
    setMenuStoreCache([nextItem, ...current.filter((item) => item.id !== nextItem.id)]);
    clearDerivedMenuCaches(nextItem.restaurantSlug);
    return nextItem;
  }

  const items = await loadMenuItemsAsync();

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
      | "nameRu"
      | "descriptionHe"
      | "descriptionEn"
      | "descriptionRu"
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
  const cachedItems = getMenuStoreCache()?.items;
  const items =
    cachedItems && cachedItems.some((item) => item.id === menuItemId)
      ? cloneMenuItems(cachedItems)
      : await loadMenuItemsAsync();
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

  const supabase = getSupabaseAdminClient();

  if (supabase) {
    const restaurant = await getRestaurantIdBySlug(supabase, current.restaurantSlug);

    if (!restaurant) {
      throw new Error(`Restaurant "${current.restaurantSlug}" not found.`);
    }

    const row = mapMenuItemToRow(next, restaurant.id);
    const categoryId = await getMenuCategoryIdBySlug(
      supabase,
      restaurant.id,
      next.category
    );

    if (!categoryId) {
      throw new Error(
        `Category "${next.category}" is not registered in menu_categories for ${current.restaurantSlug}.`
      );
    }

    row.category_id = categoryId;
    let { error } = await supabase
      .from("menu_items")
      .upsert(row, { onConflict: "id" });

    if (error && isMissingPriceAgorotColumnError(error.message)) {
      const retryUpsert = await supabase
        .from("menu_items")
        .upsert(toLegacyCompatibleMenuItemRow(row), { onConflict: "id" });
      error = retryUpsert.error;
    }

    if (error) {
      throw new Error(error.message);
    }

    items[index] = next;
    setMenuStoreCache(items);
    clearDerivedMenuCaches(current.restaurantSlug);
    return next;
  }

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

  const supabase = getSupabaseAdminClient();

  if (supabase) {
    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", menuItemId);

      if (!error) {
        setMenuStoreCache(items);
        clearDerivedMenuCaches(deletedItem.restaurantSlug);
        return deletedItem;
      }
    } catch {
      // Fall back to legacy storage while migration is in progress.
    }
  }

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

  let restaurant = await getRestaurantBySlug(restaurantSlug);

  let table = restaurant?.tables.find((item) => item.accessToken === tableToken);

  if (!table) {
    invalidateRestaurantsCache();
    restaurant = await getRestaurantBySlug(restaurantSlug);
    table = restaurant?.tables.find((item) => item.accessToken === tableToken);
  }

  if (!restaurant || !table) {
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
