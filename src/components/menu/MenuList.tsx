import { useEffect, useMemo, useState } from "react";

import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { MenuCategory, MenuItem, MenuLanguage } from "@/lib/types";

type MenuListProps = {
  items: MenuItem[];
  language: MenuLanguage;
  quantities: Record<string, number>;
  orderingEnabled?: boolean;
  onAdd: (
    menuItemId: string,
    sourceElement?: HTMLElement | null,
    volumeOptionId?: string
  ) => void;
  onDecrease: (
    menuItemId: string,
    sourceElement?: HTMLElement | null,
    volumeOptionId?: string
  ) => void;
  selectedFilter?: MenuFilter | null;
};

export type MenuFilter = MenuCategory | "dishes" | "drinks";

const categoryLabels: Record<MenuLanguage, Record<string, string>> = {
  he: {
    dishes: "🍽️ מנות",
    drinks_group: "🍹 שתייה",
    starters: "🥗 מנות פתיחה",
    mains: "🍲 עיקריות",
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
    desserts: "🍰 קינוחים"
  },
  en: {
    dishes: "🍽️ Dishes",
    drinks_group: "🍹 Drinks",
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

const dishCategories = categoryOrder.filter((category) => !drinkCategories.has(category));

export function MenuList({
  items,
  language,
  quantities,
  orderingEnabled = true,
  onAdd,
  onDecrease,
  selectedFilter
}: MenuListProps) {
  const [selectedCategory, setSelectedCategory] = useState<MenuFilter>(
    selectedFilter ?? "dishes"
  );
  const getQuantityKey = (menuItemId: string, volumeOptionId?: string) =>
    `${menuItemId}:${volumeOptionId ?? "base"}`;
  const grouped = useMemo(
    () =>
      items.reduce<Record<string, MenuItem[]>>((acc, item) => {
        acc[item.category] ??= [];
        acc[item.category].push(item);
        return acc;
      }, {}),
    [items]
  );
  const getCategoryItems = (category: MenuCategory) =>
    category === "drinks"
      ? categoryOrder.flatMap((candidate) =>
          drinkCategories.has(candidate) ? grouped[candidate] ?? [] : []
        )
      : grouped[category] ?? [];
  const visibleDishCategories = dishCategories.filter(
    (category) => getCategoryItems(category).length > 0
  );
  const visibleDrinkCategories = categoryOrder.filter(
    (category) =>
      category !== "drinks" &&
      drinkCategories.has(category) &&
      getCategoryItems(category).length > 0
  );
  const visibleCategories = categoryOrder.filter((category) => {
    const hasItems = getCategoryItems(category).length > 0;

    if (!hasItems) {
      return false;
    }

    if (selectedCategory === "dishes") {
      return !drinkCategories.has(category);
    }

    if (selectedCategory === "drinks") {
      return category !== "drinks" && drinkCategories.has(category);
    }

    return selectedCategory === category;
  });

  useEffect(() => {
    if (selectedFilter) {
      setSelectedCategory(selectedFilter);
    }
  }, [selectedFilter]);

  return (
    <div className="menu-sections">
      <div className="orders-filter menu-filter">
        <div className="orders-filter__chips">
          <button
            type="button"
            className={
              selectedCategory === "dishes"
                ? "orders-filter__chip orders-filter__chip--group orders-filter__chip--group-dishes orders-filter__chip--active"
                : "orders-filter__chip orders-filter__chip--group orders-filter__chip--group-dishes"
            }
            onClick={() => setSelectedCategory("dishes")}
          >
            {categoryLabels[language].dishes}
          </button>
          {visibleDishCategories.map((category) => (
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
        {visibleDrinkCategories.length ? (
          <div className="orders-filter__chips">
            <button
              type="button"
              className={
                selectedCategory === "drinks"
                  ? "orders-filter__chip orders-filter__chip--group orders-filter__chip--group-drinks orders-filter__chip--active"
                  : "orders-filter__chip orders-filter__chip--group orders-filter__chip--group-drinks"
              }
              onClick={() => setSelectedCategory("drinks")}
            >
              {categoryLabels[language].drinks_group}
            </button>
            {visibleDrinkCategories.map((category) => (
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
        ) : null}
      </div>

      {visibleCategories.map((category) => {
          const sectionItems = getCategoryItems(category);

          return (
            <section key={category} className="menu-section">
              <div className="section-header">
                <h2>{categoryLabels[language][category] ?? category}</h2>
              </div>
              <div className="menu-grid">
                {sectionItems.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    language={language}
                    quantity={quantities[getQuantityKey(item.id)] ?? 0}
                    optionQuantities={quantities}
                    orderingEnabled={orderingEnabled}
                    onAdd={onAdd}
                    onDecrease={onDecrease}
                  />
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
