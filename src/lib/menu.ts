import { menuItems, restaurants } from "@/lib/mock-data";
import { MenuItem, TableSession } from "@/lib/types";

export function getRestaurantBySlug(slug: string) {
  return restaurants.find((restaurant) => restaurant.slug === slug) ?? null;
}

export function getMenuByRestaurant(slug: string): MenuItem[] {
  return menuItems.filter(
    (item) => item.restaurantSlug === slug && item.available
  );
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
    menu: getMenuByRestaurant(restaurantSlug)
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0
  }).format(value);
}
