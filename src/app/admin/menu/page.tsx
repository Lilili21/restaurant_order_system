import { MenuPageClient } from "@/components/admin/MenuPageClient";

const ADMIN_DEFAULT_RESTAURANT_SLUG =
  process.env.ADMIN_DEFAULT_RESTAURANT_SLUG ?? "olive-bistro";
export const revalidate = 300;

export default function AdminMenuPage() {
  return (
    <MenuPageClient
      restaurantSlug={ADMIN_DEFAULT_RESTAURANT_SLUG}
      ordersHref="/admin/orders"
      tablesHref="/admin/tables"
      menuHref="/admin/menu"
      showNavigation
    />
  );
}
