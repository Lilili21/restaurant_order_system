export const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";
export const BIR_BAR_DEFAULT_MENU_IMAGE = "/images/default-menu-item-bir-bar.svg";

export function getDefaultMenuImageByRestaurantSlug(
  restaurantSlug: string | null | undefined
) {
  const normalizedSlug = (restaurantSlug ?? "").trim().toLowerCase();

  if (normalizedSlug === "bir-bar") {
    return BIR_BAR_DEFAULT_MENU_IMAGE;
  }

  return DEFAULT_MENU_IMAGE;
}

