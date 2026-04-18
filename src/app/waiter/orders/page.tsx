import { OrdersPageClient } from "@/components/admin/OrdersPageClient";

const ADMIN_DEFAULT_RESTAURANT_SLUG =
  process.env.ADMIN_DEFAULT_RESTAURANT_SLUG ?? "olive-bistro";
export const revalidate = 300;

export default function WaiterOrdersPage() {
  return (
    <OrdersPageClient
      restaurantSlug={ADMIN_DEFAULT_RESTAURANT_SLUG}
      ordersHref="/waiter/orders"
      tablesHref="/waiter/tables"
      navigationLabel="Waiter navigation"
    />
  );
}
