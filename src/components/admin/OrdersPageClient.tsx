"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { OrdersList } from "@/components/admin/OrdersList";
import type { RestaurantOrderMode } from "@/lib/menu-settings";

type OrdersPageClientProps = {
  restaurantSlug: string;
  ordersHref: string;
  tablesHref: string;
  menuHref?: string;
  navigationLabel: string;
};

type RuntimeContext = {
  orderMode: RestaurantOrderMode;
  restaurantId?: string;
  restaurantSlug: string;
};

export function OrdersPageClient({
  restaurantSlug,
  ordersHref,
  tablesHref,
  menuHref,
  navigationLabel
}: OrdersPageClientProps) {
  const normalizedRestaurantSlug = useMemo(
    () => restaurantSlug.trim().toLowerCase(),
    [restaurantSlug]
  );
  const [context, setContext] = useState<RuntimeContext>({
    orderMode: "tables",
    restaurantSlug: normalizedRestaurantSlug
  });

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      try {
        const [settingsResponse, restaurantResponse] = await Promise.all([
          fetch(
            `/api/menu-settings?restaurantSlug=${encodeURIComponent(
              normalizedRestaurantSlug
            )}&fields=orderMode`,
            { cache: "no-store" }
          ),
          fetch(
            `/api/restaurants?restaurantSlug=${encodeURIComponent(
              normalizedRestaurantSlug
            )}`,
            { cache: "no-store" }
          )
        ]);

        const settingsJson = settingsResponse.ok
          ? ((await settingsResponse.json()) as { orderMode?: RestaurantOrderMode })
          : null;
        const restaurantJson = restaurantResponse.ok
          ? ((await restaurantResponse.json()) as { id?: string; slug?: string })
          : null;

        if (!cancelled) {
          setContext({
            orderMode: settingsJson?.orderMode === "counter" ? "counter" : "tables",
            restaurantId: restaurantJson?.id,
            restaurantSlug:
              restaurantJson?.slug?.trim().toLowerCase() || normalizedRestaurantSlug
          });
        }
      } catch {
        if (!cancelled) {
          setContext((current) => ({
            ...current,
            restaurantSlug: normalizedRestaurantSlug
          }));
        }
      }
    }

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [normalizedRestaurantSlug]);

  const isCounterMode = context.orderMode === "counter";

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>{isCounterMode ? "Counter queue" : "Incoming orders"}</h1>
        </div>
        <div className="admin-nav" aria-label={navigationLabel}>
          <div className="admin-switch">
            <Link href={ordersHref} className="admin-switch__item admin-switch__item--active">
              Orders
            </Link>
            {!isCounterMode ? (
              <Link href={tablesHref} className="admin-switch__item">
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

      <OrdersList
        orderMode={context.orderMode}
        restaurantSlug={context.restaurantSlug}
        restaurantId={context.restaurantId}
      />
    </main>
  );
}
