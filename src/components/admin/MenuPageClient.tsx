"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { MenuEditor } from "@/components/admin/MenuEditor";
import type { RestaurantOrderMode } from "@/lib/menu-settings";

type MenuPageClientProps = {
  restaurantSlug: string;
  ordersHref?: string;
  tablesHref?: string;
  menuHref?: string;
  showNavigation?: boolean;
};

export function MenuPageClient({
  restaurantSlug,
  ordersHref,
  tablesHref,
  menuHref,
  showNavigation = true
}: MenuPageClientProps) {
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
          <h1 className="hero-title-stacked control-center-title">
            <span>Control</span>
            <span>Center</span>
          </h1>
        </div>
        {showNavigation ? (
          <div className="admin-nav" aria-label="Admin navigation">
            <div className="admin-switch">
              {ordersHref ? (
                <Link href={ordersHref} className="admin-switch__item">
                  Orders
                </Link>
              ) : null}
              {tablesHref && !isCounterMode ? (
                <Link href={tablesHref} className="admin-switch__item">
                  Tables
                </Link>
              ) : null}
            </div>
            {menuHref ? (
              <Link href={menuHref} className="admin-menu-bubble admin-menu-bubble--active">
                Menu
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
      <MenuEditor onOrderModeChange={setOrderMode} />
    </main>
  );
}
