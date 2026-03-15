import { restaurants } from "@/lib/mock-data";
import { getMenuSettings } from "@/lib/menu-settings";
import { MenuItem, TableSession } from "@/lib/types";
import { getAvailableMenuByRestaurant } from "@/lib/menu-store";

export async function getRestaurants() {
  const settings = await getMenuSettings();

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

export async function getRestaurantBySlug(slug: string) {
  return (await getRestaurants()).find((restaurant) => restaurant.slug === slug) ?? null;
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
    menu: (await getAvailableMenuByRestaurant(restaurantSlug)) as MenuItem[]
  };
}
