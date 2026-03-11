import Link from "next/link";

import { MenuEditor } from "@/components/admin/MenuEditor";

export default function AdminMenuPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Menu</p>
          <h1>Редактирование меню</h1>
          <p className="muted">
            Здесь можно менять названия, описания, цену и доступность блюд.
          </p>
        </div>
        <div className="admin-nav" aria-label="Навигация по админке">
          <div className="admin-switch">
            <Link href="/admin/orders" className="admin-switch__item">
              Заказы
            </Link>
            <Link href="/admin/tables" className="admin-switch__item">
              Столы
            </Link>
          </div>
          <Link href="/admin/menu" className="admin-menu-bubble admin-menu-bubble--active">
            Меню
          </Link>
        </div>
      </section>

      <MenuEditor />
    </main>
  );
}
