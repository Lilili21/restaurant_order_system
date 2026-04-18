import { OrdersPageClient } from "@/components/admin/OrdersPageClient";
export const revalidate = 300;

type RestaurantWaiterOrdersPageProps = {
  params: Promise<{
    restaurantSlug: string;
  }>;
};

export default async function RestaurantWaiterOrdersPage({
  params
}: RestaurantWaiterOrdersPageProps) {
  const { restaurantSlug } = await params;

  return (
    <OrdersPageClient
      restaurantSlug={restaurantSlug}
      ordersHref={`/${restaurantSlug}/waiter/orders`}
      tablesHref={`/${restaurantSlug}/waiter/tables`}
      navigationLabel="Waiter navigation"
    />
  );
}
