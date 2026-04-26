import { useEffect, useMemo, useRef, useState } from "react";

import { MenuItemCard } from "@/components/menu/MenuItemCard";
import type { MenuCategoryDefinition } from "@/lib/menu-categories";
import { MenuCategory, MenuItem, MenuLanguage } from "@/lib/types";

type MenuListProps = {
  items: MenuItem[];
  language: MenuLanguage;
  categoryDefinitions?: MenuCategoryDefinition[];
  quantities: Record<string, number>;
  orderingEnabled?: boolean;
  dishesClosed?: boolean;
  drinksClosed?: boolean;
  categoryDiscounts?: Partial<Record<MenuCategory, number>>;
  onAdd: (
    menuItemId: string,
    sourceElement?: HTMLElement | null,
    volumeOptionId?: string,
    selection?: {
      volumeLabel?: string;
      priceOverride?: number;
    }
  ) => void;
  onDecrease: (
    menuItemId: string,
    sourceElement?: HTMLElement | null,
    volumeOptionId?: string
  ) => void;
  selectedFilter?: MenuFilter | null;
};

export type MenuFilter = MenuCategory | "dishes" | "drinks";
type MenuFilterGroup = "dishes" | "drinks" | null;

const categoryLabels: Record<MenuLanguage, Record<string, string>> = {
  he: {
    dishes: "🍽️ מנות",
    drinks_group: "🍹 שתייה",
    starters: "🥗 מנות פתיחה",
    mains: "🍲 עיקריות",
    buters: "🥪 סנדוויצ'ים",
    sweet: "🥞 מנות מתוקות",
    cakes: "🎂 עוגות",
    drinks: "🍹 משקאות",
    fluids: "🍹 משקאות קלים",
    draft: "🍺 מהחבית",
    bottled: "🍾 בבקבוק",
    fuel: "⛽ חזקים",
    whiskey: "🥃 ויסקי",
    vodka: "🍸 וודקה",
    rum: "🥃 רום",
    cognac: "🥃 קוניאק",
    gin: "🍸 ג׳ין",
    tequila: "🍸 טקילה",
    absent: "🍸 אבסינת",
    ouzo: "🍸 אוזו",
    likers: "🍷 ליקרים",
    alcohol: "🍷 אלכוהול",
    cocktails: "🍸 קוקטיילים",
    chasers: "🥃 צ'ייסרים",
    two_component_mixture: "🧪 מיקס דו-רכיבי",
    dot4: "🛢 DOT 4",
    non_alcoholic_drinks: "🥤 משקאות ללא אלכוהול",
    desserts: "🍰 קינוחים"
  },
  en: {
    dishes: "🍽️ Dishes",
    drinks_group: "🍹 Drinks",
    starters: "🥗 Starters",
    mains: "🍲 Main courses",
    buters: "🥪 Sandwiches",
    sweet: "🥞 Sweet Dishes",
    cakes: "🎂 Cakes",
    drinks: "🍹 Drinks",
    fluids: "🍹 Fluids",
    draft: "🍺 Draft",
    bottled: "🍾 Bottled",
    fuel: "⛽ Топливо",
    whiskey: "🥃 Whiskey",
    vodka: "🍸 Vodka",
    rum: "🥃 Rum",
    cognac: "🥃 Cognac",
    gin: "🍸 GIN",
    tequila: "🍸 Tequila",
    absent: "🍸 Absent",
    ouzo: "🍸 Ouzo",
    likers: "🍷 Likers",
    alcohol: "🍷 Alcohol",
    cocktails: "🍸 Cocktails",
    chasers: "🥃 Chasers",
    two_component_mixture: "🧪 2 component mixture",
    dot4: "🛢 DOT 4",
    non_alcoholic_drinks: "🥤 Non-alcoholic drinks",
    desserts: "🍰 Desserts"
  },
  ru: {
    dishes: "🍽️ Блюда",
    drinks_group: "🍹 Напитки",
    starters: "🥗 Закуски",
    mains: "🍲 Основные блюда",
    buters: "🥪 Бутерброды",
    sweet: "🥞 Сладкие блюда",
    cakes: "🎂 Торты",
    drinks: "🍹 Напитки",
    fluids: "🍹 Напитки",
    draft: "🍺 Разливное",
    bottled: "🍾 Бутылочное",
    fuel: "⛽ Fuel",
    whiskey: "🥃 Виски",
    vodka: "🍸 Водка",
    rum: "🥃 Ром",
    cognac: "🥃 Коньяк",
    gin: "🍸 Джин",
    tequila: "🍸 Текила",
    absent: "🍸 Абсент",
    ouzo: "🍸 Узо",
    likers: "🍷 Ликёры",
    alcohol: "🍷 Алкоголь",
    cocktails: "🍸 Коктейли",
    chasers: "🥃 Чейсеры",
    two_component_mixture: "🧪 2-компонентный микс",
    dot4: "🛢 DOT 4",
    non_alcoholic_drinks: "🥤 Безалкогольные напитки",
    desserts: "🍰 Десерты"
  }
};

const categoryOrder: MenuCategory[] = [
  "starters",
  "mains",
  "buters",
  "sweet",
  "cakes",
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
  "alcohol",
  "cocktails",
  "chasers",
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
  "alcohol",
  "cocktails",
  "chasers",
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks"
]);

export function MenuList({
  items,
  language,
  categoryDefinitions = [],
  quantities,
  orderingEnabled = true,
  dishesClosed = false,
  drinksClosed = false,
  categoryDiscounts = {},
  onAdd,
  onDecrease,
  selectedFilter
}: MenuListProps) {
  const activeCategoryDefinitions = useMemo(
    () =>
      categoryDefinitions
        .filter((category) => category.active !== false)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [categoryDefinitions]
  );
  const activeAddonDefinitions = useMemo(
    () =>
      activeCategoryDefinitions.filter((category) => category.kind === "addons"),
    [activeCategoryDefinitions]
  );
  const activeBaseDefinitions = useMemo(
    () =>
      activeCategoryDefinitions.filter((category) => category.kind !== "addons"),
    [activeCategoryDefinitions]
  );
  const definedDrinkCategories = useMemo(
    () =>
      new Set<MenuCategory>(
        activeBaseDefinitions
          .filter((category) => category.kind === "drinks")
          .map((category) => category.slug)
      ),
    [activeBaseDefinitions]
  );
  const dynamicDrinkCategories =
    activeBaseDefinitions.length > 0 ? definedDrinkCategories : drinkCategories;
  const dynamicCategoryOrder: MenuCategory[] = useMemo(() => {
    const preferred = activeBaseDefinitions.map((category) => category.slug);
    if (preferred.length > 0) {
      return preferred;
    }
    return categoryOrder;
  }, [activeBaseDefinitions]);
  const categoryLabelsBySlug = useMemo(() => {
    const map: Record<string, string> = {};

    for (const category of activeCategoryDefinitions) {
      const localized =
        language === "he"
          ? String(category.labelHe ?? "").trim()
          : language === "ru"
            ? String(category.labelRu ?? "").trim()
            : String(category.labelEn ?? "").trim();

      map[category.slug] = localized || category.label || category.slug;
    }

    return map;
  }, [activeCategoryDefinitions, language]);
  const [selectedCategory, setSelectedCategory] = useState<MenuFilter>(
    selectedFilter ?? "dishes"
  );
  const [openGroup, setOpenGroup] = useState<MenuFilterGroup>(
    selectedFilter === "drinks" ||
      dynamicDrinkCategories.has(selectedFilter as MenuCategory)
      ? "drinks"
      : "dishes"
  );
  const sectionRefs = useRef<Partial<Record<MenuCategory, HTMLElement | null>>>({});
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
      ? dynamicCategoryOrder.flatMap((candidate) =>
          dynamicDrinkCategories.has(candidate) ? grouped[candidate] ?? [] : []
        )
      : grouped[category] ?? [];
  const visibleDishCategories = dynamicCategoryOrder.filter(
    (category) =>
      !dynamicDrinkCategories.has(category) &&
      getCategoryItems(category).length > 0
  );
  const visibleDrinkCategories = dynamicCategoryOrder.filter(
    (category) =>
      category !== "drinks" &&
      dynamicDrinkCategories.has(category) &&
      getCategoryItems(category).length > 0
  );
  const visibleCategories = dynamicCategoryOrder.filter(
    (category) => getCategoryItems(category).length > 0
  );
  const addonDefinitionsByCategory = useMemo(() => {
    return visibleCategories.reduce<Record<string, MenuCategoryDefinition[]>>(
      (acc, category) => {
        const linkedAddons = activeAddonDefinitions.filter((addon) => {
          const linked = Array.isArray(addon.linkedSlugs) ? addon.linkedSlugs : [];
          if (linked.includes(category)) {
            return true;
          }
          return addon.linkedSlug === category;
        });

        if (linkedAddons.length > 0) {
          acc[category] = linkedAddons;
        }

        return acc;
      },
      {}
    );
  }, [activeAddonDefinitions, visibleCategories]);
  const toppingsTitle =
    language === "he"
      ? "תוספות"
      : language === "ru"
        ? "Добавки"
        : "Toppings";

  useEffect(() => {
    if (selectedFilter) {
      setSelectedCategory(selectedFilter);
      setOpenGroup(
        selectedFilter === "drinks" ||
          dynamicDrinkCategories.has(selectedFilter as MenuCategory)
          ? "drinks"
          : "dishes"
      );

      window.setTimeout(() => {
        if (selectedFilter === "dishes") {
          const firstDishCategory = visibleDishCategories[0];
          if (firstDishCategory) {
            scrollToCategory(firstDishCategory);
          }
          return;
        }

        if (selectedFilter === "drinks") {
          const firstDrinkCategory = visibleDrinkCategories[0];
          if (firstDrinkCategory) {
            scrollToCategory(firstDrinkCategory);
          }
          return;
        }

        scrollToCategory(selectedFilter as MenuCategory);
      }, 0);
    }
  }, [dynamicDrinkCategories, selectedFilter, visibleDishCategories, visibleDrinkCategories]);

  useEffect(() => {
    if (!openGroup) {
      return;
    }

    const handleScroll = () => {
      if (window.scrollY > 48) {
        setOpenGroup((current) => (current ? null : current));
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [openGroup]);

  function scrollToCategory(category: MenuCategory) {
    const target = sectionRefs.current[category];
    if (!target) {
      return;
    }

    const top = target.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: "smooth"
    });
  }

  function handleGroupSelect(group: Exclude<MenuFilterGroup, null>) {
    setOpenGroup((current) => (current === group ? null : group));
    setSelectedCategory(group);

    const targetCategory =
      group === "drinks" ? visibleDrinkCategories[0] : visibleDishCategories[0];
    if (targetCategory) {
      scrollToCategory(targetCategory);
    }
  }

  function handleCategorySelect(category: MenuCategory) {
    setSelectedCategory(category);
    setOpenGroup(dynamicDrinkCategories.has(category) ? "drinks" : "dishes");
    scrollToCategory(category);
  }

  const formatCategoryLabel = (category: MenuCategory) =>
    categoryLabelsBySlug[category] ??
    categoryLabels[language][category] ??
    category;
  const formatCategorySectionLabel = (category: MenuCategory) => {
    const baseLabel =
      categoryLabelsBySlug[category] ??
      categoryLabels[language][category] ??
      category;
    const categoryDiscount = categoryDiscounts[category] ?? 0;
    const showDiscountTag = Number.isFinite(categoryDiscount) && categoryDiscount > 0;

    return showDiscountTag
      ? `${baseLabel} -${categoryDiscount}%`
      : baseLabel;
  };

  return (
    <div className="menu-sections">
      <div className="orders-filter menu-filter">
        <div className="orders-filter__chips orders-filter__chips--groups">
          <button
            type="button"
            className={
              [
                "orders-filter__chip",
                "orders-filter__chip--group",
                "orders-filter__chip--group-dishes",
                selectedCategory === "dishes" ? "orders-filter__chip--active" : "",
                dishesClosed ? "orders-filter__chip--group-closed" : ""
              ]
                .filter(Boolean)
                .join(" ")
            }
            onClick={() => handleGroupSelect("dishes")}
          >
            {categoryLabels[language].dishes}
          </button>
          {visibleDrinkCategories.length ? (
            <button
              type="button"
              className={
                [
                  "orders-filter__chip",
                  "orders-filter__chip--group",
                  "orders-filter__chip--group-drinks",
                  selectedCategory === "drinks" ? "orders-filter__chip--active" : "",
                  drinksClosed ? "orders-filter__chip--group-closed" : ""
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onClick={() => handleGroupSelect("drinks")}
            >
              {categoryLabels[language].drinks_group}
            </button>
          ) : null}
        </div>
        {openGroup ? (
          <div className="orders-filter__chips orders-filter__chips--nested">
            {(openGroup === "drinks"
              ? visibleDrinkCategories
              : visibleDishCategories
            ).map((category) => (
              <button
                key={category}
                type="button"
                className={
                  selectedCategory === category
                    ? "orders-filter__chip orders-filter__chip--active"
                    : "orders-filter__chip"
                }
                onClick={() => handleCategorySelect(category)}
              >
                {formatCategoryLabel(category)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {visibleCategories.map((category) => {
          const sectionItems = getCategoryItems(category);
          const linkedAddonDefinitions = addonDefinitionsByCategory[category] ?? [];
          const toppingsItems = linkedAddonDefinitions.flatMap(
            (addon) => grouped[addon.slug] ?? []
          );

          return (
            <section
              key={category}
              className="menu-section"
              ref={(element) => {
                sectionRefs.current[category] = element;
              }}
            >
              <div className="section-header">
                <h2>{formatCategorySectionLabel(category)}</h2>
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
              {toppingsItems.length > 0 ? (
                <div className="menu-section__toppings">
                  <div className="section-header">
                    <h3>{toppingsTitle}</h3>
                  </div>
                  <div className="menu-grid">
                    {toppingsItems.map((item) => (
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
                </div>
              ) : null}
            </section>
          );
        })}
    </div>
  );
}
