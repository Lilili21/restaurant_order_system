import { NextResponse } from "next/server";

import {
  getCurrentTableSessionId,
  getTableSessionOrders,
  getTableSessionServiceRequests
} from "@/lib/orders";
import { getTableSession } from "@/lib/restaurants";

type TableRouteProps = {
  params: Promise<{
    restaurantSlug: string;
    tableToken: string;
  }>;
};

export async function GET(_: Request, { params }: TableRouteProps) {
  const { restaurantSlug, tableToken } = await params;
  const session = getTableSession(restaurantSlug, tableToken);

  if (!session) {
    return NextResponse.json({ message: "Table not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...session,
    currentSessionId: getCurrentTableSessionId(
      restaurantSlug,
      session.table.number
    ),
    submittedOrders: getTableSessionOrders(restaurantSlug, session.table.number),
    activeServiceRequests: getTableSessionServiceRequests(
      restaurantSlug,
      session.table.number
    ).map((order) => order.kind)
  });
}
