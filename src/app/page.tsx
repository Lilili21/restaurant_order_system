import Link from "next/link";

import { getRestaurants } from "@/lib/restaurants";

export const revalidate = 300;

export default async function HomePage() {
  const restaurants = await getRestaurants();

  if (restaurants.length === 0) {
    return null;
  }

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
                href={`/${restaurant.slug}/admin`}
                className="button-link button-link--hero"
              >
                {restaurant.name}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
