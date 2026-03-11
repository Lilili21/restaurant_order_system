import { menuItems } from "@/lib/mock-data";
import { getRestaurantBySlug } from "@/lib/menu";
import { MenuItem, TableSession } from "@/lib/types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const MENU_STORE_PATH = path.join(DATA_DIR, "menu-store.json");
const DEFAULT_MENU_IMAGE =
  "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=900&q=80";

function cloneDefaultMenuItems() {
  return menuItems.map((item) => ({ ...item }));
}

function loadMenuItems() {
  if (!existsSync(MENU_STORE_PATH)) {
    return cloneDefaultMenuItems();
  }

  try {
    const raw = readFileSync(MENU_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as MenuItem[];

    return Array.isArray(parsed) ? parsed : cloneDefaultMenuItems();
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
      "name" | "description" | "price" | "available" | "category" | "image"
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

  if (typeof updates.price === "number" && Number.isFinite(updates.price)) {
    menuItem.price = Math.max(0, Math.round(updates.price));
  }

  if (typeof updates.available === "boolean") {
    menuItem.available = updates.available;
  }

  if (typeof updates.category === "string") {
    menuItem.category = updates.category;
  }

  if (typeof updates.image === "string") {
    menuItem.image = updates.image.trim() || DEFAULT_MENU_IMAGE;
  }

  persistMenuItemsWith(menuStore);
  return menuItem;
}

export function createMenuItem(input: {
  restaurantSlug: string;
  category: MenuItem["category"];
  name: string;
  description: string;
  price: number;
  available: boolean;
  image?: string;
}) {
  const menuStore = loadMenuItems();
  const menuItem: MenuItem = {
    id: `m_${Date.now()}`,
    restaurantSlug: input.restaurantSlug,
    category: input.category,
    name: input.name.trim(),
    description: input.description.trim(),
    price: Math.max(0, Math.round(input.price)),
    image: input.image?.trim() || DEFAULT_MENU_IMAGE,
    available: input.available
  };

  menuStore.unshift(menuItem);
  persistMenuItemsWith(menuStore);
  return menuItem;
}

export function getTableSession(
  restaurantSlug: string,
  tableNumber: number
): TableSession | null {
  const restaurant = getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    return null;
  }

  const table = restaurant.tables.find((item) => item.number === tableNumber);

  if (!table) {
    return null;
  }

  return {
    restaurant,
    table,
    menu: getAvailableMenuByRestaurant(restaurantSlug)
  };
}
