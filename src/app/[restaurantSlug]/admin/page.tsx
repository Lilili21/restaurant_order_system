import { notFound } from "next/navigation";

import { MenuEditor } from "@/components/admin/MenuEditor";
import { getRestaurantBySlug } from "@/lib/restaurants";

type RestaurantAdminPageProps = {
  params: Promise<{
    restaurantSlug: string;
  }>;
};

export default async function RestaurantAdminPage({
  params
}: RestaurantAdminPageProps) {
  const { restaurantSlug } = await params;
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>Menu editor</h1>
        </div>
      </section>
      <MenuEditor />
    </main>
  );
}
