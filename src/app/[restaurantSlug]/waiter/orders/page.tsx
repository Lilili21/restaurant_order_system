import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminAccessGate } from "@/components/admin/AdminAccessGate";
import { OrdersList } from "@/components/admin/OrdersList";
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
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  return (
    <AdminAccessGate>
      <main className="page-shell">
        <section className="hero hero--compact">
          <div>
            <h1>Incoming orders</h1>
          </div>
          <div className="admin-nav" aria-label="Waiter navigation">
            <div className="admin-switch">
              <Link
                href={`/${restaurant.slug}/waiter/orders`}
                className="admin-switch__item admin-switch__item--active"
              >
                Orders
              </Link>
              <Link
                href={`/${restaurant.slug}/waiter/tables`}
                className="admin-switch__item"
              >
                Tables
              </Link>
            </div>
          </div>
        </section>

        <OrdersList />
      </main>
    </AdminAccessGate>
  );
}
