"use client";

import Link from "next/link";

type RestaurantLandingProps = {
  restaurantSlug: string;
  restaurantName: string;
  restaurantDescription: string;
  tableLinks: Array<{
    label?: string;
    tableNumber: number;
    href: string;
  }>;
};

export function RestaurantLanding({
  restaurantSlug,
  restaurantName,
  restaurantDescription,
  tableLinks: _tableLinks
}: RestaurantLandingProps) {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <div className="hero-actions">
            <Link
              href={`/${restaurantSlug}/waiter/orders`}
              className="button-link button-link--hero"
            >
              Live Orders
            </Link>
            <Link
              href={`/${restaurantSlug}/admin`}
              className="button-link button-link--hero"
            >
              Admin
            </Link>
          </div>
        </div>

        <div className="hero-card">
          <strong>{restaurantName}</strong>
          <p>{restaurantDescription}</p>
        </div>
      </section>
    </main>
  );
}
