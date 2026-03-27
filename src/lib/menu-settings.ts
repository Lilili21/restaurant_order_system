import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { MenuCategory } from "@/lib/types";

const MENU_CATEGORIES: MenuCategory[] = [
  "starters",
  "mains",
  "drinks",
  "fluids",
  "draft",
  "bottled",
  "fuel",
  "whiskey",
  "vodka",
  "rum",
  "cognac",
  "gin",
  "tequila",
  "absent",
  "ouzo",
  "likers",
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks",
  "desserts"
];

export type PromotionSettings = {
  id: string;
  enabled: boolean;
  text: string;
  categories: MenuCategory[];
  days: number[];
  discountPercent: number;
  startsFrom: string | null;
  until: string | null;
};

export type BusinessLunchSettings = {
  id: string;
  enabled: boolean;
  text: string;
  categories: MenuCategory[];
  days: number[];
  startsFrom: string | null;
  until: string | null;
};

export type RecommendationRuleSettings = {
  id: string;
  enabled: boolean;
  triggerItemId: string;
  suggestedType: "item" | "category";
  suggestedItemId: string;
  suggestedCategory: MenuCategory | null;
};

export type MenuSettings = {
  workingHoursRules: Array<{
    id: string;
    days: number[];
    from: string | null;
    until: string | null;
  }>;
  kitchenLoadWarningEnabled: boolean;
  workingHoursFrom: string | null;
  workingHoursUntil: string | null;
  happyHourEnabled: boolean;
  happyHourText: string;
  happyHourCategories: MenuCategory[];
  happyHourDays: number[];
  happyHourDiscountPercent: number;
  happyHourStartsFrom: string | null;
  happyHourUntil: string | null;
  promotions: PromotionSettings[];
  businessLunches: BusinessLunchSettings[];
  recommendations: RecommendationRuleSettings[];
  kitchenOpenEnabled: boolean;
  kitchenOpenUntil: string | null;
  barOpenEnabled: boolean;
  barOpenUntil: string | null;
  tableCount: number;
  tableTokens: Record<string, string>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const MENU_SETTINGS_PATH = path.join(DATA_DIR, "menu-settings.json");
const MENU_SETTINGS_KEY = "menu-settings";
const MENU_SETTINGS_CACHE_TTL_MS = 60_000;

const DEFAULT_SETTINGS: MenuSettings = {
  workingHoursRules: [],
  kitchenLoadWarningEnabled: false,
  workingHoursFrom: null,
  workingHoursUntil: null,
  happyHourEnabled: false,
  happyHourText: "",
  happyHourCategories: [],
  happyHourDays: [],
  happyHourDiscountPercent: 0,
  happyHourStartsFrom: null,
  happyHourUntil: null,
  promotions: [],
  businessLunches: [],
  recommendations: [],
  kitchenOpenEnabled: false,
  kitchenOpenUntil: null,
  barOpenEnabled: false,
  barOpenUntil: null,
  tableCount: 8,
  tableTokens: {}
};

type MenuSettingsCacheEntry = {
  settings: MenuSettings;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __menuSettingsCache: MenuSettingsCacheEntry | undefined;
}

function getSettingsCache() {
  return globalThis.__menuSettingsCache;
}

function setSettingsCache(settings: MenuSettings) {
  globalThis.__menuSettingsCache = {
    settings: {
      ...settings,
      tableTokens: { ...settings.tableTokens }
    },
    expiresAt: Date.now() + MENU_SETTINGS_CACHE_TTL_MS
  };
}

function generateTableToken() {
  return `tbl_${randomBytes(9).toString("base64url")}`;
}

function normalizeTableCount(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.tableCount;
  }

  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function normalizeSettings(
  settings: Partial<MenuSettings> | null | undefined
): MenuSettings {
  const tableCount = normalizeTableCount(settings?.tableCount);
  const sourceTokens =
    settings?.tableTokens && typeof settings.tableTokens === "object"
      ? settings.tableTokens
      : {};
  const tableTokens = Object.fromEntries(
    Object.entries(sourceTokens).filter(
      ([key, value]) => key && typeof value === "string" && value.trim()
    )
  );

  for (let tableNumber = 1; tableNumber <= tableCount; tableNumber += 1) {
    const key = String(tableNumber);

    if (!tableTokens[key]) {
      tableTokens[key] = generateTableToken();
    }
  }

  const normalizeRuleTime = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const workingHoursRules = Array.isArray(settings?.workingHoursRules)
    ? settings.workingHoursRules
        .map((rule, index) => {
          const rawDays = Array.isArray(rule?.days) ? rule.days : [];
          const days = [...new Set(
            rawDays.filter(
              (day): day is number =>
                typeof day === "number" &&
                Number.isInteger(day) &&
                day >= 0 &&
                day <= 6
            )
          )].sort((left, right) => left - right);

          if (days.length === 0) {
            return null;
          }

          return {
            id:
              typeof rule?.id === "string" && rule.id.trim()
                ? rule.id
                : `rule-${index + 1}`,
            days,
            from: normalizeRuleTime(rule?.from),
            until: normalizeRuleTime(rule?.until)
          };
        })
        .filter(Boolean) as MenuSettings["workingHoursRules"]
    : [];

  const kitchenOpenUntil =
    typeof settings?.kitchenOpenUntil === "string" &&
    settings.kitchenOpenUntil.trim()
      ? settings.kitchenOpenUntil
      : null;
  const workingHoursFrom =
    typeof settings?.workingHoursFrom === "string" &&
    settings.workingHoursFrom.trim()
      ? settings.workingHoursFrom
      : null;
  const workingHoursUntil =
    typeof settings?.workingHoursUntil === "string" &&
    settings.workingHoursUntil.trim()
      ? settings.workingHoursUntil
      : null;
  const happyHourStartsFrom =
    typeof settings?.happyHourStartsFrom === "string" &&
    settings.happyHourStartsFrom.trim()
      ? settings.happyHourStartsFrom
      : null;
  const happyHourUntil =
    typeof settings?.happyHourUntil === "string" &&
    settings.happyHourUntil.trim()
      ? settings.happyHourUntil
      : null;
  const happyHourText =
    typeof settings?.happyHourText === "string" ? settings.happyHourText.trim() : "";
  const barOpenUntil =
    typeof settings?.barOpenUntil === "string" && settings.barOpenUntil.trim()
      ? settings.barOpenUntil
      : null;
  const happyHourCategories = Array.isArray(settings?.happyHourCategories)
    ? settings.happyHourCategories.filter((value): value is MenuCategory =>
        MENU_CATEGORIES.includes(value as MenuCategory)
      )
    : [];
  const happyHourDays = Array.isArray(settings?.happyHourDays)
    ? [...new Set(
        settings.happyHourDays.filter(
          (day): day is number =>
            typeof day === "number" &&
            Number.isInteger(day) &&
            day >= 0 &&
            day <= 6
        )
      )].sort((left, right) => left - right)
    : [];
  const happyHourDiscountPercentRaw =
    typeof settings?.happyHourDiscountPercent === "number"
      ? settings.happyHourDiscountPercent
      : Number(settings?.happyHourDiscountPercent ?? 0);
  const happyHourDiscountPercent = Number.isFinite(happyHourDiscountPercentRaw)
    ? Math.min(100, Math.max(0, happyHourDiscountPercentRaw))
    : 0;
  const normalizePromotion = (
    promotion: Partial<PromotionSettings> | null | undefined,
    index: number
  ): PromotionSettings | null => {
    if (!promotion || typeof promotion !== "object") {
      return null;
    }

    const categories = Array.isArray(promotion.categories)
      ? promotion.categories.filter((value): value is MenuCategory =>
          MENU_CATEGORIES.includes(value as MenuCategory)
        )
      : [];
    const days = Array.isArray(promotion.days)
      ? [...new Set(
          promotion.days.filter(
            (day): day is number =>
              typeof day === "number" &&
              Number.isInteger(day) &&
              day >= 0 &&
              day <= 6
          )
        )].sort((left, right) => left - right)
      : [];
    const discountPercentRaw =
      typeof promotion.discountPercent === "number"
        ? promotion.discountPercent
        : Number(promotion.discountPercent ?? 0);

    return {
      id:
        typeof promotion.id === "string" && promotion.id.trim()
          ? promotion.id.trim()
          : `promo-${index + 1}`,
      enabled: Boolean(promotion.enabled),
      text:
        typeof promotion.text === "string" ? promotion.text.trim() : "",
      categories,
      days,
      discountPercent: Number.isFinite(discountPercentRaw)
        ? Math.min(100, Math.max(0, discountPercentRaw))
        : 0,
      startsFrom: normalizeRuleTime(promotion.startsFrom),
      until: normalizeRuleTime(promotion.until)
    };
  };
  const normalizeBusinessLunch = (
    businessLunch: Partial<BusinessLunchSettings> | null | undefined,
    index: number
  ): BusinessLunchSettings | null => {
    if (!businessLunch || typeof businessLunch !== "object") {
      return null;
    }

    const categories = Array.isArray(businessLunch.categories)
      ? businessLunch.categories.filter((value): value is MenuCategory =>
          MENU_CATEGORIES.includes(value as MenuCategory)
        )
      : [];
    const days = Array.isArray(businessLunch.days)
      ? [...new Set(
          businessLunch.days.filter(
            (day): day is number =>
              typeof day === "number" &&
              Number.isInteger(day) &&
              day >= 0 &&
              day <= 6
          )
        )].sort((left, right) => left - right)
      : [];

    return {
      id:
        typeof businessLunch.id === "string" && businessLunch.id.trim()
          ? businessLunch.id.trim()
          : `business-lunch-${index + 1}`,
      enabled: Boolean(businessLunch.enabled),
      text:
        typeof businessLunch.text === "string" ? businessLunch.text.trim() : "",
      categories,
      days,
      startsFrom: normalizeRuleTime(businessLunch.startsFrom),
      until: normalizeRuleTime(businessLunch.until)
    };
  };
  const explicitPromotions = Array.isArray(settings?.promotions)
    ? settings.promotions
        .map((promotion, index) => normalizePromotion(promotion, index))
        .filter(Boolean) as PromotionSettings[]
    : [];
  const legacyPromotion =
    happyHourText ||
    happyHourCategories.length > 0 ||
    happyHourDays.length > 0 ||
    happyHourDiscountPercent > 0 ||
    happyHourStartsFrom ||
    happyHourUntil ||
    settings?.happyHourEnabled
      ? normalizePromotion(
          {
            id: "promo-1",
            enabled: Boolean(settings?.happyHourEnabled),
            text:
              typeof settings?.happyHourText === "string"
                ? settings.happyHourText
                : "",
            categories: happyHourCategories,
            days: happyHourDays,
            discountPercent: happyHourDiscountPercent,
            startsFrom: happyHourStartsFrom,
            until: happyHourUntil
          },
          0
        )
      : null;
  const promotions =
    explicitPromotions.length > 0
      ? explicitPromotions
      : legacyPromotion
        ? [legacyPromotion]
        : [];
  const businessLunches = Array.isArray(settings?.businessLunches)
    ? settings.businessLunches
        .map((businessLunch, index) =>
          normalizeBusinessLunch(businessLunch, index)
        )
        .filter(Boolean) as BusinessLunchSettings[]
    : [];
  const recommendations = Array.isArray(settings?.recommendations)
    ? settings.recommendations
        .map((recommendation, index) => {
          if (!recommendation || typeof recommendation !== "object") {
            return null;
          }

          const triggerItemId =
            typeof recommendation.triggerItemId === "string"
              ? recommendation.triggerItemId.trim()
              : "";
          const suggestedItemId =
            typeof recommendation.suggestedItemId === "string"
              ? recommendation.suggestedItemId.trim()
              : "";
          const suggestedType =
            recommendation.suggestedType === "category" ? "category" : "item";
          const suggestedCategory =
            typeof recommendation.suggestedCategory === "string" &&
            MENU_CATEGORIES.includes(recommendation.suggestedCategory as MenuCategory)
              ? (recommendation.suggestedCategory as MenuCategory)
              : null;

          if (
            !triggerItemId ||
            (suggestedType === "item" && !suggestedItemId) ||
            (suggestedType === "category" && !suggestedCategory)
          ) {
            return null;
          }

          return {
            id:
              typeof recommendation.id === "string" && recommendation.id.trim()
                ? recommendation.id.trim()
                : `recommendation-${index + 1}`,
            enabled: Boolean(recommendation.enabled),
            triggerItemId,
            suggestedType,
            suggestedItemId: suggestedType === "item" ? suggestedItemId : "",
            suggestedCategory: suggestedType === "category" ? suggestedCategory : null
          };
        })
        .filter(Boolean) as RecommendationRuleSettings[]
    : [];
  const primaryPromotion = promotions[0] ?? null;

  return {
    workingHoursRules,
    kitchenLoadWarningEnabled: Boolean(settings?.kitchenLoadWarningEnabled),
    workingHoursFrom,
    workingHoursUntil,
    happyHourEnabled: primaryPromotion?.enabled ?? false,
    happyHourText: primaryPromotion?.text ?? "",
    happyHourCategories: primaryPromotion?.categories ?? [],
    happyHourDays: primaryPromotion?.days ?? [],
    happyHourDiscountPercent: primaryPromotion?.discountPercent ?? 0,
    happyHourStartsFrom: primaryPromotion?.startsFrom ?? null,
    happyHourUntil: primaryPromotion?.until ?? null,
    promotions,
    businessLunches,
    recommendations,
    kitchenOpenEnabled: Boolean(settings?.kitchenOpenEnabled),
    kitchenOpenUntil,
    barOpenEnabled: Boolean(settings?.barOpenEnabled),
    barOpenUntil,
    tableCount,
    tableTokens
  };
}

function persistMenuSettings(settings: MenuSettings) {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(MENU_SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

async function persistMenuSettingsAsync(settings: MenuSettings) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    persistMenuSettings(settings);
    setSettingsCache(settings);
    return;
  }

  const { error } = await supabase.from("app_state").upsert(
    {
      key: MENU_SETTINGS_KEY,
      value: settings,
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );

  if (error) {
    throw new Error(`Supabase persist failed: ${error.message}`);
  }

  setSettingsCache(settings);
}

function getMenuSettingsSync() {
  if (!existsSync(MENU_SETTINGS_PATH)) {
    persistMenuSettings(DEFAULT_SETTINGS);
    return getMenuSettingsSync();
  }

  try {
    const raw = readFileSync(MENU_SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<MenuSettings>;
    const normalized = normalizeSettings(parsed);

    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      persistMenuSettings(normalized);
    }

    return normalized;
  } catch {
    persistMenuSettings(DEFAULT_SETTINGS);
    return getMenuSettingsSync();
  }
}

export async function getMenuSettings() {
  const cached = getSettingsCache();

  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.settings,
      tableTokens: { ...cached.settings.tableTokens }
    };
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const localSettings = getMenuSettingsSync();
    setSettingsCache(localSettings);
    return {
      ...localSettings,
      tableTokens: { ...localSettings.tableTokens }
    };
  }

  try {
    const { data, error } = await supabase
      .from("app_state")
      .select("value")
      .eq("key", MENU_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.value) {
      const normalized = normalizeSettings(DEFAULT_SETTINGS);
      await persistMenuSettingsAsync(normalized);
      return {
        ...normalized,
        tableTokens: { ...normalized.tableTokens }
      };
    }

    const normalized = normalizeSettings(data.value as Partial<MenuSettings>);
    setSettingsCache(normalized);
    return {
      ...normalized,
      tableTokens: { ...normalized.tableTokens }
    };
  } catch {
    const localSettings = getMenuSettingsSync();
    setSettingsCache(localSettings);
    return {
      ...localSettings,
      tableTokens: { ...localSettings.tableTokens }
    };
  }
}

export async function updateMenuSettings(
  updates: Partial<MenuSettings>
): Promise<MenuSettings> {
  const current = await getMenuSettings();
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as Partial<MenuSettings>;
  const next = normalizeSettings({
    ...current,
    ...definedUpdates
  });

  await persistMenuSettingsAsync(next);
  return next;
}
