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

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  return {
    hours: Number.parseInt(match[1], 10),
    minutes: Number.parseInt(match[2], 10)
  };
}

function isShiftActiveNow(menuSettings: Awaited<ReturnType<typeof getMenuSettings>>) {
  const now = new Date();
  const candidateDates = [
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    now
  ];

  const windows = candidateDates
    .map((date) => {
      const matchedRule = menuSettings.workingHoursRules.find((rule) =>
        rule.days.includes(date.getDay())
      );
      const from = parseTime(matchedRule?.from ?? menuSettings.workingHoursFrom);
      const until = parseTime(matchedRule?.until ?? menuSettings.workingHoursUntil);

      if (!from || !until) {
        return null;
      }

      const start = new Date(date);
      start.setHours(from.hours, from.minutes, 0, 0);

      const end = new Date(date);
      end.setHours(until.hours, until.minutes, 0, 0);

      if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
      }

      return { start, end };
    })
    .filter((window): window is { start: Date; end: Date } => window !== null);

  if (windows.length === 0) {
    return true;
  }

  return windows.some(
    (window) =>
      now.getTime() >= window.start.getTime() && now.getTime() < window.end.getTime()
  );
}

type MenuPageProps = {
  params: Promise<{
    restaurantSlug: string;
    tableToken: string;
  }>;
};

export default async function MenuPage({ params }: MenuPageProps) {
  const { restaurantSlug, tableToken } = await params;
  const menuSettingsPromise = getMenuSettings(restaurantSlug);

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
        orderingEnabled={isShiftActiveNow(menuSettings)}
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
