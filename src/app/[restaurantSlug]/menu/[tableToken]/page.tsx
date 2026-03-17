import { notFound } from "next/navigation";

import { Cart } from "@/components/menu/Cart";
import { getAvailableMenuByRestaurant, getTableSession } from "@/lib/menu-store";
import { getMenuSettings } from "@/lib/menu-settings";
import { getTableSessionOrders } from "@/lib/orders";
import { getRestaurantBySlug } from "@/lib/restaurants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MenuPageProps = {
  params: Promise<{
    restaurantSlug: string;
    tableToken: string;
  }>;
};

export default async function RestaurantMenuPage({ params }: MenuPageProps) {
  const { restaurantSlug, tableToken } = await params;
  const menuSettings = await getMenuSettings();

  if (tableToken === "0") {
    const restaurant = await getRestaurantBySlug(restaurantSlug);

    if (!restaurant) {
      notFound();
    }

    return (
      <main>
        <Cart
          restaurantSlug={restaurant.slug}
          restaurantName={restaurant.name}
          tableNumber={0}
          tableToken="0"
          orderingEnabled={false}
          menu={await getAvailableMenuByRestaurant(restaurantSlug)}
          showKitchenLoadWarning={menuSettings.kitchenLoadWarningEnabled}
          showKitchenOpen={menuSettings.kitchenOpenEnabled}
          kitchenOpenUntil={menuSettings.kitchenOpenUntil}
          showBarOpen={menuSettings.barOpenEnabled}
          barOpenUntil={menuSettings.barOpenUntil}
          initialSubmittedOrders={[]}
        />
      </main>
    );
  }

  const session = await getTableSession(restaurantSlug, tableToken);

  if (!session) {
    notFound();
  }

  return (
    <main>
      <Cart
        restaurantSlug={session.restaurant.slug}
        restaurantName={session.restaurant.name}
        tableNumber={session.table.number}
        tableToken={session.table.accessToken}
        menu={session.menu}
        showKitchenLoadWarning={menuSettings.kitchenLoadWarningEnabled}
        showKitchenOpen={menuSettings.kitchenOpenEnabled}
        kitchenOpenUntil={menuSettings.kitchenOpenUntil}
        showBarOpen={menuSettings.barOpenEnabled}
        barOpenUntil={menuSettings.barOpenUntil}
        initialSubmittedOrders={await getTableSessionOrders(
          restaurantSlug,
          session.table.number
        )}
      />
    </main>
  );
}
