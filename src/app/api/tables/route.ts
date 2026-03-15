import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import {
  closeTable,
  getClosedTableSummaries,
  getTableOverviews,
  moveTableOrders
} from "@/lib/orders";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "admin");

  if (unauthorized) {
    return unauthorized;
  }

  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");

  return NextResponse.json({
    tables: await getTableOverviews(restaurantSlug ?? undefined),
    closedSessions: await getClosedTableSummaries(restaurantSlug ?? undefined)
  });
}

export async function PATCH(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `tables:patch:${clientId}`,
    maxRequests: 40,
    windowMs: 60 * 1000,
    message: "Too many table actions. Please try again later."
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
      action?: "close" | "move";
      restaurantSlug?: string;
      tableNumber?: number;
      targetTableNumber?: number;
    };

    if (!body.restaurantSlug || !body.tableNumber) {
      throw new Error("restaurantSlug and tableNumber are required");
    }

    if (body.action === "move") {
      if (!body.targetTableNumber) {
        throw new Error("targetTableNumber is required");
      }

      return NextResponse.json(
        await moveTableOrders(
          body.restaurantSlug,
          body.tableNumber,
          body.targetTableNumber
        )
      );
    }

    return NextResponse.json(
      await closeTable(body.restaurantSlug, body.tableNumber)
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
