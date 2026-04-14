"use client";

import Link from "next/link";

type RestaurantLandingProps = {
  restaurantSlug: string;
  restaurantName: string;
  restaurantDescription: string;
};

export function RestaurantLanding({
  restaurantSlug,
  restaurantName,
  restaurantDescription
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
