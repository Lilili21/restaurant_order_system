import { menuItems } from "@/lib/mock-data";
import { MenuItem } from "@/lib/types";

export function getMenuByRestaurant(slug: string): MenuItem[] {
  return menuItems.filter(
    (item) => item.restaurantSlug === slug && item.available
  );
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0
  }).format(value);
}
