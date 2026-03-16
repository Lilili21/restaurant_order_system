import Link from "next/link";
import { notFound } from "next/navigation";

import { TablesOverview } from "@/components/admin/TablesOverview";
import { getRestaurantBySlug } from "@/lib/restaurants";

type RestaurantWaiterTablesPageProps = {
  params: Promise<{
    restaurantSlug: string;
  }>;
};

export default async function RestaurantWaiterTablesPage({
  params
}: RestaurantWaiterTablesPageProps) {
  const { restaurantSlug } = await params;
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>Orders by table</h1>
        </div>
        <div className="admin-nav" aria-label="Waiter navigation">
          <div className="admin-switch">
            <Link
              href={`/${restaurant.slug}/waiter/orders`}
              className="admin-switch__item"
            >
              Orders
            </Link>
            <Link
              href={`/${restaurant.slug}/waiter/tables`}
              className="admin-switch__item admin-switch__item--active"
            >
              Tables
            </Link>
          </div>
        </div>
      </section>

      <TablesOverview />
    </main>
  );
}
