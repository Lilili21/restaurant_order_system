import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import {
  changeOrderItemQuantity,
  createBillRequest,
  createOrder,
  createWaiterCall,
  getOrders,
  updateOrderItemServed,
  updateOrderStatus
} from "@/lib/orders";
import { OrderStatus } from "@/lib/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[a-z0-9-]+$/.test(value)
  );
}

function isValidTableNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 200
  );
}

function validateServiceRequestPayload(body: unknown) {
  if (!isPlainObject(body)) {
    throw new Error("Invalid payload");
  }

  if (!isValidSlug(body.restaurantSlug)) {
    throw new Error("restaurantSlug is required");
  }

  if (!isValidTableNumber(body.tableNumber)) {
    throw new Error("tableNumber is required");
  }
}

function validateCreateOrderPayload(body: unknown) {
  if (!isPlainObject(body)) {
    throw new Error("Invalid payload");
  }

  if (!isValidSlug(body.restaurantSlug)) {
    throw new Error("restaurantSlug is required");
  }

  if (!isValidTableNumber(body.tableNumber)) {
    throw new Error("tableNumber is required");
  }

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 60) {
    throw new Error("items must contain from 1 to 60 entries");
  }

  for (const item of body.items) {
    if (!isPlainObject(item)) {
      throw new Error("Invalid order item");
    }

    if (typeof item.menuItemId !== "string" || !item.menuItemId.trim()) {
      throw new Error("menuItemId is required");
    }

    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 50
    ) {
      throw new Error("quantity must be an integer from 1 to 50");
    }

    if (typeof item.note === "string" && item.note.length > 300) {
      throw new Error("note is too long");
    }

    if (
      typeof item.volumeOptionId === "string" &&
      item.volumeOptionId.length > 120
    ) {
      throw new Error("volumeOptionId is too long");
    }

    if (typeof item.volumeLabel === "string" && item.volumeLabel.length > 60) {
      throw new Error("volumeLabel is too long");
    }

    if (
      typeof item.priceOverride === "number" &&
      (!Number.isFinite(item.priceOverride) ||
        item.priceOverride < 0 ||
        item.priceOverride > 1_000_000)
    ) {
      throw new Error("priceOverride is invalid");
    }
  }

  if (
    typeof body.clientRequestId === "string" &&
    body.clientRequestId.length > 120
  ) {
    throw new Error("clientRequestId is too long");
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "admin");

  if (unauthorized) {
    return unauthorized;
  }

  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const orders = (await getOrders(restaurantSlug ?? undefined)).filter((order) =>
    sessionId ? order.sessionId === Number(sessionId) : true
  );
  return NextResponse.json(orders);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientId = getRequestClientId(request);
    const action =
      body.type === "waiter_call"
        ? "waiter-call"
        : body.type === "bill_request"
          ? "bill-request"
          : "create-order";
    const limited = applyRateLimit({
      id: `orders:${action}:${clientId}`,
      maxRequests:
        body.type === "waiter_call" || body.type === "bill_request" ? 8 : 20,
      windowMs: 60 * 1000,
      message:
        body.type === "waiter_call"
          ? "Too many waiter calls. Please try again later."
          : body.type === "bill_request"
            ? "Too many bill requests. Please try again later."
            : "Too many order requests. Please try again later."
    });

    if (limited) {
      return limited;
    }

    if (body.type === "waiter_call" || body.type === "bill_request") {
      validateServiceRequestPayload(body);
    } else {
      validateCreateOrderPayload(body);
    }

    const order =
      body.type === "waiter_call"
        ? await createWaiterCall(body)
        : body.type === "bill_request"
          ? await createBillRequest(body)
        : await createOrder(body);
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
        ? await changeOrderItemQuantity(
            body.orderId,
            body.orderItemId,
            body.quantityDelta
          )
        : typeof body.orderItemId === "string" && typeof body.served === "boolean"
        ? await updateOrderItemServed(body.orderId, body.orderItemId, body.served)
        : body.status
          ? await updateOrderStatus(body.orderId, body.status)
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
