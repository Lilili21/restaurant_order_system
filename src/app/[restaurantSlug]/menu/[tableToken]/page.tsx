import { notFound } from "next/navigation";

import { Cart } from "@/components/menu/Cart";
import {
  getAvailableMenuByRestaurant,
  getTableSession,
  preloadAvailableMenuByRestaurant,
  preloadTableSession
} from "@/lib/menu-store";
import { getMenuSettings } from "@/lib/menu-settings";
import { getRestaurantBySlug } from "@/lib/restaurants";

export const revalidate = 30;

type MenuPageProps = {
  params: Promise<{
    restaurantSlug: string;
    tableToken: string;
  }>;
};

export default async function RestaurantMenuPage({ params }: MenuPageProps) {
  const { restaurantSlug, tableToken } = await params;
  const menuSettingsPromise = getMenuSettings();

  if (tableToken === "0") {
    preloadAvailableMenuByRestaurant(restaurantSlug);

    const [menuSettings, restaurant, menu] = await Promise.all([
      menuSettingsPromise,
      getRestaurantBySlug(restaurantSlug),
      getAvailableMenuByRestaurant(restaurantSlug)
    ]);

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
          menu={menu}
          showKitchenLoadWarning={menuSettings.kitchenLoadWarningEnabled}
          promotions={menuSettings.promotions}
          businessLunches={menuSettings.businessLunches}
          recommendations={menuSettings.recommendations}
          showKitchenOpen={menuSettings.kitchenOpenEnabled}
          kitchenOpenUntil={menuSettings.kitchenOpenUntil}
          showBarOpen={menuSettings.barOpenEnabled}
          barOpenUntil={menuSettings.barOpenUntil}
          initialSubmittedOrders={[]}
        />
      </main>
    );
  }

  preloadTableSession(restaurantSlug, tableToken);

  const [menuSettings, session] = await Promise.all([
    menuSettingsPromise,
    getTableSession(restaurantSlug, tableToken)
  ]);

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
        promotions={menuSettings.promotions}
        businessLunches={menuSettings.businessLunches}
        recommendations={menuSettings.recommendations}
        showKitchenOpen={menuSettings.kitchenOpenEnabled}
        kitchenOpenUntil={menuSettings.kitchenOpenUntil}
        showBarOpen={menuSettings.barOpenEnabled}
        barOpenUntil={menuSettings.barOpenUntil}
        initialSubmittedOrders={[]}
      />
      </main>
    );
}
