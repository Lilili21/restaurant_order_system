import { NextRequest, NextResponse } from "next/server";

import { getMenuSettings } from "@/lib/menu-settings";
import { getOrdersByGuestToken } from "@/lib/orders";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function isValidSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[a-z0-9-]+$/.test(value)
  );
}

function normalizeGuestToken(value: string | null | undefined) {
  return value && value.trim() ? value.trim().slice(0, 256) : undefined;
}

function getGuestOrdersCookieName(restaurantSlug: string) {
  return `guest_orders_${restaurantSlug.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`;
}

export async function GET(request: NextRequest) {
  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");

  if (!isValidSlug(restaurantSlug)) {
    return NextResponse.json(
      { message: "restaurantSlug is required" },
      { status: 400 }
    );
  }

  const limited = applyRateLimit({
    id: `orders:my:${restaurantSlug}:${getRequestClientId(request)}`,
    maxRequests: 120,
    windowMs: 60 * 1000,
    message: "Too many requests. Please try again later."
  });

  if (limited) {
    return limited;
  }

  const settings = await getMenuSettings(restaurantSlug);
  const historyAllowed = settings.showGuestOrderHistory || settings.orderMode === "counter";

  if (!historyAllowed) {
    return NextResponse.json({ orders: [] });
  }

  const guestToken =
    normalizeGuestToken(request.nextUrl.searchParams.get("guestToken")) ??
    normalizeGuestToken(
      request.cookies.get(getGuestOrdersCookieName(restaurantSlug))?.value
    );

  if (!guestToken) {
    return NextResponse.json({ orders: [] });
  }

  const orders = await getOrdersByGuestToken(restaurantSlug, guestToken);
  const response = NextResponse.json({ orders });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

