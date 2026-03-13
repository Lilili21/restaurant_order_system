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
          <h1>QR ordering for restaurant tables without online payment</h1>
          <p className="lead">
            Guests scan a QR code, open their table menu, and send orders instantly.
            Owners and staff see them in the admin panel right away.
          </p>
          <div className="hero-actions">
            <Link href="/admin/orders" className="button-link button-link--ghost">
              Open admin panel
            </Link>
          </div>
        </div>

        <div className="hero-card">
          <span>Demo restaurant</span>
          <strong>{restaurant.name}</strong>
          <p>{restaurant.description}</p>
        </div>
      </section>

      <TableLinksPanel restaurantSlug={restaurant.slug} />
    </main>
  );
}
