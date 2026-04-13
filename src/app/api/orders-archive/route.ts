import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import {
  getClosedTableSummaries,
  getWeeklyOrdersArchive,
  listWeeklyOrdersArchiveMeta
} from "@/lib/orders";
import type { ClosedTableSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getClosedDateKey(value: string) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

function dedupeClosedSummaries(summaries: ClosedTableSummary[]) {
  const unique = new Map<string, ClosedTableSummary>();

  for (const summary of summaries) {
    const key = [
      summary.restaurantSlug,
      summary.tableNumber,
      summary.sessionId,
      summary.closedAt
    ].join(":");

    unique.set(key, summary);
  }

  return [...unique.values()].sort((left, right) =>
    right.closedAt.localeCompare(left.closedAt)
  );
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "admin");

  if (unauthorized) {
    return unauthorized;
  }

  const weekKey = request.nextUrl.searchParams.get("weekKey");
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  if (weekKey) {
    const archive = getWeeklyOrdersArchive(weekKey);

    if (!archive) {
      return NextResponse.json({ message: "Archive not found" }, { status: 404 });
    }

    return NextResponse.json(archive);
  }

  if (start || end) {
    if (!start || !end || !isValidDateKey(start) || !isValidDateKey(end) || start > end) {
      return NextResponse.json(
        { message: "start and end must be valid YYYY-MM-DD values" },
        { status: 400 }
      );
    }

    const archiveMeta = listWeeklyOrdersArchiveMeta();
    const intersectedWeekKeys = archiveMeta
      .filter((archive) => archive.start && archive.end && archive.start <= end && archive.end >= start)
      .map((archive) => archive.weekKey);

    const archiveSummaries = intersectedWeekKeys.flatMap((currentWeekKey) => {
      const archive = getWeeklyOrdersArchive(currentWeekKey);
      return archive?.closedTableSummaries ?? [];
    });

    const runtimeSummaries = await getClosedTableSummaries(undefined, { scope: "all" });
    const summariesInRange = [...archiveSummaries, ...runtimeSummaries].filter((summary) => {
      const dateKey = getClosedDateKey(summary.closedAt);
      return Boolean(dateKey && dateKey >= start && dateKey <= end);
    });

    return NextResponse.json({
      start,
      end,
      label: `${start} - ${end}`,
      closedTableSummaries: dedupeClosedSummaries(summariesInRange)
    });
  }

  return NextResponse.json({
    archives: listWeeklyOrdersArchiveMeta()
  });
}
