import Link from "next/link";

import { getRestaurantBySlug } from "@/lib/restaurants";

export default async function HomePage() {
  const restaurant = await getRestaurantBySlug("olive-bistro");

  if (!restaurant) {
    return null;
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">QR ordering</p>
          <h1>QR ordering</h1>
          <div className="hero-actions">
            <Link
              href={`/${restaurant.slug}`}
              className="button-link button-link--hero"
            >
              Demo restaurant {restaurant.name}
            </Link>
          </div>
        </div>

        <div className="hero-card">
          <span>Demo restaurant</span>
          <strong>{restaurant.name}</strong>
          <p>{restaurant.description}</p>
        </div>
      </section>
    </main>
  );
}
