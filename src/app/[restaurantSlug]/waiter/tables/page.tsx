import { TablesPageClient } from "@/components/admin/TablesPageClient";
export const revalidate = 300;

type RestaurantWaiterTablesPageProps = {
  params: Promise<{
    restaurantSlug: string;
  }>;
};

export default async function RestaurantWaiterTablesPage({
  params
}: RestaurantWaiterTablesPageProps) {
  const { restaurantSlug } = await params;

  return (
    <TablesPageClient
      restaurantSlug={restaurantSlug}
      ordersHref={`/${restaurantSlug}/waiter/orders`}
      tablesHref={`/${restaurantSlug}/waiter/tables`}
      navigationLabel="Waiter navigation"
    />
  );
}
