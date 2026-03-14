"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TableLinksPanelProps = {
  restaurantSlug: string;
};

type MenuSettingsResponse = {
  tableCount?: number;
  tableTokens?: Record<string, string>;
};

export function TableLinksPanel({
  restaurantSlug
}: TableLinksPanelProps) {
  const [tableCount, setTableCount] = useState(8);
  const [tableTokens, setTableTokens] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const response = await fetch("/api/menu-settings", {
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const settings = (await response.json()) as MenuSettingsResponse;

      if (!cancelled) {
        const nextTableCount = settings.tableCount ?? 8;
        setTableCount(nextTableCount);
        setTableTokens(settings.tableTokens ?? {});
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);
  const visibleCount = tableCount > 0 ? tableCount : 0;

  return (
    <section className="table-links-panel">
      <div className="table-links-panel__list">
        {Array.from({ length: visibleCount }, (_, index) => {
          const tableNumber = index + 1;
          const token = tableTokens[String(tableNumber)];

          if (!token) {
            return null;
          }

          return (
            <Link
              key={tableNumber}
              href={`/menu/${restaurantSlug}/${token}`}
              className="table-links-panel__link"
            >
              Table {tableNumber}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
