import { restaurants } from "@/lib/mock-data";
import { getMenuSettings } from "@/lib/menu-settings";
import { MenuItem, TableSession } from "@/lib/types";
import { getMenuByRestaurant } from "@/lib/menu";

export function getRestaurants() {
  const settings = getMenuSettings();

  return restaurants.map((restaurant) => ({
    ...restaurant,
    tables: Array.from({ length: settings.tableCount }, (_, index) => {
      const tableNumber = index + 1;
      const baseTable = restaurant.tables[index];
      const accessToken = settings.tableTokens[String(tableNumber)];

      return {
        id: baseTable?.id ?? `${restaurant.slug}_table_${tableNumber}`,
        number: tableNumber,
        seats: baseTable?.seats ?? (tableNumber <= 4 ? 2 : 4),
        zone: baseTable?.zone ?? (tableNumber <= 4 ? "Hall A" : "Terrace"),
        accessToken,
        qrCodeValue: `/menu/${restaurant.slug}/${accessToken}`
      };
    })
  }));
}

export function getRestaurantBySlug(slug: string) {
  return getRestaurants().find((restaurant) => restaurant.slug === slug) ?? null;
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
    menu: getMenuByRestaurant(restaurantSlug) as MenuItem[]
  };
}
