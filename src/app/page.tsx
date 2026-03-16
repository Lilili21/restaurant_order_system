import Link from "next/link";

import { TableLinksPanel } from "@/components/home/TableLinksPanel";
import { getRestaurantBySlug } from "@/lib/restaurants";

export default async function HomePage() {
  const restaurant = await getRestaurantBySlug("olive-bistro");

  if (!restaurant) {
    return null;
  }

  const tableLinks = restaurant.tables.map((table) => ({
    tableNumber: table.number,
    href: `/menu/${restaurant.slug}/${table.accessToken}`
  }));

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Restaurant MVP</p>
          <h1>QR ordering for restaurant tables without online payment</h1>
          <p className="lead">
            Guests scan a QR code, open their table menu, and send orders instantly.
            Owners and staff see them in the waiter and admin panels right away.
          </p>
          <div className="hero-actions">
            <Link href="/waiter/orders" className="button-link button-link--hero">
              Waiter
            </Link>
            <Link href="/admin" className="button-link button-link--hero">
              Admin
            </Link>
          </div>
        </div>

        <div className="hero-card">
          <span>Demo restaurant</span>
          <strong>{restaurant.name}</strong>
          <p>{restaurant.description}</p>
        </div>
      </section>

      <TableLinksPanel tableLinks={tableLinks} />
    </main>
  );
}
