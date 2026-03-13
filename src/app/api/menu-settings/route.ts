import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { getMenuSettings, updateMenuSettings } from "@/lib/menu-settings";

export async function GET() {
  return NextResponse.json(getMenuSettings());
}

export async function PATCH(request: NextRequest) {
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
