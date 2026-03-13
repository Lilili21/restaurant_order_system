import { formatCurrency } from "@/lib/menu";
import { MenuItem, MenuLanguage } from "@/lib/types";

const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";

type MenuItemCardProps = {
  item: MenuItem;
  language: MenuLanguage;
  quantity: number;
  onAdd: (menuItemId: string) => void;
  onDecrease: (menuItemId: string) => void;
};

export function MenuItemCard({
  item,
  language,
  quantity,
  onAdd,
  onDecrease
}: MenuItemCardProps) {
  const name =
    language === "he"
      ? item.nameHe || item.name
      : language === "en"
        ? item.nameEn || item.nameHe || item.name
        : item.nameRu || item.nameHe || item.name;
  const description =
    language === "he"
      ? item.descriptionHe || item.description
      : language === "en"
        ? item.descriptionEn || item.descriptionHe || item.description
        : item.descriptionRu || item.descriptionHe || item.description;

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
              <button type="button" onClick={() => onAdd(item.id)}>
                +
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => onAdd(item.id)}>
              {language === "he"
                ? "להוסיף"
                : language === "en"
                  ? "Add"
                  : "Добавить"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
