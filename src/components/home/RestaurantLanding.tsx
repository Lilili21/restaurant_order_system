"use client";

import Link from "next/link";
import { useState } from "react";

type RestaurantLandingProps = {
  restaurantSlug: string;
  restaurantName: string;
  restaurantDescription: string;
  tableLinks: Array<{
    label?: string;
    tableNumber: number;
    href: string;
  }>;
};

export function RestaurantLanding({
  restaurantSlug,
  restaurantName,
  restaurantDescription,
  tableLinks
}: RestaurantLandingProps) {
  const [tablesOpen, setTablesOpen] = useState(false);
  const hasTableLinks = tableLinks.length > 0;

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <div className="hero-actions">
            <Link
              href={`/${restaurantSlug}/waiter/orders`}
              className="button-link button-link--hero"
            >
              Waiter
            </Link>
            <Link
              href={`/${restaurantSlug}/admin`}
              className="button-link button-link--hero"
            >
              Admin
            </Link>
            {hasTableLinks ? (
              <button
                type="button"
                className="button-link button-link--hero"
                onClick={() => setTablesOpen((current) => !current)}
              >
                Tables menu
              </button>
            ) : null}
          </div>
        </div>

        <div className="hero-card">
          <span>Demo restaurant</span>
          <strong>{restaurantName}</strong>
          <p>{restaurantDescription}</p>
        </div>
      </section>

      {tablesOpen && hasTableLinks ? (
        <section className="table-links-panel">
          <div className="table-links-panel__list">
            {tableLinks.map((table) => (
              <Link
                key={table.label ?? table.tableNumber}
                href={table.href}
                className="table-links-panel__link"
              >
                {table.label ?? `Table ${table.tableNumber}`}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
