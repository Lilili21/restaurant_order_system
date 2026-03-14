import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import {
  changeOrderItemQuantity,
  createOrder,
  createWaiterCall,
  getOrders,
  updateOrderItemServed,
  updateOrderStatus
} from "@/lib/orders";
import { OrderStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "admin");

  if (unauthorized) {
    return unauthorized;
  }

  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const orders = getOrders(restaurantSlug ?? undefined).filter((order) =>
    sessionId ? order.sessionId === Number(sessionId) : true
  );
  return NextResponse.json(orders);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientId = getRequestClientId(request);
    const action = body.type === "waiter_call" ? "waiter-call" : "create-order";
    const limited = applyRateLimit({
      id: `orders:${action}:${clientId}`,
      maxRequests: body.type === "waiter_call" ? 8 : 20,
      windowMs: 60 * 1000,
      message:
        body.type === "waiter_call"
          ? "Too many waiter calls. Please try again later."
          : "Too many order requests. Please try again later."
    });

    if (limited) {
      return limited;
    }

    const order =
      body.type === "waiter_call"
        ? createWaiterCall(body)
        : createOrder(body);
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `orders:patch:${clientId}`,
    maxRequests: 120,
    windowMs: 60 * 1000,
    message: "Too many order updates. Please try again later."
  });

  if (limited) {
    return limited;
  }

  const unauthorized = await requireAdminAccess(request, "admin");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as {
      orderId?: string;
      status?: OrderStatus;
      orderItemId?: string;
      served?: boolean;
      quantityDelta?: number;
    };

    if (!body.orderId) {
      throw new Error("orderId is required");
    }

    const order =
      typeof body.orderItemId === "string" &&
      typeof body.quantityDelta === "number"
        ? changeOrderItemQuantity(
            body.orderId,
            body.orderItemId,
            body.quantityDelta
          )
        : typeof body.orderItemId === "string" && typeof body.served === "boolean"
        ? updateOrderItemServed(body.orderId, body.orderItemId, body.served)
        : body.status
          ? updateOrderStatus(body.orderId, body.status)
          : (() => {
              throw new Error(
                "status or order item update payload is required"
              );
            })();

    return NextResponse.json(order);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
