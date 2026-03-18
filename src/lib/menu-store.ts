import { menuItems } from "@/lib/mock-data";
import { getRestaurantBySlug } from "@/lib/restaurants";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { MenuBadge, MenuItem, MenuVolumeOption, TableSession } from "@/lib/types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const MENU_STORE_PATH = path.join(DATA_DIR, "menu-store.json");
const MENU_STORE_KEY = "menu-store";
const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";
const MENU_STORE_CACHE_TTL_MS = 2_000;
const ALLOWED_BADGES: MenuBadge[] = [
  "chef_special",
  "most_popular",
  "vegan",
  "spicy",
  "kids_favorite",
  "new",
  "gluten_free",
  "dairy_free",
  "nut_free"
];

type MenuStoreCacheEntry = {
  items: MenuItem[];
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __menuStoreCache: MenuStoreCacheEntry | undefined;
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

function getMenuStoreCache() {
  return globalThis.__menuStoreCache;
}

function setMenuStoreCache(items: MenuItem[]) {
  globalThis.__menuStoreCache = {
    items: cloneMenuItems(items),
    expiresAt: Date.now() + MENU_STORE_CACHE_TTL_MS
  };
}

function cloneDefaultMenuItems(): MenuItem[] {
  return menuItems.map((item) => ({ ...item }));
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

  return {
    ...item,
    name: nameHe,
    description: descriptionHe,
    nameHe,
    nameEn,
    descriptionHe,
    descriptionEn,
    badges: Array.isArray(item.badges)
      ? item.badges.filter((badge): badge is MenuBadge =>
          ALLOWED_BADGES.includes(badge as MenuBadge)
        )
      : [],
    volumeOptions: normalizeVolumeOptions(item.volumeOptions),
    showImage: item.showImage ?? true,
    image: item.image?.trim() || DEFAULT_MENU_IMAGE
  };
}

function loadMenuItems(): MenuItem[] {
  if (!existsSync(MENU_STORE_PATH)) {
    return cloneDefaultMenuItems();
  }

  try {
    const raw = readFileSync(MENU_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as MenuItem[];

    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeMenuItem(item as MenuItem))
      : cloneDefaultMenuItems();
  } catch {
    return cloneDefaultMenuItems();
  }
}

function persistMenuItemsWith(items: MenuItem[]) {
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
    const localItems = loadMenuItems();
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
      setMenuStoreCache(defaults);
      return cloneMenuItems(defaults);
    }

    const parsed = data.value as MenuItem[];
    const normalized = Array.isArray(parsed)
      ? parsed.map((item) => normalizeMenuItem(item as MenuItem))
      : cloneDefaultMenuItems();

    setMenuStoreCache(normalized);
    return cloneMenuItems(normalized);
  } catch {
    const localItems = loadMenuItems();
    setMenuStoreCache(localItems);
    return cloneMenuItems(localItems);
  }
}

async function persistMenuItemsAsync(items: MenuItem[]) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    persistMenuItemsWith(items);
    setMenuStoreCache(items);
    return;
  }

  const { error } = await supabase.from("app_state").upsert(
    {
      key: MENU_STORE_KEY,
      value: items,
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );

  if (error) {
    throw new Error(`Supabase persist failed: ${error.message}`);
  }

  setMenuStoreCache(items);
}

if (!existsSync(MENU_STORE_PATH)) {
  persistMenuItemsWith(cloneDefaultMenuItems());
}

export async function getAllMenuItems(restaurantSlug?: string) {
  return (await loadMenuItemsAsync()).filter((item) =>
    restaurantSlug ? item.restaurantSlug === restaurantSlug : true
  );
}

export async function getAvailableMenuByRestaurant(restaurantSlug: string) {
  return (await getAllMenuItems(restaurantSlug)).filter((item) => item.available);
}

export async function getMenuItemById(menuItemId: string) {
  return (await loadMenuItemsAsync()).find((item) => item.id === menuItemId) ?? null;
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
  const menuStore = await loadMenuItemsAsync();
  const menuItem = menuStore.find((item) => item.id === menuItemId);

  if (!menuItem) {
    throw new Error("Menu item not found");
  }

  if (typeof updates.name === "string") {
    menuItem.name = updates.name.trim() || menuItem.name;
  }

  if (typeof updates.description === "string") {
    menuItem.description = updates.description.trim();
  }

  if (typeof updates.nameHe === "string") {
    menuItem.nameHe = updates.nameHe.trim() || menuItem.nameHe;
  }

  if (typeof updates.nameEn === "string") {
    menuItem.nameEn = updates.nameEn.trim() || menuItem.nameEn;
  }

  if (typeof updates.descriptionHe === "string") {
    menuItem.descriptionHe = updates.descriptionHe.trim();
  }

  if (typeof updates.descriptionEn === "string") {
    menuItem.descriptionEn = updates.descriptionEn.trim();
  }

  if (typeof updates.price === "number" && Number.isFinite(updates.price)) {
    menuItem.price = Math.max(0, Math.round(updates.price));
  }

  if (typeof updates.available === "boolean") {
    menuItem.available = updates.available;
  }

  if (typeof updates.showImage === "boolean") {
    menuItem.showImage = updates.showImage;
  }

  if (typeof updates.category === "string") {
    menuItem.category = updates.category;
  }

  if (typeof updates.image === "string") {
    menuItem.image = updates.image.trim() || DEFAULT_MENU_IMAGE;
  }

  if (Array.isArray(updates.badges)) {
    menuItem.badges = updates.badges.filter((badge): badge is MenuBadge =>
      ALLOWED_BADGES.includes(badge)
    );
  }

  if (Array.isArray(updates.volumeOptions)) {
    menuItem.volumeOptions = normalizeVolumeOptions(updates.volumeOptions);
  }

  menuItem.nameHe = menuItem.nameHe?.trim() || menuItem.name?.trim() || "";
  menuItem.descriptionHe =
    menuItem.descriptionHe?.trim() || menuItem.description?.trim() || "";
  menuItem.nameEn = menuItem.nameEn?.trim() || menuItem.nameHe;
  menuItem.descriptionEn =
    menuItem.descriptionEn?.trim() || menuItem.descriptionHe;
  menuItem.name = menuItem.nameHe;
  menuItem.description = menuItem.descriptionHe;

  await persistMenuItemsAsync(menuStore);
  return normalizeMenuItem(menuItem);
}

export async function createMenuItem(input: {
  restaurantSlug: string;
  category: MenuItem["category"];
  name: string;
  description: string;
  nameHe?: string;
  nameEn?: string;
  descriptionHe?: string;
  descriptionEn?: string;
  price: number;
  available: boolean;
  showImage?: boolean;
  image?: string;
  badges?: MenuBadge[];
  volumeOptions?: MenuVolumeOption[];
}) {
  const menuStore = await loadMenuItemsAsync();
  const menuItem: MenuItem = {
    id: `m_${Date.now()}`,
    restaurantSlug: input.restaurantSlug,
    category: input.category,
    name: (input.nameHe ?? input.name).trim(),
    description: (input.descriptionHe ?? input.description).trim(),
    nameHe: (input.nameHe ?? input.name).trim(),
    nameEn: (input.nameEn ?? input.nameHe ?? input.name).trim(),
    descriptionHe: (input.descriptionHe ?? input.description).trim(),
    descriptionEn: (input.descriptionEn ?? input.descriptionHe ?? input.description).trim(),
    price: Math.max(0, Math.round(input.price)),
    image: input.image?.trim() || DEFAULT_MENU_IMAGE,
    showImage: input.showImage ?? true,
    available: input.available,
    badges: Array.isArray(input.badges)
      ? input.badges.filter((badge): badge is MenuBadge =>
          ALLOWED_BADGES.includes(badge)
        )
      : [],
    volumeOptions: normalizeVolumeOptions(input.volumeOptions)
  };

  menuStore.unshift(menuItem);
  await persistMenuItemsAsync(menuStore);
  return normalizeMenuItem(menuItem);
}

export async function deleteMenuItem(menuItemId: string) {
  const menuStore = await loadMenuItemsAsync();
  const nextMenuStore = menuStore.filter((item) => item.id !== menuItemId);

  if (nextMenuStore.length === menuStore.length) {
    throw new Error("Menu item not found");
  }

  await persistMenuItemsAsync(nextMenuStore);
  return { ok: true };
}

export async function getTableSession(
  restaurantSlug: string,
  tableRef: number | string
): Promise<TableSession | null> {
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    return null;
  }

  const table = restaurant.tables.find((item) =>
    typeof tableRef === "number"
      ? item.number === tableRef
      : item.accessToken === tableRef
  );

  if (!table) {
    return null;
  }

  return {
    restaurant,
    table,
    menu: await getAvailableMenuByRestaurant(restaurantSlug)
  };
}
