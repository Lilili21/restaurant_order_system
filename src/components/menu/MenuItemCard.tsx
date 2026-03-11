import { formatCurrency } from "@/lib/menu";
import { MenuItem } from "@/lib/types";

type MenuItemCardProps = {
  item: MenuItem;
  quantity: number;
  onAdd: (menuItemId: string) => void;
  onDecrease: (menuItemId: string) => void;
};

export function MenuItemCard({
  item,
  quantity,
  onAdd,
  onDecrease
}: MenuItemCardProps) {
  return (
    <article className="menu-card">
      <div className="menu-card__image-wrap">
        <img
          className="menu-card__image"
          src={item.image}
          alt={item.name}
          loading="lazy"
        />
      </div>
      <div className="menu-card__body">
        <div>
          <h3>{item.name}</h3>
          <p className="muted">{item.description}</p>
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
              Добавить
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
