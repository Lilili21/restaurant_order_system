import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { getRecentSecurityAuditEvents } from "@/lib/security-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 6;

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "admin");

  if (unauthorized) {
    return unauthorized;
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Number.parseInt(limitParam ?? "100", 10);
  const events = getRecentSecurityAuditEvents(limit);

  return NextResponse.json({
    events,
    count: events.length
  });
}
