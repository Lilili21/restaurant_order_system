import Link from "next/link";

import { TablesOverview } from "@/components/admin/TablesOverview";

export default function AdminTablesPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>Orders by table</h1>
          <p className="muted">
            Orders are grouped by table here. After you close a table, the next
            session opens automatically with a new ID.
          </p>
        </div>
        <div className="admin-nav" aria-label="Admin navigation">
          <div className="admin-switch">
            <Link href="/admin/orders" className="admin-switch__item">
              Orders
            </Link>
            <Link href="/admin/tables" className="admin-switch__item admin-switch__item--active">
              Tables
            </Link>
          </div>
          <Link href="/admin/menu" className="admin-menu-bubble">
            Menu
          </Link>
        </div>
      </section>

      <TablesOverview />
    </main>
  );
}
