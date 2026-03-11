import { NextRequest, NextResponse } from "next/server";

import {
  closeTable,
  getClosedTableSummaries,
  getTableOverviews
} from "@/lib/orders";

export async function GET(request: NextRequest) {
  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");

  return NextResponse.json({
    tables: getTableOverviews(restaurantSlug ?? undefined),
    closedSessions: getClosedTableSummaries(restaurantSlug ?? undefined)
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      restaurantSlug?: string;
      tableNumber?: number;
    };

    if (!body.restaurantSlug || !body.tableNumber) {
      throw new Error("restaurantSlug and tableNumber are required");
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
