import { NextRequest, NextResponse } from "next/server";

import {
  getCurrentTableSessionId,
  getTableSessionOrders,
  getTableSessionServiceRequests
} from "@/lib/orders";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import { getTableSession } from "@/lib/restaurants";

type TableRouteProps = {
  params: Promise<{
    restaurantSlug: string;
    tableToken: string;
  }>;
};

export async function GET(request: NextRequest, { params }: TableRouteProps) {
  const { restaurantSlug, tableToken } = await params;
  const limited = applyRateLimit({
    id: `table-session:${restaurantSlug}:${tableToken}:${getRequestClientId(request)}`,
    maxRequests: 180,
    windowMs: 60 * 1000,
    message: "Too many requests. Please try again later."
  });

  if (limited) {
    return limited;
  }

  const session = await getTableSession(restaurantSlug, tableToken);

  if (!session) {
    return NextResponse.json({ message: "Table not found" }, { status: 404 });
  }

  const [currentSessionId, submittedOrders, activeServiceRequests] =
    await Promise.all([
      getCurrentTableSessionId(restaurantSlug, session.table.number),
      getTableSessionOrders(restaurantSlug, session.table.number),
      getTableSessionServiceRequests(restaurantSlug, session.table.number)
    ]);

  const response = NextResponse.json({
    currentSessionId,
    menu: session.menu,
    submittedOrders,
    activeServiceRequests: activeServiceRequests.map((order) => order.kind)
  });

  response.headers.set("Cache-Control", "no-store");
  return response;
}
