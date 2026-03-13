import Link from "next/link";

import { OrdersList } from "@/components/admin/OrdersList";

export default function AdminOrdersPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>Incoming orders</h1>
          <p className="muted">
            This page polls the API every 4 seconds and shows active incoming orders.
          </p>
        </div>
        <div className="admin-nav" aria-label="Admin navigation">
          <div className="admin-switch">
            <Link href="/admin/orders" className="admin-switch__item admin-switch__item--active">
              Orders
            </Link>
            <Link href="/admin/tables" className="admin-switch__item">
              Tables
            </Link>
          </div>
          <Link href="/admin/menu" className="admin-menu-bubble">
            Menu
          </Link>
        </div>
      </section>

      <OrdersList />
    </main>
  );
}
