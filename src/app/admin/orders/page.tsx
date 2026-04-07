import Link from "next/link";

import { OrdersList } from "@/components/admin/OrdersList";
import { getMenuSettings } from "@/lib/menu-settings";

const ADMIN_DEFAULT_RESTAURANT_SLUG =
  process.env.ADMIN_DEFAULT_RESTAURANT_SLUG ?? "olive-bistro";

export default async function AdminOrdersPage() {
  const settings = await getMenuSettings(ADMIN_DEFAULT_RESTAURANT_SLUG);
  const isCounterMode = settings.orderMode === "counter";

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>{isCounterMode ? "Counter queue" : "Incoming orders"}</h1>
        </div>
        <div className="admin-nav" aria-label="Admin navigation">
          <div className="admin-switch">
            <Link href="/admin/orders" className="admin-switch__item admin-switch__item--active">
              Orders
            </Link>
            {!isCounterMode ? (
              <Link href="/admin/tables" className="admin-switch__item">
                Tables
              </Link>
            ) : null}
          </div>
          <Link href="/admin/menu" className="admin-menu-bubble">
            Menu
          </Link>
        </div>
      </section>

      <OrdersList orderMode={settings.orderMode} />
    </main>
  );
}
