import Link from "next/link";

import { TablesOverview } from "@/components/admin/TablesOverview";

export default function AdminTablesPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>Заказы по столам</h1>
          <p className="muted">
            Здесь заказы сгруппированы по столикам. После закрытия столика для него
            автоматически откроется следующая сессия с новым ID.
          </p>
        </div>
        <div className="admin-nav" aria-label="Навигация по админке">
          <div className="admin-switch">
            <Link href="/admin/orders" className="admin-switch__item">
              Заказы
            </Link>
            <Link href="/admin/tables" className="admin-switch__item admin-switch__item--active">
              Столы
            </Link>
          </div>
          <Link href="/admin/menu" className="admin-menu-bubble">
            Меню
          </Link>
        </div>
      </section>

      <TablesOverview />
    </main>
  );
}
