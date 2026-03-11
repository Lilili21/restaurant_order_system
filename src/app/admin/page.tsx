import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Админка</p>
          <h1>Панель ресторана</h1>
          <p className="muted">
            Здесь можно смотреть входящие заказы по столикам и дальше расширять
            систему до статусов, печати на кухню и оплаты.
          </p>
        </div>
        <div className="hero-actions">
          <Link href="/admin/orders" className="button-link">
            Смотреть заказы
          </Link>
          <Link href="/admin/tables" className="button-link button-link--ghost">
            Смотреть столики
          </Link>
        </div>
      </section>
    </main>
  );
}
