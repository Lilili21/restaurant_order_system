import { restaurants } from "@/lib/mock-data";
import { getMenuSettings } from "@/lib/menu-settings";
import { MenuItem, Restaurant, TableSession } from "@/lib/types";
import { getAvailableMenuByRestaurant } from "@/lib/menu-store";

const RESTAURANTS_CACHE_TTL_MS = 2_000;

type RestaurantsCacheEntry = {
  restaurants: Restaurant[];
  expiresAt: number;
  signature: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __restaurantsCache: RestaurantsCacheEntry | undefined;
}

function buildRestaurantsSignature(
  tableCount: number,
  tableTokens: Record<string, string>
) {
  return `${tableCount}:${Object.entries(tableTokens)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("|")}`;
}

export async function getRestaurants() {
  const settings = await getMenuSettings();
  const signature = buildRestaurantsSignature(
    settings.tableCount,
    settings.tableTokens
  );
  const cached = globalThis.__restaurantsCache;

  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.signature === signature
  ) {
    return cached.restaurants.map((restaurant) => ({
      ...restaurant,
      tables: restaurant.tables.map((table) => ({ ...table }))
    }));
  }

  const computedRestaurants = restaurants.map((restaurant) => ({
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
        qrCodeValue: `/${restaurant.slug}/menu/${accessToken}`
      };
    })
  }));

  globalThis.__restaurantsCache = {
    restaurants: computedRestaurants.map((restaurant) => ({
      ...restaurant,
      tables: restaurant.tables.map((table) => ({ ...table }))
    })),
    expiresAt: Date.now() + RESTAURANTS_CACHE_TTL_MS,
    signature
  };

  return computedRestaurants;
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
