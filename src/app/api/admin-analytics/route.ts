import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { getMenuSettings } from "@/lib/menu-settings";
import {
  getAllStoredOrders,
  getClosedTableSummaries,
  getTableOverviews
} from "@/lib/orders";
import type { MenuCategory, Order } from "@/lib/types";

export const dynamic = "force-dynamic";

const DRINK_CATEGORIES = new Set<MenuCategory>([
  "drinks",
  "fluids",
  "draft",
  "bottled",
  "fuel",
  "whiskey",
  "vodka",
  "rum",
  "cognac",
  "gin",
  "tequila",
  "absent",
  "ouzo",
  "likers",
  "alcohol",
  "cocktails",
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks"
]);
const ANALYTICS_DEFAULT_TIME_ZONE = "Asia/Jerusalem";

function getRequestTimeZone(request: NextRequest) {
  const headerValue = request.headers.get("x-vercel-ip-timezone");
  return headerValue?.trim() || ANALYTICS_DEFAULT_TIME_ZONE;
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second")
  };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
  timeZone: string
) {
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, seconds, 0);
  const observed = getDatePartsInTimeZone(new Date(utcGuess), timeZone);
  const observedAsUtc = Date.UTC(
    observed.year,
    observed.month - 1,
    observed.day,
    observed.hour,
    observed.minute,
    observed.second,
    0
  );
  const targetAsUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds, 0);
  const diffMs = targetAsUtc - observedAsUtc;

  return new Date(utcGuess + diffMs);
}

function getStartOfDayInTimeZone(date: Date, timeZone: string) {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, timeZone);
}

function getDayOfWeekInTimeZone(date: Date, timeZone: string) {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function isFullDayWindow(from: string | null | undefined, until: string | null | undefined) {
  const normalizedFrom = typeof from === "string" ? from.trim() : "";
  const normalizedUntil = typeof until === "string" ? until.trim() : "";

  return normalizedFrom === "00:00" && (normalizedUntil === "24:00" || normalizedUntil === "00:00");
}

function parseTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 24 ||
    minutes < 0 ||
    minutes > 59 ||
    (hours === 24 && minutes !== 0)
  ) {
    return null;
  }

  return { hours, minutes };
}

function getRuleTimeForDate(
  rules: Array<{
    id: string;
    days: number[];
    from: string | null;
    until: string | null;
  }>,
  date: Date,
  field: "from" | "until",
  fallback: string | null
) {
  const matchedRule = rules.find((rule) => rule.days.includes(date.getDay()));
  const value = matchedRule?.[field];

  return typeof value === "string" && value.trim() ? value : fallback;
}

function getActiveShiftBounds(
  rules: Array<{
    id: string;
    days: number[];
    from: string | null;
    until: string | null;
  }>,
  fallbackFrom: string | null,
  fallbackUntil: string | null,
  now = new Date()
) {
  const candidates = [new Date(now.getTime() - 24 * 60 * 60 * 1000), now]
    .map((date) => {
      const fromValue = getRuleTimeForDate(rules, date, "from", fallbackFrom);
      const untilValue = getRuleTimeForDate(rules, date, "until", fallbackUntil);
      const fromTime = parseTime(fromValue);
      const untilTime = parseTime(untilValue);

      if (!fromTime || !untilTime) {
        return null;
      }

      const start = new Date(date);
      start.setHours(fromTime.hours, fromTime.minutes, 0, 0);

      const end = new Date(date);
      end.setHours(untilTime.hours, untilTime.minutes, 0, 0);

      if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
      }

      return { start, end };
    })
    .filter((candidate): candidate is { start: Date; end: Date } => candidate !== null);

  const nowTs = now.getTime();
  const activeCandidate = candidates.find(
    (candidate) => nowTs >= candidate.start.getTime() && nowTs < candidate.end.getTime()
  );

  return activeCandidate ?? null;
}

function getMostRecentCompletedShiftBounds(
  rules: Array<{
    id: string;
    days: number[];
    from: string | null;
    until: string | null;
  }>,
  fallbackFrom: string | null,
  fallbackUntil: string | null,
  now = new Date()
) {
  const candidates = [
    new Date(now.getTime() - 48 * 60 * 60 * 1000),
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    now
  ]
    .map((date) => {
      const fromValue = getRuleTimeForDate(rules, date, "from", fallbackFrom);
      const untilValue = getRuleTimeForDate(rules, date, "until", fallbackUntil);
      const fromTime = parseTime(fromValue);
      const untilTime = parseTime(untilValue);

      if (!fromTime || !untilTime) {
        return null;
      }

      const start = new Date(date);
      start.setHours(fromTime.hours, fromTime.minutes, 0, 0);

      const end = new Date(date);
      end.setHours(untilTime.hours, untilTime.minutes, 0, 0);

      if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
      }

      return { start, end };
    })
    .filter((candidate): candidate is { start: Date; end: Date } => candidate !== null)
    .filter((candidate) => candidate.end.getTime() <= now.getTime())
    .sort((left, right) => right.end.getTime() - left.end.getTime());

  return candidates[0] ?? null;
}

function getCurrentShiftStartTimestamp(
  rules: Array<{
    id: string;
    days: number[];
    from: string | null;
    until: string | null;
  }>,
  fallbackFrom: string | null,
  fallbackUntil: string | null
) {
  const activeShiftBounds = getActiveShiftBounds(rules, fallbackFrom, fallbackUntil);
  return activeShiftBounds ? activeShiftBounds.start.getTime() : null;
}

function getShiftStartTimestampForDate(
  date: Date,
  rules: Array<{
    id: string;
    days: number[];
    from: string | null;
    until: string | null;
  }>,
  fallbackFrom: string | null
) {
  const fromValue = getRuleTimeForDate(rules, date, "from", fallbackFrom);
  const fromTime = parseTime(fromValue);

  if (!fromTime) {
    return null;
  }

  const start = new Date(date);
  start.setHours(fromTime.hours, fromTime.minutes, 0, 0);
  return start.getTime();
}

function getWindowBounds(
  rules: Array<{
    id: string;
    days: number[];
    from: string | null;
    until: string | null;
  }>,
  fallbackFrom: string | null,
  fallbackUntil: string | null
) {
  const dayBounds = getActiveShiftBounds(rules, fallbackFrom, fallbackUntil);

  if (!dayBounds) {
    return null;
  }

  return {
    start: new Date(dayBounds.end.getTime() - 30 * 60 * 1000),
    end: dayBounds.end
  };
}

function isDishCategory(category: MenuCategory | undefined) {
  return Boolean(category) && !DRINK_CATEGORIES.has(category as MenuCategory);
}

function getRecentDishItems(orders: Order[], start: Date, end: Date) {
  return orders
    .filter((order) => {
      const createdAt = new Date(order.createdAt).getTime();
      return createdAt >= start.getTime() && createdAt <= end.getTime();
    })
    .flatMap((order) =>
      (Array.isArray(order.items) ? order.items : [])
        .filter((item) => isDishCategory(item.category))
        .map((item) => ({
          name: item.name,
          price: item.price,
          createdAt: order.createdAt
        }))
    );
}

function getUniqueDishNames(
  items: Array<{ name: string; price: number }>,
  direction: "desc" | "asc"
) {
  const sorted = [...items].sort((left, right) =>
    direction === "desc" ? right.price - left.price : left.price - right.price
  );
  const names: string[] = [];

  for (const item of sorted) {
    if (!item.name.trim() || names.includes(item.name)) {
      continue;
    }

    names.push(item.name);

    if (names.length === 3) {
      break;
    }
  }

  return names.length ? names.join(", ") : "—";
}

function getPeakHourLabel(orders: Order[], start: Date, end: Date) {
  const counts = new Map<string, number>();

  for (const order of orders) {
    const createdAt = new Date(order.createdAt).getTime();

    if (createdAt < start.getTime() || createdAt > end.getTime()) {
      continue;
    }

    const orderDate = new Date(order.createdAt);
    const label = `${String(orderDate.getHours()).padStart(2, "0")}:00`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const peak = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return peak?.[0] ?? "—";
}

type ClosedSessionSeriesEntry = {
  closedAt: string;
  total: number;
};

function getPeakHourLabelFromClosedSessions(
  sessions: ClosedSessionSeriesEntry[],
  start: Date,
  end: Date
) {
  const counts = new Map<string, number>();

  for (const session of sessions) {
    const closedAt = new Date(session.closedAt).getTime();

    if (closedAt < start.getTime() || closedAt > end.getTime()) {
      continue;
    }

    const sessionDate = new Date(session.closedAt);
    const label = `${String(sessionDate.getHours()).padStart(2, "0")}:00`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const peak = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return peak?.[0] ?? "—";
}

function formatHourLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

function buildHourlyLabels(start: Date, end: Date) {
  const labels: string[] = [];
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);

  while (cursor.getTime() < end.getTime()) {
    labels.push(formatHourLabel(cursor));
    cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
  }

  const endLabel = formatHourLabel(end);
  const endIsExactHour =
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    end.getMilliseconds() === 0;

  if (endIsExactHour && labels[labels.length - 1] === endLabel) {
    labels.pop();
  }

  if (!labels.length && end.getTime() > start.getTime()) {
    labels.push(formatHourLabel(start));
  }

  return labels;
}

function buildHourlySeries(
  sessions: ClosedSessionSeriesEntry[],
  start: Date,
  end: Date
) {
  const labels = buildHourlyLabels(start, end);
  const orderCounts = new Map<string, number>();
  const revenueCounts = new Map<string, number>();

  for (const label of labels) {
    orderCounts.set(label, 0);
    revenueCounts.set(label, 0);
  }

  for (const session of sessions) {
    const closedAt = new Date(session.closedAt).getTime();

    if (closedAt < start.getTime() || closedAt > end.getTime()) {
      continue;
    }

    const bucketLabel = formatHourLabel(new Date(session.closedAt));

    if (!orderCounts.has(bucketLabel)) {
      continue;
    }

    orderCounts.set(bucketLabel, (orderCounts.get(bucketLabel) ?? 0) + 1);
    revenueCounts.set(bucketLabel, (revenueCounts.get(bucketLabel) ?? 0) + session.total);
  }

  return {
    labels,
    ordersByHour: labels.map((label) => orderCounts.get(label) ?? 0),
    revenueTrend: labels.map((label) =>
      Number((revenueCounts.get(label) ?? 0).toFixed(2))
    )
  };
}

function getSessionKey(input: {
  restaurantSlug: string;
  tableNumber: number;
  sessionId: number;
}) {
  return `${input.restaurantSlug}:${input.tableNumber}:${input.sessionId}`;
}

function getActiveSessionCountAtTime(
  orders: Order[],
  closedSessions: Array<{
    restaurantSlug: string;
    tableNumber: number;
    sessionId: number;
    closedAt: string;
  }>,
  startTs: number,
  endTs: number
) {
  const closedSessionKeys = new Set(
    closedSessions
      .filter((session) => {
        const closedAtTs = new Date(session.closedAt).getTime();
        return Number.isFinite(closedAtTs) && closedAtTs >= startTs && closedAtTs <= endTs;
      })
      .map((session) => getSessionKey(session))
  );

  const activeSessionKeys = new Set(
    orders
      .filter((order) => {
        if (
          order.kind === "waiter_call" ||
          order.kind === "bill_request" ||
          order.status === "cancelled"
        ) {
          return false;
        }

        const createdAtTs = new Date(order.createdAt).getTime();
        return Number.isFinite(createdAtTs) && createdAtTs >= startTs && createdAtTs <= endTs;
      })
      .map((order) => getSessionKey(order))
      .filter((sessionKey) => !closedSessionKeys.has(sessionKey))
  );

  return activeSessionKeys.size;
}

function formatVsYesterday(current: number, previous: number, suffix = "") {
  if (current === previous) {
    return "Same as yesterday";
  }

  if (previous === 0) {
    return current > 0 ? `Up from 0 yesterday${suffix}` : "Same as yesterday";
  }

  const change = ((current - previous) / previous) * 100;
  const direction = change > 0 ? "+" : "";

  return `${direction}${Math.round(change)}% vs yesterday${suffix}`;
}

function buildGlobalInsight(input: {
  currentRevenue: number;
  previousRevenue: number;
  currentOrders: number;
  previousOrders: number;
  peakHour: string;
}) {
  let status: "better" | "same" | "worse" = "same";

  if (
    input.currentOrders >= input.previousOrders &&
    input.currentRevenue < input.previousRevenue
  ) {
    status = "worse";
    return {
      status,
      text: `Traffic is healthy so far, but revenue is trailing yesterday. Push upsells before ${input.peakHour}.`
    };
  }

  if (input.currentRevenue > input.previousRevenue) {
    status = "better";
    return {
      status,
      text: `Revenue is ahead of yesterday at this point. Keep the team ready around ${input.peakHour}.`
    };
  }

  if (input.currentRevenue === input.previousRevenue && input.currentOrders === input.previousOrders) {
    return {
      status,
      text: `Performance is tracking close to yesterday so far. Watch ${input.peakHour} for the next shift in momentum.`
    };
  }

  if (input.currentOrders > input.previousOrders) {
    status = "better";
    return {
      status,
      text: `Order volume is ahead of yesterday so far. Watch service speed around ${input.peakHour}.`
    };
  }

  status = "worse";
  return {
    status,
    text: `Peak traffic is building around ${input.peakHour}. Prepare staff and best-sellers just before that window.`
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");
    const analyticsTimeZone = getRequestTimeZone(request);
    const settings = await getMenuSettings(restaurantSlug ?? undefined);
    const analyticsDayBounds = getActiveShiftBounds(
      settings.workingHoursRules,
      settings.workingHoursFrom,
      settings.workingHoursUntil
    );
    const currentShiftStartTs = getCurrentShiftStartTimestamp(
      settings.workingHoursRules,
      settings.workingHoursFrom,
      settings.workingHoursUntil
    );
    const nowTs = Date.now();
    const fallbackShiftStartTs = getStartOfDayInTimeZone(
      new Date(nowTs),
      analyticsTimeZone
    ).getTime();
    const todayInTimeZone = getDayOfWeekInTimeZone(new Date(nowTs), analyticsTimeZone);
    const fullDayWindowConfigured =
      isFullDayWindow(settings.workingHoursFrom, settings.workingHoursUntil) ||
      settings.workingHoursRules.some(
        (rule) =>
          rule.days.includes(todayInTimeZone) && isFullDayWindow(rule.from, rule.until)
      );
    const fullDayShiftStartTs = fullDayWindowConfigured ? fallbackShiftStartTs : null;
    const mostRecentCompletedShift = getMostRecentCompletedShiftBounds(
      settings.workingHoursRules,
      settings.workingHoursFrom,
      settings.workingHoursUntil,
      new Date(nowTs)
    );
    const effectiveShiftStartTs =
      fullDayShiftStartTs ??
      currentShiftStartTs ??
      mostRecentCompletedShift?.start.getTime() ??
      fallbackShiftStartTs;
    const shiftSource = fullDayShiftStartTs !== null
      ? "full_day_window"
      : currentShiftStartTs
      ? "active_shift"
      : mostRecentCompletedShift
        ? "last_completed_shift"
        : "calendar_day_fallback";
    const [allOrdersResult, closedSessionsResult, tablesResult] =
      await Promise.allSettled([
        getAllStoredOrders(restaurantSlug ?? undefined),
        getClosedTableSummaries(restaurantSlug ?? undefined),
        getTableOverviews(restaurantSlug ?? undefined)
      ]);
    const allOrders =
      allOrdersResult.status === "fulfilled" ? allOrdersResult.value : [];
    const closedSessions =
      closedSessionsResult.status === "fulfilled" ? closedSessionsResult.value : [];
    const tables = tablesResult.status === "fulfilled" ? tablesResult.value : [];
    const sourceWarnings = [
      allOrdersResult.status === "rejected" ? "orders_source_failed" : null,
      closedSessionsResult.status === "rejected"
        ? "closed_sessions_source_failed"
        : null,
      tablesResult.status === "rejected" ? "tables_source_failed" : null
    ].filter((value): value is string => Boolean(value));

    const currentShiftWindow =
      fullDayShiftStartTs !== null
        ? {
            start: new Date(Math.max(fullDayShiftStartTs, nowTs - 30 * 60 * 1000)),
            end: new Date(nowTs)
          }
        : getWindowBounds(
            settings.workingHoursRules,
            settings.workingHoursFrom,
            settings.workingHoursUntil
          );

    const shiftOrdersToNow = allOrders.filter((order) => {
      if (
        order.kind === "waiter_call" ||
        order.kind === "bill_request" ||
        order.status === "cancelled"
      ) {
        return false;
      }

      const createdAt = new Date(order.createdAt).getTime();
      return createdAt >= effectiveShiftStartTs && createdAt <= nowTs;
    });
    const analyticsOrders = shiftOrdersToNow;
    const closedSessionsInCurrentShift = closedSessions.filter((session) => {
      const closedAtTs = new Date(session.closedAt).getTime();
      return (
        Number.isFinite(closedAtTs) &&
        closedAtTs >= effectiveShiftStartTs &&
        closedAtTs <= nowTs
      );
    });
    const analyticsClosedSessions = closedSessionsInCurrentShift.map((session) => ({
      closedAt: session.closedAt,
      total: session.total
    }));
    const closedSessionsInCurrentShiftRevenue = closedSessionsInCurrentShift.reduce(
      (sum, session) => sum + session.total,
      0
    );
    const closedSessionsInCurrentShiftAvgCheck =
      closedSessionsInCurrentShift.length > 0
        ? closedSessionsInCurrentShiftRevenue / closedSessionsInCurrentShift.length
        : 0;
    const activeTablesCount = tables.length;
    const totalTablesOrdersCount = activeTablesCount + closedSessionsInCurrentShift.length;
    const waiterCallsCount = allOrders.filter((order) => {
      if (order.kind !== "waiter_call") {
        return false;
      }

      const createdAt = new Date(order.createdAt).getTime();
      return createdAt >= effectiveShiftStartTs && createdAt <= nowTs;
    }).length;
    const currentShiftStartDate = new Date(effectiveShiftStartTs);
    const previousShiftStartTs = fullDayShiftStartTs !== null
      ? getStartOfDayInTimeZone(
          new Date(fullDayShiftStartTs - 60 * 60 * 1000),
          analyticsTimeZone
        ).getTime()
      : currentShiftStartTs
      ? getShiftStartTimestampForDate(
          new Date(currentShiftStartDate.getTime() - 24 * 60 * 60 * 1000),
          settings.workingHoursRules,
          settings.workingHoursFrom
        )
      : effectiveShiftStartTs - 24 * 60 * 60 * 1000;
    const elapsedInCurrentShiftMs = nowTs - effectiveShiftStartTs;
    const previousComparableEndTs = previousShiftStartTs
      ? previousShiftStartTs + elapsedInCurrentShiftMs
      : null;
    const previousClosedSessionsAtComparableTime =
      previousShiftStartTs && previousComparableEndTs
        ? closedSessions.filter((session) => {
            const closedAtTs = new Date(session.closedAt).getTime();
            return (
              Number.isFinite(closedAtTs) &&
              closedAtTs >= previousShiftStartTs &&
              closedAtTs <= previousComparableEndTs
            );
          })
        : [];
    const previousRevenue = previousClosedSessionsAtComparableTime.reduce(
      (sum, session) => sum + session.total,
      0
    );
    const previousAvgCheck =
      previousClosedSessionsAtComparableTime.length > 0
        ? previousRevenue / previousClosedSessionsAtComparableTime.length
        : 0;
    const previousActiveTablesCount =
      previousShiftStartTs && previousComparableEndTs
        ? getActiveSessionCountAtTime(
            allOrders,
            closedSessions,
            previousShiftStartTs,
            previousComparableEndTs
          )
        : 0;
    const previousOrdersCount =
      previousActiveTablesCount + previousClosedSessionsAtComparableTime.length;
    const previousWaiterCallsCount =
      previousShiftStartTs && previousComparableEndTs
        ? allOrders.filter((order) => {
            if (order.kind !== "waiter_call") {
              return false;
            }

            const createdAtTs = new Date(order.createdAt).getTime();
            return (
              Number.isFinite(createdAtTs) &&
              createdAtTs >= previousShiftStartTs &&
              createdAtTs <= previousComparableEndTs
            );
          }).length
        : 0;

    const recentDishItems = currentShiftWindow
      ? getRecentDishItems(analyticsOrders, currentShiftWindow.start, currentShiftWindow.end)
      : [];
    const fullDayBounds =
      fullDayShiftStartTs !== null
        ? {
            start: new Date(fullDayShiftStartTs),
            end: getStartOfDayInTimeZone(
              new Date(fullDayShiftStartTs + 36 * 60 * 60 * 1000),
              analyticsTimeZone
            )
          }
        : null;
    const effectiveDayBounds = fullDayBounds ?? analyticsDayBounds;
    const hourlySeries = effectiveDayBounds
      ? buildHourlySeries(
          analyticsClosedSessions,
          effectiveDayBounds.start,
          new Date(Math.min(effectiveDayBounds.end.getTime(), nowTs))
        )
      : { labels: [], ordersByHour: [], revenueTrend: [] };

    const globalInsight = buildGlobalInsight({
      currentRevenue: closedSessionsInCurrentShiftRevenue,
      previousRevenue,
      currentOrders: totalTablesOrdersCount,
      previousOrders: previousOrdersCount,
      peakHour: currentShiftWindow
        ? getPeakHourLabelFromClosedSessions(
            analyticsClosedSessions,
            currentShiftWindow.start,
            currentShiftWindow.end
          )
        : "the next busy hour"
    });

    return NextResponse.json({
      insights: {
        revenue: closedSessionsInCurrentShift.length
          ? Number(closedSessionsInCurrentShiftRevenue.toFixed(2))
          : 0,
        avgCheck: closedSessionsInCurrentShift.length
          ? Number(closedSessionsInCurrentShiftAvgCheck.toFixed(2))
          : 0,
        orders: totalTablesOrdersCount,
        activeOrders: activeTablesCount,
        topDish: currentShiftWindow
          ? getUniqueDishNames(recentDishItems, "desc")
          : "—",
        lowDish: currentShiftWindow
          ? getUniqueDishNames(recentDishItems, "asc")
          : "—",
        peakHour: currentShiftWindow
          ? getPeakHourLabelFromClosedSessions(
              analyticsClosedSessions,
              currentShiftWindow.start,
              currentShiftWindow.end
            )
          : "—",
        waiterCalls: String(waiterCallsCount),
        globalInsight: globalInsight.text,
        globalInsightStatus: globalInsight.status,
        vsYesterday: {
          revenue: formatVsYesterday(
            Number(closedSessionsInCurrentShiftRevenue.toFixed(2)),
            Number(previousRevenue.toFixed(2))
          ),
          avgCheck: formatVsYesterday(
            Number(closedSessionsInCurrentShiftAvgCheck.toFixed(2)),
            Number(previousAvgCheck.toFixed(2))
          ),
          orders: formatVsYesterday(totalTablesOrdersCount, previousOrdersCount),
          activeOrders: formatVsYesterday(activeTablesCount, previousActiveTablesCount),
          waiterCalls: formatVsYesterday(waiterCallsCount, previousWaiterCallsCount)
        }
      },
      charts: {
        labels: hourlySeries.labels,
        ordersByHour: hourlySeries.ordersByHour,
        revenueTrend: hourlySeries.revenueTrend
      },
      meta: {
        restaurantSlug: restaurantSlug ?? null,
        timeZone: analyticsTimeZone,
        shiftSource,
        effectiveShiftStart: new Date(effectiveShiftStartTs).toISOString(),
        hasActiveShift: Boolean(currentShiftStartTs),
        fullDayWindowConfigured,
        sourceWarnings
      }
    });
  } catch (error) {
    console.error("Failed to build admin analytics", error);

    return NextResponse.json(
      {
        insights: {
          revenue: 0,
          avgCheck: 0,
          orders: 0,
          activeOrders: 0,
          topDish: "—",
          lowDish: "—",
          peakHour: "—",
          waiterCalls: "0",
          globalInsight: "",
          globalInsightStatus: "same",
          vsYesterday: {
            revenue: null,
            avgCheck: null,
            orders: null,
            activeOrders: null,
            waiterCalls: null
          }
        },
        charts: {
          labels: [],
          ordersByHour: [],
          revenueTrend: []
        },
        meta: {
          error:
            error instanceof Error ? error.message : "Failed to build admin analytics",
          at: new Date().toISOString()
        }
      },
      { status: 200 }
    );
  }
}
