import { NextResponse } from "next/server";

import { getTableSession } from "@/lib/menu";
import { getTableSessionOrders } from "@/lib/orders";

type TableRouteProps = {
  params: Promise<{
    restaurantSlug: string;
    tableNumber: string;
  }>;
};

export async function GET(_: Request, { params }: TableRouteProps) {
  const { restaurantSlug, tableNumber } = await params;
  const tableNumberValue = Number(tableNumber);
  const session = getTableSession(restaurantSlug, tableNumberValue);

  if (!session) {
    return NextResponse.json({ message: "Table not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...session,
    submittedOrders: getTableSessionOrders(restaurantSlug, tableNumberValue)
  });
}
