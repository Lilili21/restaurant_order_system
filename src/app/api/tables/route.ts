import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { getMenuSettings } from "@/lib/menu-settings";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import {
  closeTable,
  getClosedTableSummaries,
  getTableOverviews,
  moveTableOrders
} from "@/lib/orders";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const TABLES_API_DEBUG_ENABLED = ["1", "true", "yes", "on"].includes(
  (process.env.DEBUG_ORDERS_STATE ?? "").toLowerCase()
);

function logTablesApiDebug(event: string, payload?: Record<string, unknown>) {
  if (!TABLES_API_DEBUG_ENABLED) {
    return;
  }

  console.info("[tables-api-debug]", event, {
    at: new Date().toISOString(),
    ...(payload ?? {})
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "waiter");

  if (unauthorized) {
    return unauthorized;
  }

  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");
  const isValidSlug =
    typeof restaurantSlug === "string" &&
    /^[a-z0-9-]+$/.test(restaurantSlug);

  if (!isValidSlug) {
    return NextResponse.json(
      { message: "restaurantSlug is required" },
      { status: 400 }
    );
  }
  const [tables, closedSessions] = await Promise.all([
    getTableOverviews(restaurantSlug),
    getClosedTableSummaries(restaurantSlug, {
      scope: "current_shift"
    })
  ]);

  logTablesApiDebug("GET", {
    restaurantSlug,
    tablesCount: tables.length,
    closedSessionsCount: closedSessions.length
  });

  return NextResponse.json({
    tables,
    closedSessions
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

  const unauthorized = await requireAdminAccess(request, "waiter");

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
    const settings = await getMenuSettings(restaurantSlug);

    if (settings.orderMode === "counter") {
      throw new Error("Table actions are disabled in counter mode.");
    }

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

      const payload = await moveTableOrders(
        restaurantSlug,
        tableNumber,
        targetTableNumber
      );
      logTablesApiDebug("PATCH.move", {
        restaurantSlug,
        tableNumber,
        targetTableNumber,
        movedOrders: payload.movedOrders
      });

      return NextResponse.json(payload);
    }

    const payload = await closeTable(restaurantSlug, tableNumber);
    logTablesApiDebug("PATCH.close", {
      restaurantSlug,
      tableNumber,
      sessionId: payload.sessionId,
      orderCount: payload.orderCount,
      total: payload.total
    });

    return NextResponse.json(payload);
  } catch (error) {
    logTablesApiDebug("PATCH.error", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
