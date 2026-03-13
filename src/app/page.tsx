import Link from "next/link";

import { TableLinksPanel } from "@/components/home/TableLinksPanel";
import { getRestaurantBySlug } from "@/lib/restaurants";

export default function HomePage() {
  const restaurant = getRestaurantBySlug("olive-bistro");

  if (!restaurant) {
    return null;
  }

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

      <TableLinksPanel restaurantSlug={restaurant.slug} />
    </main>
  );
}
