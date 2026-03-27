import type { MenuCategory } from "@/lib/types";

export type EditablePromotion = {
  id: string;
  enabled: boolean;
  text: string;
  categories: MenuCategory[];
  days: number[];
  discountPercent: string;
  startsFrom: string;
  until: string;
};

export type EditableBusinessLunch = {
  id: string;
  enabled: boolean;
  text: string;
  categories: MenuCategory[];
  days: number[];
  startsFrom: string;
  until: string;
};

export type EditableRecommendationRule = {
  id: string;
  enabled: boolean;
  triggerItemId: string;
  suggestedType: "item" | "category";
  suggestedItemId: string;
  suggestedCategory: MenuCategory | "";
};
