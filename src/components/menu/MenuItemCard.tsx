import { MouseEvent } from "react";

import { formatCurrency } from "@/lib/menu";
import { MenuBadge, MenuItem, MenuLanguage } from "@/lib/types";

const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";
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
    volumeOptionId?: string
  ) => void;
  onDecrease: (
    menuItemId: string,
    sourceElement?: HTMLElement | null,
    volumeOptionId?: string
  ) => void;
};

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

  function getQuantityKey(volumeOptionId?: string) {
    return `${item.id}:${volumeOptionId ?? "base"}`;
  }

  function handleAdd(
    event: MouseEvent<HTMLButtonElement>,
    volumeOptionId?: string
  ) {
    onAdd(item.id, event.currentTarget, volumeOptionId);
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
            src={item.image || DEFAULT_MENU_IMAGE}
            alt={name}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = DEFAULT_MENU_IMAGE;
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
        {item.volumeOptions?.length ? (
          <div className="menu-card__volume-list">
            {item.volumeOptions.map((option) => {
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
        {!hasVolumeOptions ? (
          <div className="menu-card__footer">
            <strong>{formatCurrency(item.price)}</strong>
            {!orderingEnabled ? null : quantity > 0 ? (
              <div className="menu-quantity-box">
                <button type="button" onClick={(event) => handleDecrease(event)}>
                  -
                </button>
                <span>{quantity}</span>
                <button type="button" onClick={(event) => handleAdd(event)}>
                  +
                </button>
              </div>
            ) : (
              <button type="button" onClick={(event) => handleAdd(event)}>
                {addLabel}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
