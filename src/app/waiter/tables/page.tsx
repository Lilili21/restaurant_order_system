import Link from "next/link";

import { AdminAccessGate } from "@/components/admin/AdminAccessGate";
import { TablesOverview } from "@/components/admin/TablesOverview";
import { getMenuSettings } from "@/lib/menu-settings";

const ADMIN_DEFAULT_RESTAURANT_SLUG =
  process.env.ADMIN_DEFAULT_RESTAURANT_SLUG ?? "olive-bistro";

export default async function WaiterTablesPage() {
  const settings = await getMenuSettings(ADMIN_DEFAULT_RESTAURANT_SLUG);
  const isCounterMode = settings.orderMode === "counter";

  return (
    <AdminAccessGate>
      <main className="page-shell">
        <section className="hero hero--compact">
          <div>
            <h1>{isCounterMode ? "Counter mode" : "Orders by table"}</h1>
          </div>
          <div className="admin-nav" aria-label="Waiter navigation">
            <div className="admin-switch">
              <Link href="/waiter/orders" className="admin-switch__item">
                Orders
              </Link>
              {!isCounterMode ? (
                <Link
                  href="/waiter/tables"
                  className="admin-switch__item admin-switch__item--active"
                >
                  Tables
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {isCounterMode ? (
          <p className="muted">
            Tables view is disabled in counter mode. Use Orders queue instead.
          </p>
        ) : (
          <TablesOverview />
        )}
      </main>
    </AdminAccessGate>
  );
}
