import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ClosedTableSummary, Order } from "@/lib/types";

type WeeklyOrdersArchive = {
  weekKey: string;
  orders: Order[];
  closedTableSummaries: ClosedTableSummary[];
};

export type WeeklyOrdersArchiveMeta = {
  weekKey: string;
  label: string;
  start: string;
  end: string;
};

const ORDERS_ARCHIVE_DIR = path.join(process.cwd(), "data", "orders-archive");
const TMP_ORDERS_ARCHIVE_DIR = path.join(
  process.env.TMPDIR ?? "/tmp",
  "menu-data",
  "orders-archive"
);
const MAX_WEEKLY_ARCHIVE_FILES = 4;

function getStartOfIsoWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

function getWeekDateRangeForKey(weekKey: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const week = Number.parseInt(match[2], 10);

  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) {
    return null;
  }

  const firstWeekStart = getStartOfIsoWeek(new Date(year, 0, 4));
  const weekStart = new Date(firstWeekStart);
  weekStart.setDate(firstWeekStart.getDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const formatDate = (value: Date) => value.toISOString().slice(0, 10);

  return {
    start: formatDate(weekStart),
    end: formatDate(weekEnd)
  };
}

function getWeekLabel(weekKey: string) {
  const dateRange = getWeekDateRangeForKey(weekKey);

  if (!dateRange) {
    return weekKey;
  }

  return `${dateRange.start} - ${dateRange.end}`;
}

function getWeeklyArchivePath(weekKey: string, baseDir: string) {
  const dateRange = getWeekDateRangeForKey(weekKey);
  const fileName = dateRange
    ? `orders-${weekKey}-${dateRange.start}_to_${dateRange.end}.json`
    : `orders-${weekKey}.json`;

  return path.join(baseDir, fileName);
}

function getLegacyWeeklyArchivePath(weekKey: string, baseDir: string) {
  return path.join(baseDir, `orders-${weekKey}.json`);
}

function readWeeklyArchive(weekKey: string): WeeklyOrdersArchive {
  const readableArchivePath = [
    getWeeklyArchivePath(weekKey, TMP_ORDERS_ARCHIVE_DIR),
    getLegacyWeeklyArchivePath(weekKey, TMP_ORDERS_ARCHIVE_DIR),
    getWeeklyArchivePath(weekKey, ORDERS_ARCHIVE_DIR),
    getLegacyWeeklyArchivePath(weekKey, ORDERS_ARCHIVE_DIR)
  ].find((candidatePath) => existsSync(candidatePath));

  if (!readableArchivePath) {
    return {
      weekKey,
      orders: [],
      closedTableSummaries: []
    };
  }

  try {
    const raw = readFileSync(readableArchivePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WeeklyOrdersArchive>;

    return {
      weekKey,
      orders: Array.isArray(parsed.orders) ? (parsed.orders as Order[]) : [],
      closedTableSummaries: Array.isArray(parsed.closedTableSummaries)
        ? (parsed.closedTableSummaries as ClosedTableSummary[])
        : []
    };
  } catch {
    return {
      weekKey,
      orders: [],
      closedTableSummaries: []
    };
  }
}

export function listWeeklyOrdersArchiveMeta(): WeeklyOrdersArchiveMeta[] {
  const archiveDirectories = [TMP_ORDERS_ARCHIVE_DIR, ORDERS_ARCHIVE_DIR].filter(
    (directoryPath, index, current) =>
      existsSync(directoryPath) && current.indexOf(directoryPath) === index
  );

  if (archiveDirectories.length === 0) {
    return [];
  }

  return archiveDirectories
    .flatMap((directoryPath) => readdirSync(directoryPath))
    .filter((fileName, index, current) => current.indexOf(fileName) === index)
    .map((fileName) => {
      const match = /^orders-(\d{4}-W\d{2})(?:-(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2}))?\.json$/.exec(
        fileName
      );

      if (!match) {
        return null;
      }

      const weekKey = match[1];
      const dateRange = getWeekDateRangeForKey(weekKey);

      return {
        weekKey,
        label: getWeekLabel(weekKey),
        start: match[2] ?? dateRange?.start ?? "",
        end: match[3] ?? dateRange?.end ?? ""
      } satisfies WeeklyOrdersArchiveMeta;
    })
    .filter(Boolean)
    .sort((left, right) => right!.weekKey.localeCompare(left!.weekKey))
    .slice(0, MAX_WEEKLY_ARCHIVE_FILES) as WeeklyOrdersArchiveMeta[];
}

export function getWeeklyOrdersArchive(weekKey: string): WeeklyOrdersArchive | null {
  const archive = readWeeklyArchive(weekKey);

  if (archive.orders.length === 0 && archive.closedTableSummaries.length === 0) {
    return null;
  }

  return archive;
}
