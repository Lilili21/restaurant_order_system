"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

import { formatCurrency } from "@/lib/menu";

type InsightStats = {
  revenue: string;
  avgCheck: string;
  orders: string;
  activeOrders: string;
  topDish: string;
  lowDish: string;
  peakHour: string;
  waiterCalls: string;
  globalInsight: string;
  globalInsightStatus: "better" | "same" | "worse";
  vsYesterday: {
    revenue: string | null;
    avgCheck: string | null;
    orders: string | null;
    activeOrders: string | null;
    waiterCalls: string | null;
  };
};

type DashboardCharts = {
  labels: string[];
  ordersByHour: number[];
  revenueTrend: number[];
};

type DashboardInsight = {
  id: string;
  text: string;
  priority: "high" | "medium" | "low";
};

const analyticsBlocks = [
  {
    icon: "🟢",
    title: "Live status",
    stats: [
      { label: "Revenue", value: "0" },
      { label: "Avg Check", value: "0" },
      { label: "Orders", value: "0" },
      { label: "Active Orders", value: "0" },
      { label: "Waiter Calls", value: "0" }
    ]
  },
  { icon: "🟡", title: "Daily status" }
] as const;

const defaultLiveStatusDescriptions: Record<string, string> = {
  Revenue: "Shift total",
  "Avg Check": "Per order",
  Orders: "Active + closed tables",
  "Active Orders": "Open now",
  "Waiter Calls": "Calls this shift"
};

function parseNumberLikeValue(value: string) {
  const normalized = value.replace(",", ".").replace(/[^0-9.-]+/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSmoothLineChartPath(values: number[]) {
  if (!values.length) {
    return "";
  }

  const width = 100;
  const height = 100;
  const maxValue = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x =
      values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - (value / maxValue) * height;

    return { x, y: Number.isFinite(y) ? y : height };
  });

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;

    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }

  return path;
}

function buildAreaChartPath(values: number[]) {
  if (!values.length) {
    return "";
  }

  const width = 100;
  const height = 100;
  const maxValue = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x =
      values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - (value / maxValue) * height;

    return { x, y: Number.isFinite(y) ? y : height };
  });

  if (points.length === 1) {
    return `M ${points[0].x} ${height} L ${points[0].x} ${points[0].y} L ${points[0].x} ${height} Z`;
  }

  let path = `M ${points[0].x} ${height} L ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;

    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }

  path += ` L ${points[points.length - 1].x} ${height} Z`;

  return path;
}

function getChartMinWidth(labelsLength: number) {
  return Math.max(720, labelsLength * 88);
}

function getChartTicks(maxValue: number) {
  const safeMaxValue = Math.max(maxValue, 1);
  const tickCount = safeMaxValue <= 4 ? safeMaxValue : 4;
  const ticks = Array.from({ length: tickCount }, (_, index) =>
    Math.round((safeMaxValue / tickCount) * (tickCount - index))
  );

  const uniqueTicks = [...new Set(ticks)].filter((tick) => tick > 0);

  return uniqueTicks.length ? uniqueTicks : [safeMaxValue];
}

function getPeakIndex(values: number[]) {
  if (!values.length) {
    return -1;
  }

  return values.indexOf(Math.max(...values));
}

function getSlowIndex(values: number[]) {
  if (!values.length) {
    return -1;
  }

  return values.indexOf(Math.min(...values));
}

function getEverySecondLabel(label: string, index: number) {
  return index % 2 === 0 ? label : "";
}

function getNextHourLabel(label: string) {
  const [hours] = label.split(":");
  const parsedHours = Number.parseInt(hours ?? "", 10);

  if (!Number.isFinite(parsedHours)) {
    return label;
  }

  return `${String((parsedHours + 1) % 24).padStart(2, "0")}:00`;
}

function getPeakTrafficRange(labels: string[], values: number[]) {
  if (!labels.length || !values.length) {
    return null;
  }

  const maxValue = Math.max(...values);

  if (maxValue <= 0) {
    return null;
  }

  const threshold = Math.max(1, Math.ceil(maxValue * 0.75));
  const peakIndex = getPeakIndex(values);

  if (peakIndex < 0) {
    return null;
  }

  let startIndex = peakIndex;
  let endIndex = peakIndex;

  while (startIndex > 0 && values[startIndex - 1] >= threshold) {
    startIndex -= 1;
  }

  while (endIndex < values.length - 1 && values[endIndex + 1] >= threshold) {
    endIndex += 1;
  }

  return `${labels[startIndex]}–${getNextHourLabel(labels[endIndex] ?? labels[startIndex])}`;
}

function getHourNumber(label: string) {
  const [hours] = label.split(":");
  const parsedHours = Number.parseInt(hours ?? "", 10);
  return Number.isFinite(parsedHours) ? parsedHours : null;
}

function isHourWithin(label: string, start: number, end: number) {
  const hour = getHourNumber(label);

  return hour !== null && hour >= start && hour < end;
}

function getFilteredInsights(insights: DashboardInsight[]) {
  return insights.filter((insight) => insight.priority !== "low").slice(0, 3);
}

function buildOrderChartSuggestions(labels: string[], ordersByHour: number[]) {
  const insights: DashboardInsight[] = [];
  const totalOrders = ordersByHour.reduce((sum, value) => sum + value, 0);
  const peakIndex = getPeakIndex(ordersByHour);
  const peakHour = peakIndex >= 0 ? labels[peakIndex] ?? null : null;
  const slowIndex = getSlowIndex(ordersByHour);
  const slowHour = slowIndex >= 0 ? labels[slowIndex] ?? null : null;
  const peakWindow = getPeakTrafficRange(labels, ordersByHour);
  const lunchPeakCount = labels.filter((label, index) =>
    isHourWithin(label, 12, 16) && (ordersByHour[index] ?? 0) > 0
  ).length;
  const eveningOrders = labels
    .map((label, index) => (isHourWithin(label, 19, 23) ? ordersByHour[index] ?? 0 : 0))
    .filter((value) => value > 0);

  if (peakHour) {
    insights.push({
      id: "peak-hour",
      text: `Peak traffic starts at ${peakHour}`,
      priority: "medium"
    });
  }

  if (slowHour && totalOrders > 0) {
    insights.push({
      id: "slow-hour",
      text: `${slowHour} is your slowest hour`,
      priority: "low"
    });
  }

  if (lunchPeakCount >= 2) {
    insights.push({
      id: "peak-window",
      text: "Lunch hours are your busiest period",
      priority: "medium"
    });
  }

  for (let index = 1; index < ordersByHour.length; index += 1) {
    const previous = ordersByHour[index - 1] ?? 0;
    const current = ordersByHour[index] ?? 0;

    if (previous >= 2 && current <= Math.max(0, previous - 1)) {
      insights.push({
        id: `sharp-drop-${index}`,
        text: `Orders drop after ${labels[index - 1]}`,
        priority: "high"
      });
      break;
    }
  }

  if (
    eveningOrders.length >= 2 &&
    Math.max(...eveningOrders) - Math.min(...eveningOrders) <= 1
  ) {
    insights.push({
      id: "steady-evening",
      text: "Evening traffic is steady",
      priority: "medium"
    });
  }

  if (peakWindow && totalOrders > 0) {
    insights.push({
      id: "staffing",
      text: `You may need more staff during ${peakWindow}`,
      priority: "high"
    });
  }

  return getFilteredInsights(insights);
}

function buildRevenueChartSuggestions(
  labels: string[],
  ordersByHour: number[],
  revenueTrend: number[]
) {
  const insights: DashboardInsight[] = [];
  const totalOrders = ordersByHour.reduce((sum, value) => sum + value, 0);
  const totalRevenue = revenueTrend.reduce((sum, value) => sum + value, 0);
  const topRevenueHour = labels[getPeakIndex(revenueTrend)] ?? null;
  const lunchRevenue = labels.reduce(
    (sum, label, index) => sum + (isHourWithin(label, 12, 16) ? revenueTrend[index] ?? 0 : 0),
    0
  );
  const eveningRevenue = labels.reduce(
    (sum, label, index) => sum + (isHourWithin(label, 19, 23) ? revenueTrend[index] ?? 0 : 0),
    0
  );
  const eveningOrders = labels.reduce(
    (sum, label, index) => sum + (isHourWithin(label, 19, 23) ? ordersByHour[index] ?? 0 : 0),
    0
  );
  const overallAverageRevenuePerOrder =
    totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const eveningAverageRevenuePerOrder =
    eveningOrders > 0 ? eveningRevenue / eveningOrders : 0;

  if (topRevenueHour && isHourWithin(topRevenueHour, 12, 16)) {
    insights.push({
      id: "revenue-peak-lunch",
      text: "Revenue peaks during lunch",
      priority: "medium"
    });
  }

  if (eveningOrders > 0 && eveningAverageRevenuePerOrder < overallAverageRevenuePerOrder) {
    insights.push({
      id: "avg-spend-low-evening",
      text: "Average spend is low in the evening",
      priority: "medium"
    });
  }

  for (let index = 0; index < labels.length; index += 1) {
    const orders = ordersByHour[index] ?? 0;
    const revenue = revenueTrend[index] ?? 0;
    const revenuePerOrder = orders > 0 ? revenue / orders : 0;

    if (
      orders >= Math.max(2, Math.ceil(Math.max(...ordersByHour, 0) * 0.75)) &&
      revenuePerOrder > 0 &&
      revenuePerOrder < overallAverageRevenuePerOrder * 0.85
    ) {
      insights.push({
        id: `high-orders-low-revenue-${index}`,
        text: "Traffic is strong, but revenue is underperforming",
        priority: "high"
      });
      break;
    }
  }

  for (let index = 0; index < labels.length; index += 1) {
    const orders = ordersByHour[index] ?? 0;
    const revenue = revenueTrend[index] ?? 0;
    const revenuePerOrder = orders > 0 ? revenue / orders : 0;

    if (
      isHourWithin(labels[index] ?? "", 19, 23) &&
      orders > 0 &&
      orders <= 1 &&
      revenuePerOrder >= overallAverageRevenuePerOrder * 1.15
    ) {
      insights.push({
        id: `low-orders-high-revenue-${index}`,
        text: `You have an upsell opportunity after ${labels[index]}`,
        priority: "medium"
      });
      break;
    }
  }

  if (topRevenueHour) {
    insights.push({
      id: "promote-margin",
      text: "Promote high-margin items during peak hours",
      priority: "medium"
    });
  }

  return getFilteredInsights(insights);
}

type LineChartProps = {
  labels: string[];
  values: number[];
  title: string;
  icon: string;
  pathClassName: string;
  pointClassName: string;
  formatValue: (value: number) => string;
  yAxisLabel: string;
  insights?: DashboardInsight[];
};

function DashboardLineChart({
  labels,
  values,
  title,
  icon,
  pathClassName,
  pointClassName,
  formatValue,
  yAxisLabel,
  insights = []
}: LineChartProps) {
  const isOrdersChart = yAxisLabel === "Orders";
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maxValue = Math.max(...values, 1);
  const ticks = getChartTicks(maxValue);
  const latestValue = values[values.length - 1] ?? 0;
  const peakValue = values.length ? Math.max(...values) : 0;
  const totalValue = values.reduce((sum, value) => sum + value, 0);
  const peakIndex = getPeakIndex(values);
  const slowIndex = getSlowIndex(values);
  const peakLabel = peakIndex >= 0 ? labels[peakIndex] ?? "—" : "—";
  const slowLabel = slowIndex >= 0 ? labels[slowIndex] ?? "—" : "—";
  const chartId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const areaClassName =
    pathClassName === "control-center-chart__path--orders"
      ? "control-center-chart__area--orders"
      : "control-center-chart__area--revenue";
  const pointLabelClassName =
    pointClassName === "control-center-chart__point--orders"
      ? "control-center-chart__point-label control-center-chart__point-label--orders"
      : "control-center-chart__point-label control-center-chart__point-label--revenue";
  const resolvedActiveIndex =
    activeIndex !== null && activeIndex >= 0 && activeIndex < values.length
      ? activeIndex
      : null;
  const activeLabel = resolvedActiveIndex === null ? "" : labels[resolvedActiveIndex] ?? "";
  const activeValue = resolvedActiveIndex === null ? 0 : values[resolvedActiveIndex] ?? 0;
  const activePointX =
    resolvedActiveIndex === null
      ? null
      : values.length <= 1
        ? 50
        : (resolvedActiveIndex / (values.length - 1)) * 100;
  const activePointY =
    resolvedActiveIndex === null ? null : 100 - (activeValue / maxValue) * 100;

  return (
    <article className="control-center-chart">
      <header className="control-center-analytics__header">
        <div className="control-center-chart__title-group">
          <span className="control-center-analytics__icon" aria-hidden="true">
            {icon}
          </span>
          <h2>{title}</h2>
        </div>
        <div className="control-center-chart__summary" aria-label={`${title} summary`}>
          {isOrdersChart ? (
            <>
              <div className="control-center-chart__summary-pill control-center-chart__summary-pill--peak">
                <span className="control-center-chart__summary-label">Peak hour</span>
                <strong>{peakLabel}</strong>
              </div>
              <div className="control-center-chart__summary-pill control-center-chart__summary-pill--slow">
                <span className="control-center-chart__summary-label">Slow hour</span>
                <strong>{slowLabel}</strong>
              </div>
              <div className="control-center-chart__summary-pill">
                <span className="control-center-chart__summary-label">Total orders</span>
                <strong>{totalValue}</strong>
              </div>
            </>
          ) : (
            <>
              <div className="control-center-chart__summary-pill">
                <span className="control-center-chart__summary-label">Peak</span>
                <strong>
                  {formatValue(peakValue)}
                  {peakLabel !== "—" ? ` at ${peakLabel}` : ""}
                </strong>
              </div>
              <div className="control-center-chart__summary-pill">
                <span className="control-center-chart__summary-label">Total today</span>
                <strong>{formatValue(totalValue)}</strong>
              </div>
            </>
          )}
        </div>
      </header>
      <div className="control-center-chart__plot">
        {labels.length ? (
          <div
            className="control-center-chart__line-chart"
            style={{ minWidth: `${getChartMinWidth(labels.length)}px` }}
          >
            <div className="control-center-chart__frame">
              <div
                className="control-center-chart__y-axis"
                style={{ gridTemplateRows: `repeat(${ticks.length}, 1fr)` }}
                aria-hidden="true"
              >
                {ticks.map((tick) => (
                  <span
                    key={`${title}-${tick}`}
                    className="control-center-chart__y-tick"
                  >
                    {isOrdersChart ? tick : `${tick} ₪`}
                  </span>
                ))}
              </div>
              <div className="control-center-chart__canvas">
                {isOrdersChart ? (
                  <div className="control-center-chart__bands" aria-hidden="true">
                    <div className="control-center-chart__band control-center-chart__band--peak">
                      <span>Peak</span>
                    </div>
                    <div className="control-center-chart__band control-center-chart__band--medium">
                      <span>Medium</span>
                    </div>
                    <div className="control-center-chart__band control-center-chart__band--low">
                      <span>Low</span>
                    </div>
                  </div>
                ) : null}
                <div
                  className="control-center-chart__grid"
                  style={{ gridTemplateRows: `repeat(${ticks.length}, 1fr)` }}
                  aria-hidden="true"
                >
                  {ticks.map((tick) => (
                    <span
                      key={`${title}-grid-${tick}`}
                      className="control-center-chart__grid-line"
                    />
                  ))}
                </div>
                <svg
                  className="control-center-chart__svg"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  <path
                    className={`control-center-chart__area ${areaClassName}`}
                    d={buildAreaChartPath(values)}
                    fill={`url(#${chartId}-area)`}
                  />
                  <path
                    className={`control-center-chart__path ${pathClassName}`}
                    d={buildSmoothLineChartPath(values)}
                  />
                  {activePointX !== null && activePointY !== null ? (
                    <>
                      <line
                        className="control-center-chart__active-line"
                        x1={activePointX}
                        y1="0"
                        x2={activePointX}
                        y2="100"
                      />
                      <circle
                        className="control-center-chart__active-dot"
                        cx={activePointX}
                        cy={Number.isFinite(activePointY) ? activePointY : 100}
                        r="1.9"
                      />
                      <text
                        x={activePointX}
                        y={Math.max(8, activePointY - 5)}
                        textAnchor="middle"
                        className={pointLabelClassName}
                      >
                        {formatValue(activeValue)}
                      </text>
                    </>
                  ) : null}
                </svg>
                {activePointX !== null ? (
                  <div
                    className="control-center-chart__tooltip"
                    style={{
                      left: `clamp(56px, calc(${activePointX}% - 42px), calc(100% - 96px))`
                    }}
                  >
                    <span className="control-center-chart__tooltip-label">{activeLabel}</span>
                    <strong>{formatValue(activeValue)}</strong>
                  </div>
                ) : null}
                <div
                  className="control-center-chart__hotspots"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(labels.length, 1)}, minmax(0, 1fr))`
                  }}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {labels.map((label, index) => (
                    <button
                      key={`${title}-hotspot-${label}`}
                      type="button"
                      className="control-center-chart__hotspot"
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                      onClick={() => setActiveIndex(index)}
                      onTouchStart={() => setActiveIndex(index)}
                    >
                      <span className="sr-only">
                        {label} {formatValue(values[index] ?? 0)}
                      </span>
                    </button>
                  ))}
                </div>
                <div
                  className="control-center-chart__legend"
                  style={{
                    gridTemplateColumns: `repeat(${labels.length}, minmax(70px, 1fr))`
                  }}
                >
                  {labels.map((label, index) => (
                    <div key={`${title}-${label}`} className="control-center-chart__legend-item">
                      {getEverySecondLabel(label, index) ? (
                        <span className="control-center-chart__label">
                          {getEverySecondLabel(label, index)}
                        </span>
                      ) : (
                        <span className="control-center-chart__legend-spacer" aria-hidden="true" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="control-center-chart__empty">—</div>
        )}
      </div>
      {insights.length ? (
        <div className="control-center-chart__insights">
          {insights.map((insight) => (
            <p key={insight.id} className="control-center-chart__insight">
              {insight.text}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

type Props = {
  insightStats: InsightStats;
  dashboardCharts: DashboardCharts;
  currentShiftLabel: string;
  dashboardMeta?: {
    orderMode?: "tables" | "counter" | string;
    ordersLabel?: string;
    activeOrdersLabel?: string;
  };
};

function ControlCenterDashboardComponent({
  insightStats,
  dashboardCharts,
  currentShiftLabel,
  dashboardMeta
}: Props) {
  const liveStatusDescriptions = useMemo<Record<string, string>>(
    () => ({
      ...defaultLiveStatusDescriptions,
      Orders: dashboardMeta?.ordersLabel || defaultLiveStatusDescriptions.Orders,
      "Active Orders":
        dashboardMeta?.activeOrdersLabel ||
        defaultLiveStatusDescriptions["Active Orders"]
    }),
    [dashboardMeta?.activeOrdersLabel, dashboardMeta?.ordersLabel]
  );
  const liveStatTargets = useMemo(
    () => ({
      revenue: parseNumberLikeValue(insightStats.revenue || "0"),
      avgCheck: parseNumberLikeValue(insightStats.avgCheck || "0"),
      orders: parseNumberLikeValue(insightStats.orders || "0"),
      activeOrders: parseNumberLikeValue(insightStats.activeOrders || "0"),
      waiterCalls: parseNumberLikeValue(insightStats.waiterCalls || "0")
    }),
    [
      insightStats.activeOrders,
      insightStats.avgCheck,
      insightStats.orders,
      insightStats.revenue,
      insightStats.waiterCalls
    ]
  );
  const [animatedLiveStats, setAnimatedLiveStats] = useState(liveStatTargets);
  const animationFrameRef = useRef<number | null>(null);
  const animatedLiveStatsRef = useRef(liveStatTargets);

  useEffect(() => {
    animatedLiveStatsRef.current = animatedLiveStats;
  }, [animatedLiveStats]);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const startValues = { ...animatedLiveStatsRef.current };
    const endValues = liveStatTargets;
    const durationMs = 420;
    const startAt = performance.now();
    const hasDelta = Object.keys(endValues).some((key) => {
      const typedKey = key as keyof typeof endValues;
      return Math.abs((endValues[typedKey] ?? 0) - (startValues[typedKey] ?? 0)) > 0.001;
    });

    if (!hasDelta) {
      return;
    }

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;

      const nextValues = {
        revenue: startValues.revenue + (endValues.revenue - startValues.revenue) * eased,
        avgCheck: startValues.avgCheck + (endValues.avgCheck - startValues.avgCheck) * eased,
        orders: startValues.orders + (endValues.orders - startValues.orders) * eased,
        activeOrders:
          startValues.activeOrders +
          (endValues.activeOrders - startValues.activeOrders) * eased,
        waiterCalls:
          startValues.waiterCalls + (endValues.waiterCalls - startValues.waiterCalls) * eased
      };
      animatedLiveStatsRef.current = nextValues;
      setAnimatedLiveStats(nextValues);

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      animationFrameRef.current = null;
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [liveStatTargets]);

  const orderChartSuggestions = buildOrderChartSuggestions(
    dashboardCharts.labels,
    dashboardCharts.ordersByHour
  );
  const revenueChartSuggestions = buildRevenueChartSuggestions(
    dashboardCharts.labels,
    dashboardCharts.ordersByHour,
    dashboardCharts.revenueTrend
  );

  return (
    <>
      <section className="control-center-shift" aria-label="Current shift">
        <div className="control-center-shift__label">Current shift</div>
        <div className="control-center-shift__value">
          {currentShiftLabel}
          {dashboardMeta?.orderMode === "counter" ? " · Counter mode" : ""}
        </div>
      </section>
      <section
        className={`control-center-global-insight control-center-global-insight--${insightStats.globalInsightStatus}`}
        aria-label="Global insight"
      >
        <div className="control-center-global-insight__label">Global insight</div>
        <div className="control-center-global-insight__value">
          {insightStats.globalInsight || "Live comparison with yesterday will appear here."}
        </div>
      </section>
      <section className="control-center-analytics" aria-label="Control Center analytics">
        {analyticsBlocks.map((block) => (
          <article key={block.title} className="control-center-analytics__card">
            <header className="control-center-analytics__header">
              <span className="control-center-analytics__icon" aria-hidden="true">
                {block.icon}
              </span>
              <h2>{block.title}</h2>
            </header>
            {block.title === "Live status" && "stats" in block ? (
              <div className="control-center-analytics__stats control-center-analytics__stats--live">
                {block.stats.map((stat) => (
                  <div
                    key={stat.label}
                    className={
                      stat.label === "Revenue" || stat.label === "Orders"
                        ? "control-center-analytics__stat control-center-analytics__stat--kpi"
                        : stat.label === "Waiter Calls"
                          ? "control-center-analytics__stat control-center-analytics__stat--compact"
                          : "control-center-analytics__stat"
                    }
                  >
                    <div className="control-center-analytics__stat-copy">
                      <span className="control-center-analytics__stat-label">
                        {stat.label}
                      </span>
                      <span className="control-center-analytics__stat-description">
                        {liveStatusDescriptions[stat.label] ?? ""}
                      </span>
                    </div>
                    <strong
                      className={
                        stat.label === "Revenue" || stat.label === "Orders"
                          ? "control-center-analytics__stat-value control-center-analytics__stat-value--kpi"
                          : "control-center-analytics__stat-value"
                      }
                    >
                      {stat.label === "Revenue"
                        ? formatCurrency(Number(animatedLiveStats.revenue.toFixed(2)))
                        : stat.label === "Avg Check"
                          ? formatCurrency(Number(animatedLiveStats.avgCheck.toFixed(2)))
                          : stat.label === "Orders"
                            ? String(Math.max(0, Math.round(animatedLiveStats.orders)))
                            : stat.label === "Active Orders"
                              ? String(Math.max(0, Math.round(animatedLiveStats.activeOrders)))
                              : stat.label === "Waiter Calls"
                                ? String(Math.max(0, Math.round(animatedLiveStats.waiterCalls)))
                                : "0"}
                    </strong>
                    <span className="control-center-analytics__stat-comparison">
                      {stat.label === "Revenue"
                        ? insightStats.vsYesterday.revenue
                        : stat.label === "Avg Check"
                          ? insightStats.vsYesterday.avgCheck
                          : stat.label === "Orders"
                            ? insightStats.vsYesterday.orders
                            : stat.label === "Active Orders"
                              ? insightStats.vsYesterday.activeOrders
                              : stat.label === "Waiter Calls"
                                ? insightStats.vsYesterday.waiterCalls
                                : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : block.title === "Daily status" ? (
              <div className="control-center-analytics__stats control-center-analytics__stats--daily">
                <div className="control-center-analytics__stat">
                  <span className="control-center-analytics__stat-label">Top Dish</span>
                  <strong className="control-center-analytics__stat-value control-center-analytics__stat-value--small">
                    {insightStats.topDish || "—"}
                  </strong>
                </div>
                <div className="control-center-analytics__stat">
                  <span className="control-center-analytics__stat-label">Low Dish</span>
                  <strong className="control-center-analytics__stat-value control-center-analytics__stat-value--small">
                    {insightStats.lowDish || "—"}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="control-center-analytics__body" />
            )}
          </article>
        ))}
      </section>
      <section className="control-center-charts" aria-label="Control Center charts">
        <DashboardLineChart
          labels={dashboardCharts.labels}
          values={dashboardCharts.ordersByHour}
          title="Orders by Hour"
          icon="🟠"
          pathClassName="control-center-chart__path--orders"
          pointClassName="control-center-chart__point--orders"
          formatValue={(value) => String(value)}
          yAxisLabel="Orders"
          insights={orderChartSuggestions}
        />
        <DashboardLineChart
          labels={dashboardCharts.labels}
          values={dashboardCharts.revenueTrend}
          title="Revenue Trend"
          icon="🔵"
          pathClassName="control-center-chart__path--revenue"
          pointClassName="control-center-chart__point--revenue"
          formatValue={(value) => (value ? formatCurrency(value) : "—")}
          yAxisLabel="Revenue"
          insights={revenueChartSuggestions}
        />
      </section>
    </>
  );
}

export const ControlCenterDashboard = memo(ControlCenterDashboardComponent);
