import { notFound } from "next/navigation";

import { AdminAccessGate } from "@/components/admin/AdminAccessGate";
import { RestaurantLanding } from "@/components/home/RestaurantLanding";
import { getRestaurantBySlug } from "@/lib/restaurants";

export const revalidate = 300;

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
    <AdminAccessGate scope="admin">
      <RestaurantLanding
        restaurantSlug={restaurant.slug}
        restaurantName={restaurant.name}
        restaurantDescription={restaurant.description}
      />
    </AdminAccessGate>
  );
}
