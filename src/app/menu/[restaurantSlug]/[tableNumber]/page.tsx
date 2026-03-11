import { notFound } from "next/navigation";

import { Cart } from "@/components/menu/Cart";
import { getTableSession } from "@/lib/menu-store";
import { getTableSessionOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MenuPageProps = {
  params: Promise<{
    restaurantSlug: string;
    tableNumber: string;
  }>;
};

export default async function MenuPage({ params }: MenuPageProps) {
  const { restaurantSlug, tableNumber } = await params;
  const tableNumberValue = Number(tableNumber);
  const session = getTableSession(restaurantSlug, tableNumberValue);

  if (!session) {
    notFound();
  }

  return (
    <main>
      <Cart
        restaurantSlug={session.restaurant.slug}
        restaurantName={session.restaurant.name}
        tableNumber={session.table.number}
        menu={session.menu}
        initialSubmittedOrders={getTableSessionOrders(
          restaurantSlug,
          tableNumberValue
        )}
      />
    </main>
  );
}
