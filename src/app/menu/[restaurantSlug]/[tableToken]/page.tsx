import { notFound } from "next/navigation";

import { Cart } from "@/components/menu/Cart";
import { getTableSession } from "@/lib/menu-store";
import { getMenuSettings } from "@/lib/menu-settings";
import { getTableSessionOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MenuPageProps = {
  params: Promise<{
    restaurantSlug: string;
    tableToken: string;
  }>;
};

export default async function MenuPage({ params }: MenuPageProps) {
  const { restaurantSlug, tableToken } = await params;
  const session = getTableSession(restaurantSlug, tableToken);
  const menuSettings = getMenuSettings();

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
        initialSubmittedOrders={getTableSessionOrders(
          restaurantSlug,
          session.table.number
        )}
      />
    </main>
  );
}
