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

  return (
    <RestaurantLanding
      restaurantSlug={restaurant.slug}
      restaurantName={restaurant.name}
      restaurantDescription={restaurant.description}
    />
  );
}
