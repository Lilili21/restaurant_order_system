import { MouseEvent } from "react";
import { useMemo, useState } from "react";

import { resolveMenuImageForRestaurant } from "@/lib/menu-images";
import { formatCurrency } from "@/lib/menu";
import { MenuBadge, MenuItem, MenuLanguage, MenuVolumeOption } from "@/lib/types";

const badgeMeta: Record<
  MenuBadge,
  { icon: string; label: { he: string; en: string; ru: string } }
> = {
  chef_special: { icon: "🔥", label: { he: "מיוחד של השף", en: "Chef's special", ru: "Блюдо от шефа" } },
  most_popular: { icon: "⭐", label: { he: "הכי פופולרי", en: "Most popular", ru: "Самое популярное" } },
  vegan: { icon: "🌱", label: { he: "טבעוני", en: "Vegan", ru: "Веганское" } },
  spicy: { icon: "🌶️", label: { he: "חריף", en: "Spicy", ru: "Острое" } },
  kids_favorite: { icon: "🧸", label: { he: "אהוב על ילדים", en: "Kids favorite", ru: "Любят дети" } },
  new: { icon: "🆕", label: { he: "חדש", en: "New", ru: "Новинка" } },
  kosher: { icon: "Ⓚ", label: { he: "כשר", en: "Kosher", ru: "Кошерно" } },
  meat: { icon: "🥩", label: { he: "בשרי", en: "Meat", ru: "Мясное" } },
  dairy: { icon: "🧀", label: { he: "חלבי", en: "Dairy", ru: "Молочное" } },
  gluten_free: { icon: "🌾", label: { he: "ללא גלוטן", en: "Gluten free", ru: "Без глютена" } },
  dairy_free: { icon: "🥛", label: { he: "ללא חלב", en: "Dairy free", ru: "Без молока" } },
  nut_free: { icon: "🥜", label: { he: "ללא אגוזים", en: "Nut free", ru: "Без орехов" } }
};

const imageBadgeSet = new Set<MenuBadge>([
  "chef_special",
  "most_popular",
  "new",
  "kids_favorite"
]);
const noImagePriorityBadgeOrder: MenuBadge[] = ["new", "most_popular"];

type MenuItemCardProps = {
  item: MenuItem;
  language: MenuLanguage;
  quantity: number;
  optionQuantities?: Record<string, number>;
  orderingEnabled?: boolean;
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
};

const drinkCategories = new Set([
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

function getAddonText(language: MenuLanguage) {
  if (language === "he") {
    return {
      title: "תוספות לבחירה",
      selected: "נבחרו",
      mostPopular: "הכי פופולרי"
    };
  }

  if (language === "ru") {
    return {
      title: "Выберите добавки",
      selected: "Выбрано",
      mostPopular: "Популярно"
    };
  }

  return {
    title: "Choose toppings",
    selected: "Selected",
    mostPopular: "Most popular"
  };
}

export function MenuItemCard({
  item,
  language,
  quantity,
  optionQuantities = {},
  orderingEnabled = true,
  onAdd,
  onDecrease
}: MenuItemCardProps) {
  const addLabel =
    language === "he" ? "הוסף" : language === "ru" ? "Добавить" : "Add";
  const name =
    language === "he"
      ? item.nameHe || item.name
      : language === "ru"
        ? item.nameRu || item.nameEn || item.nameHe || item.name
        : item.nameEn || item.nameHe || item.name;
  const description =
    language === "he"
      ? item.descriptionHe || item.description
      : language === "ru"
        ? item.descriptionRu ||
          item.descriptionEn ||
          item.descriptionHe ||
          item.description
        : item.descriptionEn || item.descriptionHe || item.description;
  const hasImage = Boolean(item.showImage);
  const imageBadges = hasImage
    ? (item.badges ?? []).filter((badge) => imageBadgeSet.has(badge))
    : [];
  const detailBadges = hasImage
    ? (item.badges ?? []).filter((badge) => !imageBadgeSet.has(badge))
    : (item.badges ?? []).slice().sort((left, right) => {
        const leftIndex = noImagePriorityBadgeOrder.indexOf(left);
        const rightIndex = noImagePriorityBadgeOrder.indexOf(right);
        const leftPriority = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const rightPriority =
          rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        return leftPriority - rightPriority;
      });
  const hasVolumeOptions = Boolean(item.volumeOptions?.length);
  const isSimuLevRestaurant =
    item.restaurantSlug.trim().toLowerCase() === "simulev";
  const allowAddons =
    isSimuLevRestaurant &&
    hasVolumeOptions &&
    !drinkCategories.has(item.category);
  const displayVolumeOptions = hasVolumeOptions && !allowAddons;
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const resolvedImage = resolveMenuImageForRestaurant(
    item.image,
    item.restaurantSlug
  );
  const addonText = getAddonText(language);
  const activeAddons = useMemo(() => {
    if (!allowAddons) {
      return [];
    }

    return (item.volumeOptions ?? [])
      .filter((addon) => selectedAddonIds.includes(addon.id))
      .sort((left, right) => left.id.localeCompare(right.id));
  }, [allowAddons, item.volumeOptions, selectedAddonIds]);
  const addonPrice = activeAddons.reduce(
    (sum, addon) => sum + addon.price,
    0
  );
  const hasAddonSelection = activeAddons.length > 0;
  const addonVariantId = hasAddonSelection
    ? `extras:${activeAddons.map((addon) => addon.id).join(",")}`
    : undefined;
  const addonVariantKey = getQuantityKey(addonVariantId);
  const addonVariantQuantity = optionQuantities[addonVariantKey] ?? 0;
  const addonVariantLabel = hasAddonSelection
    ? `Extras: ${activeAddons.map((addon) => addon.label).join(", ")}`.slice(0, 60)
    : undefined;

  function getQuantityKey(volumeOptionId?: string) {
    return `${item.id}:${volumeOptionId ?? "base"}`;
  }

  function handleAdd(
    event: MouseEvent<HTMLButtonElement>,
    volumeOptionId?: string,
    selection?: {
      volumeLabel?: string;
      priceOverride?: number;
    }
  ) {
    onAdd(item.id, event.currentTarget, volumeOptionId, selection);
  }

  function handleDecrease(
    event: MouseEvent<HTMLButtonElement>,
    volumeOptionId?: string
  ) {
    onDecrease(item.id, event.currentTarget, volumeOptionId);
  }

  function getBadgeLabel(badge: MenuBadge) {
    return badgeMeta[badge].label[language];
  }

  function toggleAddon(id: string) {
    setSelectedAddonIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id]
    );
  }

  function isPopularAddon(addon: MenuVolumeOption) {
    const normalized = addon.label.trim().toLowerCase();
    return normalized.includes("popular") || normalized.includes("популяр");
  }

  return (
    <article className="menu-card">
      {hasImage ? (
        <div className="menu-card__image-wrap">
          {imageBadges.length ? (
            <div className="menu-card__image-badges" aria-label="Dish highlights">
              {imageBadges.map((badge) => (
                <span
                  key={badge}
                  className="menu-card__image-badge menu-card__image-badge--expanded"
                  aria-label={getBadgeLabel(badge)}
                  title={getBadgeLabel(badge)}
                >
                  <span className="menu-card__image-badge-icon" aria-hidden="true">
                    {badgeMeta[badge].icon}
                  </span>
                  <span className="menu-card__image-badge-label">
                    {getBadgeLabel(badge)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <img
            className="menu-card__image"
            src={resolvedImage}
            alt={name}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = resolveMenuImageForRestaurant(
                null,
                item.restaurantSlug
              );
            }}
          />
        </div>
      ) : null}
      <div className="menu-card__body">
        <div>
          <h3>{name}</h3>
          {detailBadges.length ? (
            <div className="menu-card__badges" aria-label="Dish labels">
              {detailBadges.map((badge) => (
                <span key={badge} className="menu-card__badge">
                  <span className="menu-card__badge-icon" aria-hidden="true">
                    {badgeMeta[badge].icon}
                  </span>
                  <span className="menu-card__badge-label">
                    {getBadgeLabel(badge)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <p className="muted">{description}</p>
        </div>
        {displayVolumeOptions ? (
          <div className="menu-card__volume-list">
            {(item.volumeOptions ?? []).map((option) => {
              const optionQuantity = optionQuantities[getQuantityKey(option.id)] ?? 0;

              return (
                <div key={option.id} className="menu-card__volume-row">
                  <div className="menu-card__volume-meta">
                    {option.label ? <strong>{option.label}</strong> : null}
                    <span>{formatCurrency(option.price)}</span>
                  </div>
                  {!orderingEnabled ? null : optionQuantity > 0 ? (
                    <div className="menu-quantity-box">
                      <button
                        type="button"
                        onClick={(event) => handleDecrease(event, option.id)}
                      >
                        -
                      </button>
                      <span>{optionQuantity}</span>
                      <button
                        type="button"
                        onClick={(event) => handleAdd(event, option.id)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => handleAdd(event, option.id)}
                    >
                      {addLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
        {!displayVolumeOptions ? (
          <div className="menu-card__footer">
            <strong>
              {formatCurrency(
                allowAddons && hasAddonSelection ? item.price + addonPrice : item.price
              )}
            </strong>
            {!orderingEnabled ? null : (allowAddons && hasAddonSelection
                ? addonVariantQuantity
                : quantity) > 0 ? (
              <div className="menu-quantity-box">
                <button
                  type="button"
                  onClick={(event) =>
                    handleDecrease(
                      event,
                      allowAddons && hasAddonSelection ? addonVariantId : undefined
                    )
                  }
                >
                  -
                </button>
                <span>{allowAddons && hasAddonSelection ? addonVariantQuantity : quantity}</span>
                <button
                  type="button"
                  onClick={(event) =>
                    handleAdd(
                      event,
                      allowAddons && hasAddonSelection ? addonVariantId : undefined,
                      allowAddons && hasAddonSelection
                        ? {
                            volumeLabel: addonVariantLabel,
                            priceOverride: item.price + addonPrice
                          }
                        : undefined
                    )
                  }
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(event) =>
                  handleAdd(
                    event,
                    allowAddons && hasAddonSelection ? addonVariantId : undefined,
                    allowAddons && hasAddonSelection
                      ? {
                          volumeLabel: addonVariantLabel,
                          priceOverride: item.price + addonPrice
                        }
                      : undefined
                  )
                }
              >
                {addLabel}
              </button>
            )}
          </div>
        ) : null}
        {allowAddons ? (
          <section className="menu-card__addons" aria-label={addonText.title}>
            <div className="menu-card__addons-header">
              <strong>{addonText.title}</strong>
            </div>
            <div className="menu-card__addons-list">
              {(item.volumeOptions ?? []).map((addon) => {
                const selected = selectedAddonIds.includes(addon.id);
                const label = addon.label;

                return (
                  <label
                    key={addon.id}
                    className={
                      selected
                        ? "menu-card__addon-item menu-card__addon-item--selected"
                        : "menu-card__addon-item"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleAddon(addon.id)}
                    />
                    <span className="menu-card__addon-label">
                      {label}
                      {isPopularAddon(addon) ? (
                        <span className="menu-card__addon-popular">
                          {addonText.mostPopular}
                        </span>
                      ) : null}
                    </span>
                    <span className="menu-card__addon-price">
                      +{formatCurrency(addon.price)}
                    </span>
                  </label>
                );
              })}
            </div>
            {activeAddons.length ? (
              <div className="menu-card__addons-selected">
                <span className="menu-card__addons-selected-title">
                  {addonText.selected}:
                </span>
                <div className="menu-card__addons-chips">
                  {activeAddons.map((addon) => (
                    <span key={addon.id} className="menu-card__addons-chip">
                      {addon.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </article>
  );
}
