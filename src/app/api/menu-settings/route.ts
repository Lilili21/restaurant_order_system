import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { getMenuSettings, updateMenuSettings } from "@/lib/menu-settings";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";

export async function GET() {
  const settings = getMenuSettings();

  return NextResponse.json({
    kitchenLoadWarningEnabled: settings.kitchenLoadWarningEnabled,
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
      tableCount?: number;
    };

    return NextResponse.json(
      updateMenuSettings({
        kitchenLoadWarningEnabled: body.kitchenLoadWarningEnabled,
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
