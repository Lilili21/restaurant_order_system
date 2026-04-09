import { menuItems } from "@/lib/mock-data";
import { formatAgorotToILS, shekelsToAgorot } from "@/lib/money";
import { MenuItem } from "@/lib/types";

export function getMenuByRestaurant(slug: string): MenuItem[] {
  return menuItems.filter(
    (item) => item.restaurantSlug === slug && item.available
  );
}

export function formatCurrency(value: number) {
  return formatAgorotToILS(shekelsToAgorot(value), {
    locale: "ru-RU",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
