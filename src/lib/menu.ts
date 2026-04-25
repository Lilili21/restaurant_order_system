import { menuItems } from "@/lib/mock-data";
import { formatAgorotToILS, shekelsToAgorot } from "@/lib/money";
import { MenuItem, MenuLanguage, MenuVolumeOption } from "@/lib/types";

export function getMenuByRestaurant(slug: string): MenuItem[] {
  return menuItems.filter(
    (item) => item.restaurantSlug === slug && item.available
  );
}

export function formatCurrency(value: number) {
  return formatAgorotToILS(shekelsToAgorot(value), {
    locale: "ru-RU",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

const simulevLegacyOptionTranslations: Record<
  string,
  { he: string; en: string; ru: string }
> = {
  "תפוחי אדמה": { he: "תפוחי אדמה", en: "Potato", ru: "Картофельные" },
  "קישואים": { he: "קישואים", en: "Zucchini", ru: "Кабачковые" },
  potato: { he: "תפוחי אדמה", en: "Potato", ru: "Картофельные" },
  zucchini: { he: "קישואים", en: "Zucchini", ru: "Кабачковые" },
  "картофельные": { he: "תפוחי אדמה", en: "Potato", ru: "Картофельные" },
  "кабачковые": { he: "קישואים", en: "Zucchini", ru: "Кабачковые" }
};

function getLegacySimuLevOptionTranslation(label: string) {
  return simulevLegacyOptionTranslations[label.trim().toLowerCase()] ?? null;
}

export function getLocalizedVolumeOptionLabel(
  option: MenuVolumeOption,
  language: MenuLanguage,
  restaurantSlug?: string | null
) {
  const explicitLabel =
    language === "he"
      ? option.labelHe?.trim()
      : language === "ru"
        ? option.labelRu?.trim() || option.labelEn?.trim()
        : option.labelEn?.trim() || option.labelRu?.trim();

  if (explicitLabel) {
    return explicitLabel;
  }

  if ((restaurantSlug ?? "").trim().toLowerCase() === "simulev") {
    const legacyTranslation = getLegacySimuLevOptionTranslation(option.label);
    if (legacyTranslation) {
      return legacyTranslation[language];
    }
  }

  return option.label;
}
