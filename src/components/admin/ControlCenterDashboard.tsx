"use client";

import { memo } from "react";

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
};

type DashboardCharts = {
  labels: string[];
  ordersByHour: number[];
  revenueTrend: number[];
};

const analyticsBlocks = [
  {
    icon: "🟢",
    title: "Live status",
    stats: [
      { label: "Revenue", value: "—" },
      { label: "Avg Check", value: "—" },
      { label: "Orders", value: "—" },
      { label: "Active Orders", value: "—" },
      { label: "Waiter Calls", value: "—" }
    ]
  },
  { icon: "🟡", title: "Daily status" }
] as const;

const liveStatusDescriptions: Record<string, string> = {
  Revenue: "Shift total",
  "Avg Check": "Per order",
  Orders: "Shift count",
  "Active Orders": "Open now",
  "Waiter Calls": "Calls this shift"
};

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

function getChartMinWidth(labelsLength: number) {
  return Math.max(720, labelsLength * 88);
}

function getChartTicks(maxValue: number) {
  const safeMaxValue = Math.max(maxValue, 1);
  const tickCount = safeMaxValue <= 4 ? safeMaxValue : 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) =>
    Math.round((safeMaxValue / tickCount) * (tickCount - index))
  );

  return [...new Set(ticks)];
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
};

function DashboardLineChart({
  labels,
  values,
  title,
  icon,
  pathClassName,
  pointClassName,
  formatValue,
  yAxisLabel
}: LineChartProps) {
  const maxValue = Math.max(...values, 1);
  const ticks = getChartTicks(maxValue);

  return (
    <article className="control-center-chart">
      <header className="control-center-analytics__header">
        <span className="control-center-analytics__icon" aria-hidden="true">
          {icon}
        </span>
        <h2>{title}</h2>
      </header>
      <div className="control-center-chart__plot">
        {labels.length ? (
          <div
            className="control-center-chart__line-chart"
            style={{ minWidth: `${getChartMinWidth(labels.length)}px` }}
          >
            <div className="control-center-chart__frame">
              <div className="control-center-chart__y-axis" aria-hidden="true">
                <span className="control-center-chart__axis-title">{yAxisLabel}</span>
                {ticks.map((tick) => (
                  <span
                    key={`${title}-${tick}`}
                    className="control-center-chart__y-tick"
                  >
                    {tick}
                  </span>
                ))}
              </div>
              <div className="control-center-chart__canvas">
                <div className="control-center-chart__grid" aria-hidden="true">
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
                  <path
                    className={`control-center-chart__path ${pathClassName}`}
                    d={buildSmoothLineChartPath(values)}
                  />
                  {values.map((value, index) => {
                    const x =
                      values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
                    const y = 100 - (value / maxValue) * 100;

                    return (
                      <circle
                        key={`${labels[index]}-${value}`}
                        className={`control-center-chart__point ${pointClassName}`}
                        cx={x}
                        cy={Number.isFinite(y) ? y : 100}
                        r="1.7"
                      />
                    );
                  })}
                </svg>
                <div
                  className="control-center-chart__legend"
                  style={{
                    gridTemplateColumns: `repeat(${labels.length}, minmax(70px, 1fr))`
                  }}
                >
                  {labels.map((label, index) => (
                    <div key={`${title}-${label}`} className="control-center-chart__legend-item">
                      <span className="control-center-chart__label">{label}</span>
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
    </article>
  );
}

type Props = {
  insightStats: InsightStats;
  dashboardCharts: DashboardCharts;
  currentShiftLabel: string;
};

function ControlCenterDashboardComponent({
  insightStats,
  dashboardCharts,
  currentShiftLabel
}: Props) {
  return (
    <>
      <section className="control-center-shift" aria-label="Current shift">
        <div className="control-center-shift__label">Current shift</div>
        <div className="control-center-shift__value">{currentShiftLabel}</div>
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
                        ? insightStats.revenue || "—"
                        : stat.label === "Avg Check"
                          ? insightStats.avgCheck || "—"
                          : stat.label === "Orders"
                            ? insightStats.orders || "—"
                            : stat.label === "Active Orders"
                              ? insightStats.activeOrders || "—"
                              : stat.label === "Waiter Calls"
                                ? insightStats.waiterCalls || "—"
                                : "—"}
                    </strong>
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
        />
      </section>
      <section className="control-center-suggestions" aria-label="Dashboard suggestions">
        <article className="control-center-analytics__card">
          <header className="control-center-analytics__header">
            <span className="control-center-analytics__icon" aria-hidden="true">
              🧠
            </span>
            <h2>Suggestions</h2>
          </header>
          <div className="control-center-analytics__body" />
        </article>
      </section>
    </>
  );
}

export const ControlCenterDashboard = memo(ControlCenterDashboardComponent);
