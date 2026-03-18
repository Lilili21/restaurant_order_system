import Link from "next/link";

import { AdminAccessGate } from "@/components/admin/AdminAccessGate";
import { OrdersList } from "@/components/admin/OrdersList";

export default function WaiterOrdersPage() {
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
                href="/waiter/orders"
                className="admin-switch__item admin-switch__item--active"
              >
                Orders
              </Link>
              <Link href="/waiter/tables" className="admin-switch__item">
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
