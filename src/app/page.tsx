import Link from "next/link";

import { restaurants } from "@/lib/mock-data";

export default function HomePage() {
  const restaurant = restaurants[0];

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Restaurant MVP</p>
          <h1>Заказы по QR-коду для столиков без онлайн-оплаты</h1>
          <p className="lead">
            Гость сканирует QR, открывает меню своего столика и отправляет заказ.
            Владелец или персонал сразу видят его в админке.
          </p>
          <div className="hero-actions">
            <Link href={`/menu/${restaurant.slug}/1`} className="button-link">
              Открыть меню столика 1
            </Link>
            <Link href="/admin/orders" className="button-link button-link--ghost">
              Открыть админку
            </Link>
          </div>
        </div>

        <div className="hero-card">
          <span>Демо-ресторан</span>
          <strong>{restaurant.name}</strong>
          <p>{restaurant.description}</p>
        </div>
      </section>
    </main>
  );
}
