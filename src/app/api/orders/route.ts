import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { requireAdminAccess } from "@/lib/admin-auth";
import {
  normalizeDeviceId,
  normalizePhoneForSecurity,
  verifyCounterCaptcha,
  verifyCounterOtp
} from "@/lib/counter-security";
import type { ContactRequirement } from "@/lib/menu-settings";
import { getMenuSettings } from "@/lib/menu-settings";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import {
  changeOrderItemQuantity,
  createBillRequest,
  createOrder,
  createWaiterCall,
  getOrders,
  updateOrderGuestContact,
  updateOrderCooked,
  updateOrderItemServed,
  updateOrderStatus
} from "@/lib/orders";
import { auditSecurityEvent } from "@/lib/security-audit";
import { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

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

function isValidCounterTableNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 200
  );
}

function normalizeContactValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeClientRequestId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeIdempotencyKey(value: string | null) {
  if (!value || !value.trim()) {
    return undefined;
  }

  return value.trim().slice(0, 120);
}

function normalizeCaptchaToken(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getGuestOrdersCookieName(restaurantSlug: string) {
  return `guest_orders_${restaurantSlug.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`;
}

function generateGuestOrderToken() {
  return `gst_${randomBytes(18).toString("base64url")}`;
}

function validateCounterContactRequirement(
  requirement: ContactRequirement,
  contact: {
    name?: string;
    phone?: string;
  }
) {
  if (requirement === "none") {
    return;
  }

  if (requirement === "phone_only" && !contact.phone) {
    throw new Error("Phone number is required for this restaurant.");
  }

  if (requirement === "name_or_phone" && !contact.name && !contact.phone) {
    throw new Error("Name or phone is required for this restaurant.");
  }
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

function validateCreateOrderPayload(
  body: unknown,
  options?: { allowCounterTableNumber?: boolean }
) {
  if (!isPlainObject(body)) {
    throw new Error("Invalid payload");
  }

  if (!isValidSlug(body.restaurantSlug)) {
    throw new Error("restaurantSlug is required");
  }

  if (options?.allowCounterTableNumber) {
    if (
      body.tableNumber !== undefined &&
      body.tableNumber !== null &&
      !isValidCounterTableNumber(body.tableNumber)
    ) {
      throw new Error("tableNumber is invalid");
    }
  } else if (!isValidTableNumber(body.tableNumber)) {
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

  if (
    typeof body.guestContactName === "string" &&
    body.guestContactName.length > 120
  ) {
    throw new Error("guestContactName is too long");
  }

  if (
    typeof body.guestContactPhone === "string" &&
    body.guestContactPhone.length > 40
  ) {
    throw new Error("guestContactPhone is too long");
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
    const body = (await request.json()) as Record<string, unknown>;
    const clientId = getRequestClientId(request);
    const deviceId =
      normalizeDeviceId(body.deviceId) ??
      normalizeDeviceId(request.headers.get("x-device-id"));
    const idempotencyKey = normalizeIdempotencyKey(
      request.headers.get("idempotency-key") ?? request.headers.get("Idempotency-Key")
    );
    const clientRequestId =
      normalizeClientRequestId(body.clientRequestId) ?? idempotencyKey;
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
      auditSecurityEvent(
        "orders.request_rate_limited",
        {
          action,
          clientId,
          deviceId: deviceId ?? null
        },
        { severity: "warn" }
      );
      return limited;
    }

    if (body.type === "waiter_call" || body.type === "bill_request") {
      validateServiceRequestPayload(body);
    } else {
      if (!isValidSlug(body.restaurantSlug)) {
        throw new Error("restaurantSlug is required");
      }

      const restaurantSlug = body.restaurantSlug;
      const menuSettings = await getMenuSettings(restaurantSlug);
      const counterModeEnabled = menuSettings.orderMode === "counter";
      validateCreateOrderPayload(body, {
        allowCounterTableNumber: counterModeEnabled
      });
      const guestContactName = normalizeContactValue(body.guestContactName);
      const guestContactPhone = normalizeContactValue(body.guestContactPhone);
      const normalizedGuestPhone = normalizePhoneForSecurity(guestContactPhone);

      if (counterModeEnabled) {
        const counterModeLimits = [
          applyRateLimit({
            id: `orders:counter:ip:${restaurantSlug}:${clientId}`,
            maxRequests: 45,
            windowMs: 10 * 60 * 1000,
            message: "Too many counter orders. Please try again later."
          }),
          normalizedGuestPhone
            ? applyRateLimit({
                id: `orders:counter:phone:${restaurantSlug}:${normalizedGuestPhone}`,
                maxRequests: 12,
                windowMs: 10 * 60 * 1000,
                message: "Too many orders from this phone. Please try again later."
              })
            : null,
          deviceId
            ? applyRateLimit({
                id: `orders:counter:device:${restaurantSlug}:${deviceId}`,
                maxRequests: 22,
                windowMs: 10 * 60 * 1000,
                message: "Too many orders from this device. Please try again later."
              })
            : null
        ];
        const counterLimited =
          counterModeLimits.find((response) => response !== null) ?? null;

        if (counterLimited) {
          auditSecurityEvent(
            "counter.order_rate_limited",
            {
              restaurantSlug,
              clientId,
              guestContactPhone: normalizedGuestPhone ?? null,
              deviceId: deviceId ?? null
            },
            { severity: "warn" }
          );
          return counterLimited;
        }

        validateCounterContactRequirement(menuSettings.contactRequirement, {
          name: guestContactName,
          phone: guestContactPhone
        });

        if (
          menuSettings.contactRequirement === "phone_only" &&
          !normalizedGuestPhone
        ) {
          throw new Error("A valid phone number is required for this restaurant.");
        }

        const captchaResult = await verifyCounterCaptcha({
          token: normalizeCaptchaToken(body.captchaToken),
          ip: clientId
        });

        if (!captchaResult.ok) {
          auditSecurityEvent(
            "counter.order_captcha_failed",
            {
              restaurantSlug,
              clientId,
              guestContactPhone: normalizedGuestPhone ?? null,
              deviceId: deviceId ?? null,
              reason: captchaResult.reason
            },
            { severity: "warn" }
          );
          throw new Error("Captcha validation failed.");
        }

        if (menuSettings.requireOtp) {
          if (!normalizedGuestPhone) {
            throw new Error("Phone number is required to verify OTP.");
          }

          const otpCode = normalizeContactValue(body.otpCode);

          if (!otpCode) {
            throw new Error("OTP code is required.");
          }

          verifyCounterOtp({
            restaurantSlug,
            phone: normalizedGuestPhone,
            code: otpCode,
            ip: clientId,
            deviceId
          });
        }
      }

      const tableNumber =
        counterModeEnabled ? 0 : (body.tableNumber as number);
      const guestCookieName = getGuestOrdersCookieName(restaurantSlug);
      const cookieGuestToken = request.cookies.get(guestCookieName)?.value;
      const shouldIssueGuestToken =
        counterModeEnabled ||
        menuSettings.showGuestOrderHistory ||
        Boolean(guestContactName || guestContactPhone);
      const guestToken = shouldIssueGuestToken
        ? normalizeContactValue(cookieGuestToken) ?? generateGuestOrderToken()
        : undefined;
      const order = await createOrder({
        restaurantSlug,
        tableNumber,
        orderChannel: counterModeEnabled ? "counter" : "table",
        items: body.items as Array<{
          menuItemId: string;
          quantity: number;
          note?: string;
          volumeOptionId?: string;
          volumeLabel?: string;
          priceOverride?: number;
        }>,
        serveMode:
          body.serveMode === "all_at_once" || body.serveMode === "as_ready"
            ? body.serveMode
            : undefined,
        clientRequestId,
        guestToken,
        guestContactName,
        guestContactPhone
      });
      if (counterModeEnabled) {
        auditSecurityEvent("counter.order_created", {
          restaurantSlug,
          clientId,
          deviceId: deviceId ?? null,
          guestContactPhone: normalizedGuestPhone ?? null,
          orderId: order.id,
          displayOrderNumber: order.displayOrderNumber ?? null
        });
      }
      const response = NextResponse.json(order, { status: 201 });

      if (guestToken) {
        response.cookies.set({
          name: guestCookieName,
          value: guestToken,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 30
        });
      }

      return response;
    }

    const order =
      body.type === "waiter_call"
        ? await createWaiterCall({
            restaurantSlug: String(body.restaurantSlug),
            tableNumber: Number(body.tableNumber)
          })
        : await createBillRequest({
            restaurantSlug: String(body.restaurantSlug),
            tableNumber: Number(body.tableNumber)
          });
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
  const body = (await request.json()) as {
    orderId?: string;
    status?: OrderStatus;
    orderItemId?: string;
    served?: boolean;
    cooked?: boolean;
    station?: "kitchen" | "bar";
    quantityDelta?: number;
    guestContactName?: string;
    guestContactPhone?: string;
  };

  if (
    body.orderId &&
    (body.guestContactName !== undefined || body.guestContactPhone !== undefined) &&
    !body.status &&
    !body.orderItemId &&
    body.quantityDelta === undefined &&
    body.served === undefined
  ) {
    try {
      const order = await updateOrderGuestContact(body.orderId, {
        guestContactName: body.guestContactName,
        guestContactPhone: body.guestContactPhone
      });

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
        : typeof body.cooked === "boolean"
          ? await updateOrderCooked(
              body.orderId,
              body.cooked,
              body.station === "bar" ? "bar" : "kitchen"
            )
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
