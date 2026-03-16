import Link from "next/link";

import { MenuEditor } from "@/components/admin/MenuEditor";

export default function AdminMenuPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>Menu editor</h1>
        </div>
        <div className="admin-nav" aria-label="Admin navigation">
          <div className="admin-switch">
            <Link href="/admin/orders" className="admin-switch__item">
              Orders
            </Link>
            <Link href="/admin/tables" className="admin-switch__item">
              Tables
            </Link>
          </div>
          <Link href="/admin/menu" className="admin-menu-bubble admin-menu-bubble--active">
            Menu
          </Link>
        </div>
      </section>
      <MenuEditor />
    </main>
  );
}
