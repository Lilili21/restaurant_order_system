import { MouseEvent } from "react";

import { formatCurrency } from "@/lib/menu";
import { MenuBadge, MenuItem, MenuLanguage } from "@/lib/types";

const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";
const badgeMeta: Record<MenuBadge, string> = {
  chef_special: "🔥",
  most_popular: "⭐",
  vegan: "🌱",
  spicy: "🌶️",
  kids_favorite: "🧸",
  new: "🆕",
  gluten_free: "🌾",
  dairy_free: "🥛",
  nut_free: "🥜"
};

type MenuItemCardProps = {
  item: MenuItem;
  language: MenuLanguage;
  quantity: number;
  onAdd: (menuItemId: string, sourceElement?: HTMLElement | null) => void;
  onDecrease: (menuItemId: string) => void;
};

export function MenuItemCard({
  item,
  language,
  quantity,
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

  function handleAdd(event: MouseEvent<HTMLButtonElement>) {
    onAdd(item.id, event.currentTarget);
  }

  return (
    <article className="menu-card">
      {item.showImage ? (
        <div className="menu-card__image-wrap">
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
          {item.badges?.length ? (
            <div className="menu-card__badges" aria-label="Dish labels">
              {item.badges.map((badge) => (
                <span key={badge} className="menu-card__badge">
                  {badgeMeta[badge]}
                </span>
              ))}
            </div>
          ) : null}
          <p className="muted">{description}</p>
        </div>
        <div className="menu-card__footer">
          <strong>{formatCurrency(item.price)}</strong>
          {quantity > 0 ? (
            <div className="menu-quantity-box">
              <button type="button" onClick={() => onDecrease(item.id)}>
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
