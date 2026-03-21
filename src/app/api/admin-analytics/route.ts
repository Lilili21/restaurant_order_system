import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { getMenuSettings } from "@/lib/menu-settings";
import { getClosedTableSummaries, getOrders, getTableOverviews } from "@/lib/orders";
import { MenuCategory, Order } from "@/lib/types";

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
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks"
]);

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
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return { hours, minutes };
}

function getCurrentDayRuleTime(
  rules: Array<{
    id: string;
    days: number[];
    from: string | null;
    until: string | null;
  }>,
  field: "from" | "until",
  fallback: string | null
) {
  const today = new Date();
  const day = today.getDay();
  const matchedRule = rules.find((rule) => rule.days.includes(day));
  const value = matchedRule?.[field];

  return typeof value === "string" && value.trim() ? value : fallback;
}

function getAnalyticsDayBounds(
  rules: Array<{
    id: string;
    days: number[];
    from: string | null;
    until: string | null;
  }>,
  fallbackFrom: string | null,
  fallbackUntil: string | null
) {
  const fromValue = getCurrentDayRuleTime(rules, "from", fallbackFrom);
  const untilValue = getCurrentDayRuleTime(rules, "until", fallbackUntil);
  const fromTime = parseTime(fromValue);
  const untilTime = parseTime(untilValue);

  if (!fromTime || !untilTime) {
    return null;
  }

  const start = new Date();
  start.setHours(fromTime.hours, fromTime.minutes, 0, 0);

  const end = new Date();
  end.setHours(untilTime.hours, untilTime.minutes, 0, 0);

  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
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
  const dayBounds = getAnalyticsDayBounds(rules, fallbackFrom, fallbackUntil);

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
      order.items
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

function formatHourLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

function buildHourlyLabels(start: Date, end: Date) {
  const labels: string[] = [];
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    labels.push(formatHourLabel(cursor));
    cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
  }

  return labels;
}

function buildHourlySeries(
  orders: Order[],
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

  for (const order of orders) {
    const createdAt = new Date(order.createdAt).getTime();

    if (createdAt < start.getTime() || createdAt > end.getTime()) {
      continue;
    }

    const bucketLabel = formatHourLabel(new Date(order.createdAt));

    if (!orderCounts.has(bucketLabel)) {
      continue;
    }

    orderCounts.set(bucketLabel, (orderCounts.get(bucketLabel) ?? 0) + 1);
    revenueCounts.set(bucketLabel, (revenueCounts.get(bucketLabel) ?? 0) + order.total);
  }

  return {
    labels,
    ordersByHour: labels.map((label) => orderCounts.get(label) ?? 0),
    revenueTrend: labels.map((label) =>
      Number((revenueCounts.get(label) ?? 0).toFixed(2))
    )
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");
  const settings = await getMenuSettings();
  const analyticsDayBounds = getAnalyticsDayBounds(
    settings.workingHoursRules,
    settings.workingHoursFrom,
    settings.workingHoursUntil
  );
  const [activeOrders, tables, closedSessions] = await Promise.all([
    getOrders(restaurantSlug ?? undefined),
    getTableOverviews(restaurantSlug ?? undefined),
    getClosedTableSummaries(restaurantSlug ?? undefined)
  ]);

  const currentShiftWindow = getWindowBounds(
    settings.workingHoursRules,
    settings.workingHoursFrom,
    settings.workingHoursUntil
  );

  const currentActiveDishOrders = tables.flatMap((table) => table.orders ?? []);
  const currentClosedOrders = closedSessions.flatMap((session) => session.orders ?? []);
  const analyticsOrders = [...currentActiveDishOrders, ...currentClosedOrders].filter(
    (order) => order.kind !== "waiter_call" && order.kind !== "bill_request"
  );

  const recentDishItems = currentShiftWindow
    ? getRecentDishItems(analyticsOrders, currentShiftWindow.start, currentShiftWindow.end)
    : [];
  const hourlySeries = analyticsDayBounds
    ? buildHourlySeries(analyticsOrders, analyticsDayBounds.start, analyticsDayBounds.end)
    : { labels: [], ordersByHour: [], revenueTrend: [] };

  return NextResponse.json({
    insights: {
      orders: currentShiftWindow
        ? analyticsOrders.filter((order) => {
            const createdAt = new Date(order.createdAt).getTime();
            return createdAt >= currentShiftWindow.start.getTime() &&
              createdAt <= currentShiftWindow.end.getTime();
          }).length || "—"
        : "—",
      activeOrders:
        currentActiveDishOrders.filter(
          (order) => order.status !== "served" && order.status !== "cancelled"
        ).length || "—",
      topDish: currentShiftWindow
        ? getUniqueDishNames(recentDishItems, "desc")
        : "—",
      lowDish: currentShiftWindow
        ? getUniqueDishNames(recentDishItems, "asc")
        : "—",
      peakHour: currentShiftWindow
        ? getPeakHourLabel(analyticsOrders, currentShiftWindow.start, currentShiftWindow.end)
        : "—",
      waiterCalls:
        activeOrders.filter((order) => order.kind === "waiter_call").length || "—"
    },
    charts: {
      labels: hourlySeries.labels,
      ordersByHour: hourlySeries.ordersByHour,
      revenueTrend: hourlySeries.revenueTrend
    }
  });
}
