import Link from "next/link";

import { getRestaurants } from "@/lib/restaurants";

export default async function HomePage() {
  const restaurants = await getRestaurants();

  if (restaurants.length === 0) {
    return null;
  }

  const primaryRestaurant = restaurants[0];

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">QR ordering</p>
          <h1>QR ordering</h1>
          <div className="hero-actions">
            {restaurants.map((restaurant) => (
              <Link
                key={restaurant.slug}
                href={`/${restaurant.slug}`}
                className="button-link button-link--hero"
              >
                {restaurant.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="hero-card">
          <strong>{primaryRestaurant.name}</strong>
          <p>{primaryRestaurant.description}</p>
        </div>
      </section>
    </main>
  );
}
