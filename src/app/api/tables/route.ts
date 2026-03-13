import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
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
    tables: getTableOverviews(restaurantSlug ?? undefined),
    closedSessions: getClosedTableSummaries(restaurantSlug ?? undefined)
  });
}

export async function PATCH(request: NextRequest) {
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
        moveTableOrders(
          body.restaurantSlug,
          body.tableNumber,
          body.targetTableNumber
        )
      );
    }

    return NextResponse.json(closeTable(body.restaurantSlug, body.tableNumber));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
