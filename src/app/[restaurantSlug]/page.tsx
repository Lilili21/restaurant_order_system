import { notFound } from "next/navigation";

import { RestaurantLanding } from "@/components/home/RestaurantLanding";
import { getRestaurantBySlug } from "@/lib/restaurants";

type RestaurantLandingPageProps = {
  params: Promise<{
    restaurantSlug: string;
  }>;
};

export default async function RestaurantLandingPage({
  params
}: RestaurantLandingPageProps) {
  const { restaurantSlug } = await params;
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const exposeTableLinks =
    process.env.PUBLIC_TABLE_LINKS_ENABLED === "true" ||
    process.env.NODE_ENV !== "production";
  const tableLinks = exposeTableLinks
    ? restaurant.tables.map((table) => ({
          tableNumber: table.number,
          href: `/${restaurant.slug}/menu/${table.accessToken}`
        }))
    : [];

  return (
    <RestaurantLanding
      restaurantSlug={restaurant.slug}
      restaurantName={restaurant.name}
      restaurantDescription={restaurant.description}
      tableLinks={tableLinks}
    />
  );
}
