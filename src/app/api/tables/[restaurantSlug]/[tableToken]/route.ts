import { NextRequest, NextResponse } from "next/server";

import {
  getTableSessionSnapshot
} from "@/lib/orders";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import { getRestaurantBySlug } from "@/lib/restaurants";
import { getAvailableMenuByRestaurant } from "@/lib/menu-store";

type TableRouteProps = {
  params: Promise<{
    restaurantSlug: string;
    tableToken: string;
  }>;
};

export async function GET(request: NextRequest, { params }: TableRouteProps) {
  const { restaurantSlug, tableToken } = await params;
  const includeMenuPayload = request.nextUrl.searchParams.get("includeMenu") === "1";
  const limited = applyRateLimit({
    id: `table-session:${restaurantSlug}:${tableToken}:${getRequestClientId(request)}`,
    maxRequests: 180,
    windowMs: 60 * 1000,
    message: "Too many requests. Please try again later."
  });

  if (limited) {
    return limited;
  }

  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const table = restaurant?.tables.find((item) => item.accessToken === tableToken);

  if (!restaurant || !table) {
    return NextResponse.json({ message: "Table not found" }, { status: 404 });
  }

  const { currentSessionId, submittedOrders, activeServiceRequests } =
    await getTableSessionSnapshot(restaurantSlug, table.number);
  const menu = includeMenuPayload
    ? await getAvailableMenuByRestaurant(restaurantSlug)
    : undefined;

  const response = NextResponse.json({
    currentSessionId,
    ...(menu ? { menu } : {}),
    submittedOrders,
    activeServiceRequests: activeServiceRequests.map((order) => order.kind)
  });

  response.headers.set("Cache-Control", "no-store");
  return response;
}
