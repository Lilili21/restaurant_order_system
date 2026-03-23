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

function shouldShowChartLabel(index: number, labelsLength: number) {
  if (labelsLength <= 1) {
    return true;
  }

  if (index === 0 || index === labelsLength - 1) {
    return true;
  }

  return index % 2 === 0;
}

function formatCompactChartLabel(label: string) {
  return label.endsWith(":00") ? label.slice(0, 2) : label;
}

function getChartMinWidth(labelsLength: number) {
  return Math.max(100, labelsLength * 54);
}

type Props = {
  insightStats: InsightStats;
  dashboardCharts: DashboardCharts;
};

function ControlCenterDashboardComponent({ insightStats, dashboardCharts }: Props) {
  return (
    <>
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
                    <span className="control-center-analytics__stat-label">
                      {stat.label}
                    </span>
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
        <article className="control-center-chart">
          <header className="control-center-analytics__header">
            <span className="control-center-analytics__icon" aria-hidden="true">
              🟠
            </span>
            <h2>Orders by Hour</h2>
          </header>
          <div className="control-center-chart__plot">
            {dashboardCharts.labels.length ? (
              <div
                className="control-center-chart__line-chart"
                style={{ minWidth: `${getChartMinWidth(dashboardCharts.labels.length)}px` }}
              >
                <svg
                  className="control-center-chart__svg"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    className="control-center-chart__path control-center-chart__path--orders"
                    d={buildSmoothLineChartPath(dashboardCharts.ordersByHour)}
                  />
                  {dashboardCharts.ordersByHour.map((value, index) => {
                    const maxValue = Math.max(...dashboardCharts.ordersByHour, 1);
                    const x =
                      dashboardCharts.ordersByHour.length === 1
                        ? 50
                        : (index / (dashboardCharts.ordersByHour.length - 1)) * 100;
                    const y = 100 - (value / maxValue) * 100;

                    return (
                      <circle
                        key={`${dashboardCharts.labels[index]}-${value}`}
                        className="control-center-chart__point control-center-chart__point--orders"
                        cx={x}
                        cy={Number.isFinite(y) ? y : 100}
                        r="2.2"
                      />
                    );
                  })}
                </svg>
                <div
                  className="control-center-chart__legend"
                  style={{
                    gridTemplateColumns: `repeat(${dashboardCharts.labels.length}, minmax(0, 1fr))`
                  }}
                >
                  {dashboardCharts.labels.map((label, index) => (
                    <div key={label} className="control-center-chart__legend-item">
                      <span className="control-center-chart__value">
                        {dashboardCharts.ordersByHour[index] ?? 0}
                      </span>
                      <span className="control-center-chart__label">
                        {shouldShowChartLabel(index, dashboardCharts.labels.length)
                          ? formatCompactChartLabel(label)
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="control-center-chart__empty">—</div>
            )}
          </div>
        </article>
        <article className="control-center-chart">
          <header className="control-center-analytics__header">
            <span className="control-center-analytics__icon" aria-hidden="true">
              🔵
            </span>
            <h2>Revenue Trend</h2>
          </header>
          <div className="control-center-chart__plot">
            {dashboardCharts.labels.length ? (
              <div
                className="control-center-chart__line-chart"
                style={{ minWidth: `${getChartMinWidth(dashboardCharts.labels.length)}px` }}
              >
                <svg
                  className="control-center-chart__svg"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    className="control-center-chart__path control-center-chart__path--revenue"
                    d={buildSmoothLineChartPath(dashboardCharts.revenueTrend)}
                  />
                  {dashboardCharts.revenueTrend.map((value, index) => {
                    const maxValue = Math.max(...dashboardCharts.revenueTrend, 1);
                    const x =
                      dashboardCharts.revenueTrend.length === 1
                        ? 50
                        : (index / (dashboardCharts.revenueTrend.length - 1)) * 100;
                    const y = 100 - (value / maxValue) * 100;

                    return (
                      <circle
                        key={`${dashboardCharts.labels[index]}-${value}`}
                        className="control-center-chart__point control-center-chart__point--revenue"
                        cx={x}
                        cy={Number.isFinite(y) ? y : 100}
                        r="2.2"
                      />
                    );
                  })}
                </svg>
                <div
                  className="control-center-chart__legend"
                  style={{
                    gridTemplateColumns: `repeat(${dashboardCharts.labels.length}, minmax(0, 1fr))`
                  }}
                >
                  {dashboardCharts.labels.map((label, index) => (
                    <div key={label} className="control-center-chart__legend-item">
                      <span className="control-center-chart__value">
                        {dashboardCharts.revenueTrend[index]
                          ? formatCurrency(dashboardCharts.revenueTrend[index] ?? 0)
                          : "—"}
                      </span>
                      <span className="control-center-chart__label">
                        {shouldShowChartLabel(index, dashboardCharts.labels.length)
                          ? formatCompactChartLabel(label)
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="control-center-chart__empty">—</div>
            )}
          </div>
        </article>
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
