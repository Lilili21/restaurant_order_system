import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminAccessGate } from "@/components/admin/AdminAccessGate";
import { OrdersList } from "@/components/admin/OrdersList";
import { getMenuSettings } from "@/lib/menu-settings";
import { getRestaurantBySlug } from "@/lib/restaurants";

type RestaurantWaiterOrdersPageProps = {
  params: Promise<{
    restaurantSlug: string;
  }>;
};

export default async function RestaurantWaiterOrdersPage({
  params
}: RestaurantWaiterOrdersPageProps) {
  const { restaurantSlug } = await params;
  const [restaurant, settings] = await Promise.all([
    getRestaurantBySlug(restaurantSlug),
    getMenuSettings(restaurantSlug)
  ]);

  if (!restaurant) {
    notFound();
  }
  const isCounterMode = settings.orderMode === "counter";

  return (
    <AdminAccessGate>
      <main className="page-shell">
        <section className="hero hero--compact">
          <div>
            <h1>{isCounterMode ? "Counter queue" : "Incoming orders"}</h1>
          </div>
          <div className="admin-nav" aria-label="Waiter navigation">
            <div className="admin-switch">
              <Link
                href={`/${restaurant.slug}/waiter/orders`}
                className="admin-switch__item admin-switch__item--active"
              >
                Orders
              </Link>
              {!isCounterMode ? (
                <Link
                  href={`/${restaurant.slug}/waiter/tables`}
                  className="admin-switch__item"
                >
                  Tables
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <OrdersList
          orderMode={settings.orderMode}
          restaurantSlug={restaurant.slug}
          restaurantId={restaurant.id}
        />
      </main>
    </AdminAccessGate>
  );
}
