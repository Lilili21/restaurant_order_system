import { menuItems } from "@/lib/mock-data";
import { getRestaurantBySlug } from "@/lib/restaurants";
import { MenuItem, TableSession } from "@/lib/types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const MENU_STORE_PATH = path.join(DATA_DIR, "menu-store.json");
const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";

function cloneDefaultMenuItems() {
  return menuItems.map((item) => ({ ...item }));
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
    showImage: item.showImage ?? true,
    image: item.image?.trim() || DEFAULT_MENU_IMAGE
  };
}

function loadMenuItems() {
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

if (!existsSync(MENU_STORE_PATH)) {
  persistMenuItemsWith(cloneDefaultMenuItems());
}

export function getAllMenuItems(restaurantSlug?: string) {
  return loadMenuItems().filter((item) =>
    restaurantSlug ? item.restaurantSlug === restaurantSlug : true
  );
}

export function getAvailableMenuByRestaurant(restaurantSlug: string) {
  return getAllMenuItems(restaurantSlug).filter((item) => item.available);
}

export function getMenuItemById(menuItemId: string) {
  return loadMenuItems().find((item) => item.id === menuItemId) ?? null;
}

export function updateMenuItem(
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
    >
  >
) {
  const menuStore = loadMenuItems();
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

  menuItem.nameHe = menuItem.nameHe?.trim() || menuItem.name?.trim() || "";
  menuItem.descriptionHe =
    menuItem.descriptionHe?.trim() || menuItem.description?.trim() || "";
  menuItem.nameEn = menuItem.nameEn?.trim() || menuItem.nameHe;
  menuItem.descriptionEn =
    menuItem.descriptionEn?.trim() || menuItem.descriptionHe;
  menuItem.name = menuItem.nameHe;
  menuItem.description = menuItem.descriptionHe;

  persistMenuItemsWith(menuStore);
  return normalizeMenuItem(menuItem);
}

export function createMenuItem(input: {
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
}) {
  const menuStore = loadMenuItems();
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
    available: input.available
  };

  menuStore.unshift(menuItem);
  persistMenuItemsWith(menuStore);
  return normalizeMenuItem(menuItem);
}

export function deleteMenuItem(menuItemId: string) {
  const menuStore = loadMenuItems();
  const nextMenuStore = menuStore.filter((item) => item.id !== menuItemId);

  if (nextMenuStore.length === menuStore.length) {
    throw new Error("Menu item not found");
  }

  persistMenuItemsWith(nextMenuStore);
  return { ok: true };
}

export function getTableSession(
  restaurantSlug: string,
  tableRef: number | string
): TableSession | null {
  const restaurant = getRestaurantBySlug(restaurantSlug);

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
    menu: getAvailableMenuByRestaurant(restaurantSlug)
  };
}
