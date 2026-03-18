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

    const isValidSlug =
      typeof body.restaurantSlug === "string" &&
      /^[a-z0-9-]+$/.test(body.restaurantSlug);
    const isValidTableNumber =
      typeof body.tableNumber === "number" &&
      Number.isInteger(body.tableNumber) &&
      body.tableNumber >= 1 &&
      body.tableNumber <= 200;

    if (!isValidSlug || !isValidTableNumber) {
      throw new Error("restaurantSlug and tableNumber are required");
    }

    const restaurantSlug = body.restaurantSlug as string;
    const tableNumber = body.tableNumber as number;

    if (body.action === "move") {
      const isValidTargetTable =
        typeof body.targetTableNumber === "number" &&
        Number.isInteger(body.targetTableNumber) &&
        body.targetTableNumber >= 1 &&
        body.targetTableNumber <= 200;

      if (!isValidTargetTable) {
        throw new Error("targetTableNumber is required");
      }

      const targetTableNumber = body.targetTableNumber as number;

      return NextResponse.json(
        await moveTableOrders(
          restaurantSlug,
          tableNumber,
          targetTableNumber
        )
      );
    }

    return NextResponse.json(await closeTable(restaurantSlug, tableNumber));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
