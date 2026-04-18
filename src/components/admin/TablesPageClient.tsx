"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TablesOverview } from "@/components/admin/TablesOverview";
import type { RestaurantOrderMode } from "@/lib/menu-settings";

type TablesPageClientProps = {
  restaurantSlug: string;
  ordersHref: string;
  tablesHref: string;
  menuHref?: string;
  navigationLabel: string;
};

export function TablesPageClient({
  restaurantSlug,
  ordersHref,
  tablesHref,
  menuHref,
  navigationLabel
}: TablesPageClientProps) {
  const normalizedRestaurantSlug = useMemo(
    () => restaurantSlug.trim().toLowerCase(),
    [restaurantSlug]
  );
  const [orderMode, setOrderMode] = useState<RestaurantOrderMode>("tables");

  const isCounterMode = orderMode === "counter";

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>{isCounterMode ? "Counter mode" : "Orders by table"}</h1>
        </div>
        <div className="admin-nav" aria-label={navigationLabel}>
          <div className="admin-switch">
            <Link href={ordersHref} className="admin-switch__item">
              Orders
            </Link>
            {!isCounterMode ? (
              <Link href={tablesHref} className="admin-switch__item admin-switch__item--active">
                Tables
              </Link>
            ) : null}
          </div>
          {menuHref ? (
            <Link href={menuHref} className="admin-menu-bubble">
              Menu
            </Link>
          ) : null}
        </div>
      </section>

      {isCounterMode ? (
        <p className="muted">
          Tables view is disabled in counter mode. Use Orders queue instead.
        </p>
      ) : (
        <TablesOverview
          restaurantSlug={normalizedRestaurantSlug}
          onOrderModeChange={setOrderMode}
        />
      )}
    </main>
  );
}
