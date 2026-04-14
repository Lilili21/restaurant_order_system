import Link from "next/link";

import { AdminAccessGate } from "@/components/admin/AdminAccessGate";
import { OrdersList } from "@/components/admin/OrdersList";
import { getMenuSettings } from "@/lib/menu-settings";

const ADMIN_DEFAULT_RESTAURANT_SLUG =
  process.env.ADMIN_DEFAULT_RESTAURANT_SLUG ?? "olive-bistro";

export default async function WaiterOrdersPage() {
  const settings = await getMenuSettings(ADMIN_DEFAULT_RESTAURANT_SLUG);
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
                href="/waiter/orders"
                className="admin-switch__item admin-switch__item--active"
              >
                Orders
              </Link>
              {!isCounterMode ? (
                <Link href="/waiter/tables" className="admin-switch__item">
                  Tables
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <OrdersList
          orderMode={settings.orderMode}
          restaurantSlug={ADMIN_DEFAULT_RESTAURANT_SLUG}
        />
      </main>
    </AdminAccessGate>
  );
}
