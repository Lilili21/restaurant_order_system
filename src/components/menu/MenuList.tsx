import { useMemo, useState } from "react";

import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { MenuCategory, MenuItem, MenuLanguage } from "@/lib/types";

type MenuListProps = {
  items: MenuItem[];
  language: MenuLanguage;
  quantities: Record<string, number>;
  onAdd: (menuItemId: string, sourceElement?: HTMLElement | null) => void;
  onDecrease: (menuItemId: string, sourceElement?: HTMLElement | null) => void;
};

const categoryLabels: Record<MenuLanguage, Record<string, string>> = {
  he: {
    all: "הכול",
    starters: "🥗 מנות פתיחה",
    mains: "🍲 עיקריות",
    drinks: "🍹 שתייה",
    fluids: "🍹 Fluids",
    draft: "🍺 Draft",
    bottled: "🍾 Bottled",
    fuel: "⛽ Fuel",
    whiskey: "🥃 Whiskey",
    vodka: "🍸 Vodka",
    rum: "🥃 Rum",
    cognac: "🥃 Cognac",
    gin: "🍸 GIN",
    tequila: "🍸 Tequila",
    absent: "🍸 Absent",
    ouzo: "🍸 Ouzo",
    likers: "🍷 Likers",
    two_component_mixture: "🧪 2 component mixture",
    dot4: "🛢 DOT 4",
    non_alcoholic_drinks: "🥤 Non-alcoholic drinks",
    desserts: "🍰 קינוחים"
  },
  en: {
    all: "All",
    starters: "🥗 Starters",
    mains: "🍲 Main courses",
    drinks: "🍹 Drinks",
    fluids: "🍹 Fluids",
    draft: "🍺 Draft",
    bottled: "🍾 Bottled",
    fuel: "⛽ Fuel",
    whiskey: "🥃 Whiskey",
    vodka: "🍸 Vodka",
    rum: "🥃 Rum",
    cognac: "🥃 Cognac",
    gin: "🍸 GIN",
    tequila: "🍸 Tequila",
    absent: "🍸 Absent",
    ouzo: "🍸 Ouzo",
    likers: "🍷 Likers",
    two_component_mixture: "🧪 2 component mixture",
    dot4: "🛢 DOT 4",
    non_alcoholic_drinks: "🥤 Non-alcoholic drinks",
    desserts: "🍰 Desserts"
  }
};

const categoryOrder: MenuCategory[] = [
  "starters",
  "mains",
  "drinks",
  "fluids",
  "draft",
  "bottled",
  "fuel",
  "whiskey",
  "vodka",
  "rum",
  "cognac",
  "gin",
  "tequila",
  "absent",
  "ouzo",
  "likers",
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks",
  "desserts"
];

const drinkCategories = new Set<MenuCategory>([
  "drinks",
  "fluids",
  "draft",
  "bottled",
  "fuel",
  "whiskey",
  "vodka",
  "rum",
  "cognac",
  "gin",
  "tequila",
  "absent",
  "ouzo",
  "likers",
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks"
]);

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
          {categoryOrder
            .filter((category) =>
              category === "drinks"
                ? categoryOrder.some(
                    (candidate) =>
                      drinkCategories.has(candidate) &&
                      (grouped[candidate] ?? []).length > 0
                  )
                : (grouped[category] ?? []).length > 0
            )
            .map((category) => (
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
          const hasItems =
            category === "drinks"
              ? categoryOrder.some(
                  (candidate) =>
                    drinkCategories.has(candidate) &&
                    (grouped[candidate] ?? []).length > 0
                )
              : (grouped[category] ?? []).length > 0;

          if (!hasItems) {
            return false;
          }

          return (
            selectedCategory === "all" ||
            selectedCategory === category ||
            (selectedCategory === "drinks" && drinkCategories.has(category))
          );
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
