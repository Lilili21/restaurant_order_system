import { restaurants } from "@/lib/mock-data";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { MenuItem, Restaurant, TableSession } from "@/lib/types";
import { getAvailableMenuByRestaurant } from "@/lib/menu-store";
import { randomBytes } from "node:crypto";

const RESTAURANTS_CACHE_TTL_MS = 60_000;

type RestaurantsCacheEntry = {
  restaurants: Restaurant[];
  expiresAt: number;
};

type RestaurantRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currency: string | null;
  is_active: boolean | null;
};

type RestaurantTableRow = {
  id: string;
  restaurant_id: string;
  table_number: number;
  access_token: string;
  seats: number | null;
  zone: string | null;
  is_active: boolean | null;
};

function generateSecureTableToken() {
  return `tbl_${randomBytes(9).toString("base64url")}`;
}

function isInsecureTableToken(
  token: string | null | undefined,
  restaurantSlug: string,
  tableNumber: number
) {
  if (!token || !token.trim()) {
    return true;
  }

  const normalizedToken = token.trim();

  return (
    normalizedToken === `${restaurantSlug}-${tableNumber}` ||
    normalizedToken === `${restaurantSlug}_table_${tableNumber}` ||
    normalizedToken === `table-${tableNumber}` ||
    normalizedToken.length < 12
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __restaurantsCache: RestaurantsCacheEntry | undefined;
}

function cloneRestaurants(items: Restaurant[]) {
  return items.map((restaurant) => ({
    ...restaurant,
    tables: restaurant.tables.map((table) => ({ ...table }))
  }));
}

function getMockRestaurants() {
  return restaurants.map((restaurant) => ({
    ...restaurant,
    tables: restaurant.tables.map((table) => ({ ...table }))
  }));
}

async function getRestaurantsFromSupabase() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const [{ data: restaurantRows, error: restaurantsError }, { data: tableRows, error: tablesError }] =
    await Promise.all([
      supabase
        .from("restaurants")
        .select("id, slug, name, description, currency, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("restaurant_tables")
        .select("id, restaurant_id, table_number, access_token, seats, zone, is_active")
        .eq("is_active", true)
        .order("table_number", { ascending: true })
    ]);

  if (restaurantsError || tablesError) {
    return null;
  }

  if (!restaurantRows?.length) {
    return null;
  }

  const tablesByRestaurant = new Map<string, RestaurantTableRow[]>();

  for (const table of (tableRows ?? []) as RestaurantTableRow[]) {
    const current = tablesByRestaurant.get(table.restaurant_id) ?? [];
    current.push(table);
    tablesByRestaurant.set(table.restaurant_id, current);
  }

  const normalizedRestaurants = (restaurantRows as RestaurantRow[]).map((restaurant) => {
    const restaurantTables = tablesByRestaurant.get(restaurant.id) ?? [];
    const tokenUpdates = restaurantTables
      .filter((table) =>
        isInsecureTableToken(table.access_token, restaurant.slug, Number(table.table_number))
      )
      .map((table) => ({
        id: table.id,
        access_token: generateSecureTableToken()
      }));

    if (tokenUpdates.length > 0) {
      void supabase.from("restaurant_tables").upsert(tokenUpdates, { onConflict: "id" });
    }

    const tokenByTableId = new Map(
      tokenUpdates.map((table) => [table.id, table.access_token] as const)
    );

    return {
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      description: restaurant.description ?? "",
      currency: (restaurant.currency as Restaurant["currency"]) ?? "ILS",
      tables: restaurantTables.map((table) => ({
        id: table.id,
        number: Number(table.table_number),
        seats: table.seats ?? 4,
        zone: table.zone ?? "Hall",
        accessToken: tokenByTableId.get(table.id) ?? table.access_token,
        qrCodeValue: `/${restaurant.slug}/menu/${
          tokenByTableId.get(table.id) ?? table.access_token
        }`
      }))
    } satisfies Restaurant;
  });

  return normalizedRestaurants;
}

export async function getRestaurants() {
  const cached = globalThis.__restaurantsCache;

  if (cached && cached.expiresAt > Date.now()) {
    return cloneRestaurants(cached.restaurants);
  }

  const computedRestaurants =
    (await getRestaurantsFromSupabase()) ?? getMockRestaurants();

  globalThis.__restaurantsCache = {
    restaurants: cloneRestaurants(computedRestaurants),
    expiresAt: Date.now() + RESTAURANTS_CACHE_TTL_MS
  };

  return cloneRestaurants(computedRestaurants);
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
