import { MenuPageClient } from "@/components/admin/MenuPageClient";
export const revalidate = 300;

type RestaurantAdminPageProps = {
  params: Promise<{
    restaurantSlug: string;
  }>;
};

export default async function RestaurantAdminPage({
  params
}: RestaurantAdminPageProps) {
  const { restaurantSlug } = await params;

  return (
    <MenuPageClient restaurantSlug={restaurantSlug} showNavigation={false} />
  );
}
