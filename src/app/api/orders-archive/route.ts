import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import {
  getWeeklyOrdersArchive,
  listWeeklyOrdersArchiveMeta
} from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "admin");

  if (unauthorized) {
    return unauthorized;
  }

  const weekKey = request.nextUrl.searchParams.get("weekKey");

  if (weekKey) {
    const archive = getWeeklyOrdersArchive(weekKey);

    if (!archive) {
      return NextResponse.json({ message: "Archive not found" }, { status: 404 });
    }

    return NextResponse.json(archive);
  }

  return NextResponse.json({
    archives: listWeeklyOrdersArchiveMeta()
  });
}
