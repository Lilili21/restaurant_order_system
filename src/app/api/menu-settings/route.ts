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
    tableCount: settings.tableCount
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

    if (
      typeof body.kitchenOpenUntil === "string" &&
      body.kitchenOpenUntil.length > 10
    ) {
      throw new Error("kitchenOpenUntil is invalid");
    }

    if (typeof body.barOpenUntil === "string" && body.barOpenUntil.length > 10) {
      throw new Error("barOpenUntil is invalid");
    }

    return NextResponse.json(
      await updateMenuSettings({
        kitchenLoadWarningEnabled: body.kitchenLoadWarningEnabled,
        kitchenOpenEnabled: body.kitchenOpenEnabled,
        kitchenOpenUntil: body.kitchenOpenUntil,
        barOpenEnabled: body.barOpenEnabled,
        barOpenUntil: body.barOpenUntil,
        tableCount: body.tableCount
      })
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
