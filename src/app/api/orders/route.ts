import { NextRequest, NextResponse } from "next/server";

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
