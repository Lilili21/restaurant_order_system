import { expect, Page, test } from "@playwright/test";

type AnalyticsPayload = {
  insights: {
    revenue: number;
    avgCheck: number;
    orders: number;
    activeOrders: number;
    topDish: string;
    lowDish: string;
    peakHour: string;
    waiterCalls: number | string;
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
  charts: {
    labels: string[];
    ordersByHour: number[];
    revenueTrend: number[];
  };
  meta?: {
    sourceWarnings?: string[];
    error?: string;
  };
};

function buildAnalyticsPayload(
  overrides: Partial<AnalyticsPayload> = {}
): AnalyticsPayload {
  const base: AnalyticsPayload = {
    insights: {
      revenue: 120,
      avgCheck: 40,
      orders: 4,
      activeOrders: 1,
      topDish: "Kanafeh",
      lowDish: "Water",
      peakHour: "14:00",
      waiterCalls: 2,
      globalInsight: "Stable shift performance.",
      globalInsightStatus: "same",
      vsYesterday: {
        revenue: "+10%",
        avgCheck: "+2%",
        orders: "+1",
        activeOrders: "0",
        waiterCalls: "+1"
      }
    },
    charts: {
      labels: ["12:00", "13:00", "14:00"],
      ordersByHour: [1, 2, 1],
      revenueTrend: [40, 70, 50]
    }
  };

  return {
    ...base,
    ...overrides,
    insights: {
      ...base.insights,
      ...(overrides.insights ?? {}),
      vsYesterday: {
        ...base.insights.vsYesterday,
        ...(overrides.insights?.vsYesterday ?? {})
      }
    },
    charts: {
      ...base.charts,
      ...(overrides.charts ?? {})
    },
    meta: {
      ...(base.meta ?? {}),
      ...(overrides.meta ?? {})
    }
  };
}

async function setupDashboardApis(
  page: Page,
  options?: {
    analyticsSnapshots?: AnalyticsPayload[];
    menuSettings?: Record<string, unknown>;
  }
) {
  let analyticsGetCalls = 0;
  const analyticsSnapshots =
    options?.analyticsSnapshots ?? [buildAnalyticsPayload()];

  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.route(/\/api\/admin-auth(\?|$)/, async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authorized: true })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.route(/\/api\/menu(\?|$)/, async (route, request) => {
    if (request.method() !== "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route(/\/api\/menu-settings(\?|$)/, async (route, request) => {
    if (request.method() !== "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options?.menuSettings ?? {})
    });
  });

  await page.route(/\/api\/admin-analytics(\?|$)/, async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    const snapshotIndex = Math.min(
      analyticsGetCalls,
      Math.max(analyticsSnapshots.length - 1, 0)
    );
    const snapshot = analyticsSnapshots[snapshotIndex] ?? buildAnalyticsPayload();
    analyticsGetCalls += 1;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot)
    });
  });

  return {
    getAnalyticsGetCalls: () => analyticsGetCalls
  };
}

async function openDashboard(page: Page, path = "/admin/menu") {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Live status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily status" })).toBeVisible();
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function getLiveStatValueLocator(page: Page, label: string) {
  const statCard = page
    .locator(".control-center-analytics__stat")
    .filter({
      has: page
        .locator(".control-center-analytics__stat-label")
        .filter({ hasText: label })
    })
    .first();

  return statCard.locator(".control-center-analytics__stat-value").first();
}

async function expectLiveStatContains(page: Page, label: string, expectedPart: string) {
  const valueLocator = getLiveStatValueLocator(page, label);

  await expect
    .poll(async () => normalizeText(await valueLocator.innerText()))
    .toContain(expectedPart);
}

async function forceDashboardRefresh(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.describe("Dashboard live status and charts", () => {
  test("DASH-00 analytics request is scoped by restaurant slug on restaurant admin route", async ({
    page
  }) => {
    const seenAnalyticsSlugs: string[] = [];

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.route(/\/api\/admin-auth(\?|$)/, async (route, request) => {
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ authorized: true })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });

    await page.route(/\/api\/menu(\?|$)/, async (route, request) => {
      if (request.method() !== "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
    });

    await page.route(/\/api\/menu-settings(\?|$)/, async (route, request) => {
      if (request.method() !== "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({})
      });
    });

    await page.route(/\/api\/admin-analytics(\?|$)/, async (route, request) => {
      if (request.method() !== "GET") {
        await route.continue();
        return;
      }

      const url = new URL(request.url());
      seenAnalyticsSlugs.push(url.searchParams.get("restaurantSlug") ?? "");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildAnalyticsPayload())
      });
    });

    await openDashboard(page, "/olive-bistro/admin");

    await expect
      .poll(() => seenAnalyticsSlugs.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(seenAnalyticsSlugs[0]).toBe("olive-bistro");
  });

  test("DASH-01 renders Live status metrics and descriptions", async ({ page }) => {
    await setupDashboardApis(page, {
      analyticsSnapshots: [
        buildAnalyticsPayload({
          insights: {
            revenue: 532,
            avgCheck: 106,
            orders: 6,
            activeOrders: 1,
            waiterCalls: 4
          } as Partial<AnalyticsPayload["insights"]>
        })
      ]
    });

    await openDashboard(page);

    await expectLiveStatContains(page, "Revenue", "532");
    await expectLiveStatContains(page, "Avg Check", "106");
    await expectLiveStatContains(page, "Orders", "6");
    await expectLiveStatContains(page, "Active Orders", "1");
    await expectLiveStatContains(page, "Waiter Calls", "4");
    await expect(
      page
        .locator(".control-center-analytics__stat")
        .filter({ hasText: "Orders" })
        .first()
    ).toContainText("Active + closed tables");
  });

  test("DASH-02 renders shift, global insight and daily status", async ({ page }) => {
    await setupDashboardApis(page, {
      menuSettings: {
        workingHoursFrom: "09:00",
        workingHoursUntil: "23:00"
      },
      analyticsSnapshots: [
        buildAnalyticsPayload({
          insights: {
            topDish: "Tabbouleh salad",
            lowDish: "Water",
            globalInsight: "Revenue is up vs yesterday.",
            globalInsightStatus: "better"
          } as Partial<AnalyticsPayload["insights"]>
        })
      ]
    });

    await openDashboard(page);

    await expect(page.locator(".control-center-shift__value")).toContainText("09:00");
    await expect(page.locator(".control-center-shift__value")).toContainText("23:00");
    await expect(page.locator(".control-center-global-insight--better")).toBeVisible();
    await expect(page.locator(".control-center-global-insight__value")).toContainText(
      "Revenue is up vs yesterday."
    );

    const dailyStatusCard = page
      .locator(".control-center-analytics__card")
      .filter({ has: page.getByRole("heading", { name: "Daily status" }) });
    await expect(dailyStatusCard).toContainText("Top Dish");
    await expect(dailyStatusCard).toContainText("Tabbouleh salad");
    await expect(dailyStatusCard).toContainText("Low Dish");
    await expect(dailyStatusCard).toContainText("Water");
  });

  test("DASH-03 renders Orders by Hour and Revenue Trend charts", async ({ page }) => {
    await setupDashboardApis(page, {
      analyticsSnapshots: [
        buildAnalyticsPayload({
          charts: {
            labels: ["10:00", "11:00", "12:00", "13:00"],
            ordersByHour: [1, 2, 3, 1],
            revenueTrend: [20, 40, 60, 20]
          }
        })
      ]
    });

    await openDashboard(page);

    const ordersChart = page
      .locator("article.control-center-chart")
      .filter({ has: page.getByRole("heading", { name: "Orders by Hour" }) });
    await expect(ordersChart).toContainText("Total orders");
    await expect(ordersChart).toContainText("7");
    await expect(ordersChart.locator(".control-center-chart__hotspot")).toHaveCount(4);

    const revenueChart = page
      .locator("article.control-center-chart")
      .filter({ has: page.getByRole("heading", { name: "Revenue Trend" }) });
    await expect(revenueChart).toContainText("Total today");
    await expect(revenueChart).toContainText("140");
    await expect(revenueChart.locator(".control-center-chart__hotspot")).toHaveCount(4);
  });

  test("DASH-04 shows empty placeholders when charts have no data", async ({ page }) => {
    await setupDashboardApis(page, {
      analyticsSnapshots: [
        buildAnalyticsPayload({
          charts: {
            labels: [],
            ordersByHour: [],
            revenueTrend: []
          }
        })
      ]
    });

    await openDashboard(page);

    await expect(page.locator(".control-center-chart__empty")).toHaveCount(2);
  });

  test("DASH-05 refresh applies new analytics snapshot", async ({ page }) => {
    const tracker = await setupDashboardApis(page, {
      analyticsSnapshots: [
        buildAnalyticsPayload({
          insights: {
            orders: 4,
            waiterCalls: 1
          } as Partial<AnalyticsPayload["insights"]>
        }),
        buildAnalyticsPayload({
          insights: {
            orders: 7,
            waiterCalls: 5
          } as Partial<AnalyticsPayload["insights"]>
        })
      ]
    });

    await openDashboard(page);
    await expectLiveStatContains(page, "Orders", "4");
    await expectLiveStatContains(page, "Waiter Calls", "1");

    await forceDashboardRefresh(page);
    await expect
      .poll(() => tracker.getAnalyticsGetCalls(), { timeout: 10_000 })
      .toBeGreaterThan(1);

    await expectLiveStatContains(page, "Orders", "7");
    await expectLiveStatContains(page, "Waiter Calls", "5");
  });

  test("DASH-06 degraded zero snapshot does not wipe previous values", async ({ page }) => {
    const tracker = await setupDashboardApis(page, {
      analyticsSnapshots: [
        buildAnalyticsPayload({
          insights: {
            revenue: 220,
            orders: 8
          } as Partial<AnalyticsPayload["insights"]>,
          charts: {
            labels: ["11:00", "12:00", "13:00"],
            ordersByHour: [2, 3, 3],
            revenueTrend: [50, 80, 90]
          }
        }),
        {
          insights: {
            revenue: 0,
            avgCheck: 0,
            orders: 0,
            activeOrders: 0,
            topDish: "—",
            lowDish: "—",
            peakHour: "—",
            waiterCalls: 0,
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
            error: "analytics_build_failed",
            sourceWarnings: ["orders_source_failed"]
          }
        }
      ]
    });

    await openDashboard(page);
    await expectLiveStatContains(page, "Revenue", "220");
    await expectLiveStatContains(page, "Orders", "8");

    await forceDashboardRefresh(page);
    await expect
      .poll(() => tracker.getAnalyticsGetCalls(), { timeout: 10_000 })
      .toBeGreaterThan(1);

    await expectLiveStatContains(page, "Revenue", "220");
    await expectLiveStatContains(page, "Orders", "8");

    const ordersChart = page
      .locator("article.control-center-chart")
      .filter({ has: page.getByRole("heading", { name: "Orders by Hour" }) });
    await expect(ordersChart.locator(".control-center-chart__hotspot")).toHaveCount(3);
  });
});
