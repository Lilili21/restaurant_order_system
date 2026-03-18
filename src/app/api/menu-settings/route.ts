import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { getMenuSettings, updateMenuSettings } from "@/lib/menu-settings";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";

export async function GET() {
  const settings = await getMenuSettings();

  return NextResponse.json({
    kitchenLoadWarningEnabled: settings.kitchenLoadWarningEnabled,
    kitchenOpenEnabled: settings.kitchenOpenEnabled,
    kitchenOpenUntil: settings.kitchenOpenUntil,
    barOpenEnabled: settings.barOpenEnabled,
    barOpenUntil: settings.barOpenUntil,
    tableCount: settings.tableCount,
    tableTokens: settings.tableTokens
  });
}

export async function PATCH(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `menu-settings:patch:${clientId}`,
    maxRequests: 20,
    windowMs: 60 * 1000,
    message: "Too many settings updates. Please try again later."
  });

  if (limited) {
    return limited;
  }

  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as {
      kitchenLoadWarningEnabled?: boolean;
      kitchenOpenEnabled?: boolean;
      kitchenOpenUntil?: string | null;
      barOpenEnabled?: boolean;
      barOpenUntil?: string | null;
      tableCount?: number;
    };

    if (
      typeof body.tableCount === "number" &&
      (!Number.isInteger(body.tableCount) || body.tableCount < 1 || body.tableCount > 100)
    ) {
      throw new Error("tableCount must be an integer from 1 to 100");
    }

    if (typeof body.kitchenOpenUntil === "string") {
      const parsed = Date.parse(body.kitchenOpenUntil);

      if (!Number.isFinite(parsed)) {
        throw new Error("kitchenOpenUntil is invalid");
      }
    }

    if (typeof body.barOpenUntil === "string") {
      const parsed = Date.parse(body.barOpenUntil);

      if (!Number.isFinite(parsed)) {
        throw new Error("barOpenUntil is invalid");
      }
    }

    const updates: {
      kitchenLoadWarningEnabled?: boolean;
      kitchenOpenEnabled?: boolean;
      kitchenOpenUntil?: string | null;
      barOpenEnabled?: boolean;
      barOpenUntil?: string | null;
      tableCount?: number;
    } = {};

    if (typeof body.kitchenLoadWarningEnabled === "boolean") {
      updates.kitchenLoadWarningEnabled = body.kitchenLoadWarningEnabled;
    }

    if (typeof body.kitchenOpenEnabled === "boolean") {
      updates.kitchenOpenEnabled = body.kitchenOpenEnabled;
    }

    if (body.kitchenOpenUntil === null || typeof body.kitchenOpenUntil === "string") {
      updates.kitchenOpenUntil = body.kitchenOpenUntil;
    }

    if (typeof body.barOpenEnabled === "boolean") {
      updates.barOpenEnabled = body.barOpenEnabled;
    }

    if (body.barOpenUntil === null || typeof body.barOpenUntil === "string") {
      updates.barOpenUntil = body.barOpenUntil;
    }

    if (typeof body.tableCount === "number") {
      updates.tableCount = body.tableCount;
    }

    return NextResponse.json(await updateMenuSettings(updates));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
