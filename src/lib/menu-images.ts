export const DEFAULT_MENU_IMAGE = "/images/default-menu-item.svg";
export const SIMULEV_SLUG = "simuLev";
export const SIMULEV_DEFAULT_MENU_IMAGE = "/images/default-menu-item-simuLev.svg";

function isDefaultMenuImagePath(imagePath: string) {
  return imagePath === DEFAULT_MENU_IMAGE || imagePath === SIMULEV_DEFAULT_MENU_IMAGE;
}

export function getDefaultMenuImageByRestaurantSlug(
  restaurantSlug: string | null | undefined
) {
  const normalizedSlug = (restaurantSlug ?? "").trim().toLowerCase();

  if (normalizedSlug === SIMULEV_SLUG.toLowerCase()) {
    return SIMULEV_DEFAULT_MENU_IMAGE;
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
