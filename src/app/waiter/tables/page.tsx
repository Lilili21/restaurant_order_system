import Link from "next/link";

import { AdminAccessGate } from "@/components/admin/AdminAccessGate";
import { TablesOverview } from "@/components/admin/TablesOverview";

export default function WaiterTablesPage() {
  return (
    <AdminAccessGate>
      <main className="page-shell">
        <section className="hero hero--compact">
          <div>
            <h1>Orders by table</h1>
          </div>
          <div className="admin-nav" aria-label="Waiter navigation">
            <div className="admin-switch">
              <Link href="/waiter/orders" className="admin-switch__item">
                Orders
              </Link>
              <Link
                href="/waiter/tables"
                className="admin-switch__item admin-switch__item--active"
              >
                Tables
              </Link>
            </div>
          </div>
        </section>

        <TablesOverview />
      </main>
    </AdminAccessGate>
  );
}
