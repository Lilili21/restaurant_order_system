import Link from "next/link";

import { OrdersList } from "@/components/admin/OrdersList";

export default function AdminOrdersPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>Новые заказы</h1>
          <p className="muted">
            Эта страница опрашивает API каждые 4 секунды и показывает новые заказы.
          </p>
        </div>
        <div className="admin-nav" aria-label="Навигация по админке">
          <div className="admin-switch">
            <Link href="/admin/orders" className="admin-switch__item admin-switch__item--active">
              Заказы
            </Link>
            <Link href="/admin/tables" className="admin-switch__item">
              Столы
            </Link>
          </div>
          <Link href="/admin/menu" className="admin-menu-bubble">
            Меню
          </Link>
        </div>
      </section>

      <OrdersList />
    </main>
  );
}
