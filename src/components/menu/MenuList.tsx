import { useMemo } from "react";

import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { MenuCategory, MenuItem } from "@/lib/types";

type MenuListProps = {
  items: MenuItem[];
  quantities: Record<string, number>;
  onAdd: (menuItemId: string) => void;
  onDecrease: (menuItemId: string) => void;
};

const categoryLabels: Record<string, string> = {
  starters: "Закуски",
  mains: "Основные блюда",
  drinks: "Напитки",
  desserts: "Десерты"
};

const categoryOrder: MenuCategory[] = [
  "starters",
  "mains",
  "drinks",
  "desserts"
];

export function MenuList({
  items,
  quantities,
  onAdd,
  onDecrease
}: MenuListProps) {
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
      {categoryOrder
        .filter((category) => (grouped[category] ?? []).length > 0)
        .map((category) => (
        <section key={category} className="menu-section">
          <div className="section-header">
            <h2>{categoryLabels[category] ?? category}</h2>
          </div>
          <div className="menu-grid">
            {grouped[category].map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
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
