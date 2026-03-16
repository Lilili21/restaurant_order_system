import { MouseEvent } from "react";

import { formatCurrency } from "@/lib/menu";
import { MenuBadge, MenuItem, MenuLanguage } from "@/lib/types";

const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";
const badgeMeta: Record<MenuBadge, { icon: string; label: string }> = {
  chef_special: { icon: "🔥", label: "Chef's special" },
  most_popular: { icon: "⭐", label: "Most popular" },
  vegan: { icon: "🌱", label: "Vegan" },
  spicy: { icon: "🌶️", label: "Spicy" },
  kids_favorite: { icon: "🧸", label: "Kids favorite" },
  new: { icon: "🆕", label: "New" },
  gluten_free: { icon: "🌾", label: "Gluten free" },
  dairy_free: { icon: "🥛", label: "Dairy free" },
  nut_free: { icon: "🥜", label: "Nut free" }
};

const imageBadgeSet = new Set<MenuBadge>([
  "chef_special",
  "most_popular",
  "new",
  "kids_favorite"
]);

type MenuItemCardProps = {
  item: MenuItem;
  language: MenuLanguage;
  quantity: number;
  orderingEnabled?: boolean;
  onAdd: (menuItemId: string, sourceElement?: HTMLElement | null) => void;
  onDecrease: (menuItemId: string, sourceElement?: HTMLElement | null) => void;
};

export function MenuItemCard({
  item,
  language,
  quantity,
  orderingEnabled = true,
  onAdd,
  onDecrease
}: MenuItemCardProps) {
  const addLabel = language === "he" ? "הוסף" : "Add";
  const name =
    language === "he"
      ? item.nameHe || item.name
      : item.nameEn || item.nameHe || item.name;
  const description =
    language === "he"
      ? item.descriptionHe || item.description
      : item.descriptionEn || item.descriptionHe || item.description;
  const imageBadges = (item.badges ?? []).filter((badge) => imageBadgeSet.has(badge));
  const detailBadges = (item.badges ?? []).filter((badge) => !imageBadgeSet.has(badge));

  function handleAdd(event: MouseEvent<HTMLButtonElement>) {
    onAdd(item.id, event.currentTarget);
  }

  function handleDecrease(event: MouseEvent<HTMLButtonElement>) {
    onDecrease(item.id, event.currentTarget);
  }

  return (
    <article className="menu-card">
      {item.showImage ? (
        <div className="menu-card__image-wrap">
          {imageBadges.length ? (
            <div className="menu-card__image-badges" aria-label="Dish highlights">
              {imageBadges.map((badge) => (
                <span key={badge} className="menu-card__image-badge">
                  {badgeMeta[badge].icon}
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
                    {badgeMeta[badge].label}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <p className="muted">{description}</p>
        </div>
        <div className="menu-card__footer">
          <strong>{formatCurrency(item.price)}</strong>
          {!orderingEnabled ? null : quantity > 0 ? (
            <div className="menu-quantity-box">
              <button type="button" onClick={handleDecrease}>
                -
              </button>
              <span>{quantity}</span>
              <button type="button" onClick={handleAdd}>
                +
              </button>
            </div>
          ) : (
            <button type="button" onClick={handleAdd}>
              {addLabel}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
