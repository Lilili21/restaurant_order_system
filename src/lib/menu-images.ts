export const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";
export const BIR_BAR_DEFAULT_MENU_IMAGE = "/images/default-menu-item-beerabar.svg";

function isDefaultMenuImagePath(imagePath: string) {
  return imagePath === DEFAULT_MENU_IMAGE || imagePath === BIR_BAR_DEFAULT_MENU_IMAGE;
}

export function getDefaultMenuImageByRestaurantSlug(
  restaurantSlug: string | null | undefined
) {
  const normalizedSlug = (restaurantSlug ?? "").trim().toLowerCase();

  if (normalizedSlug === "beerabar") {
    return BIR_BAR_DEFAULT_MENU_IMAGE;
  }

  return DEFAULT_MENU_IMAGE;
}

export function resolveMenuImageForRestaurant(
  image: string | null | undefined,
  restaurantSlug: string | null | undefined
) {
  const rawImage = (image ?? "").trim();
  const defaultImage = getDefaultMenuImageByRestaurantSlug(restaurantSlug);

  if (!rawImage || isDefaultMenuImagePath(rawImage)) {
    return defaultImage;
  }

  return rawImage;
}
