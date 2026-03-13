import { useMemo, useState } from "react";

import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { MenuCategory, MenuItem, MenuLanguage } from "@/lib/types";

type MenuListProps = {
  items: MenuItem[];
  language: MenuLanguage;
  quantities: Record<string, number>;
  onAdd: (menuItemId: string) => void;
  onDecrease: (menuItemId: string) => void;
};

const categoryLabels: Record<MenuLanguage, Record<string, string>> = {
  he: {
    all: "הכול",
    starters: "מנות פתיחה",
    mains: "עיקריות",
    drinks: "שתייה",
    desserts: "קינוחים"
  },
  en: {
    all: "All",
    starters: "Starters",
    mains: "Main courses",
    drinks: "Drinks",
    desserts: "Desserts"
  }
};

const categoryOrder: MenuCategory[] = [
  "starters",
  "mains",
  "drinks",
  "desserts"
];

export function MenuList({
  items,
  language,
  quantities,
  onAdd,
  onDecrease
}: MenuListProps) {
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | "all">(
    "all"
  );
  const grouped = useMemo(
    () =>
      items.reduce<Record<string, MenuItem[]>>((acc, item) => {
        acc[item.category] ??= [];
        acc[item.category].push(item);
        return acc;
      }, {}),
    [items]
  );

  return (
    <div className="menu-sections">
      <div className="orders-filter menu-filter">
        <div className="orders-filter__chips">
          <button
            type="button"
            className={
              selectedCategory === "all"
                ? "orders-filter__chip orders-filter__chip--active"
                : "orders-filter__chip"
            }
            onClick={() => setSelectedCategory("all")}
          >
            {categoryLabels[language].all}
          </button>
          {categoryOrder.map((category) => (
            <button
              key={category}
              type="button"
              className={
                selectedCategory === category
                  ? "orders-filter__chip orders-filter__chip--active"
                  : "orders-filter__chip"
              }
              onClick={() => setSelectedCategory(category)}
            >
              {categoryLabels[language][category]}
            </button>
          ))}
        </div>
      </div>

      {categoryOrder
        .filter((category) => {
          if ((grouped[category] ?? []).length === 0) {
            return false;
          }

          return selectedCategory === "all" || selectedCategory === category;
        })
        .map((category) => (
        <section key={category} className="menu-section">
          <div className="section-header">
            <h2>{categoryLabels[language][category] ?? category}</h2>
          </div>
          <div className="menu-grid">
            {grouped[category].map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                language={language}
                quantity={quantities[item.id] ?? 0}
                onAdd={onAdd}
                onDecrease={onDecrease}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
