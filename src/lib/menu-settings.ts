import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { invalidateRestaurantsCache } from "@/lib/restaurants";
import type { MenuCategory } from "@/lib/types";

const MENU_CATEGORIES: MenuCategory[] = [
  "starters",
  "mains",
  "buters",
  "sweet",
  "cakes",
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
  "alcohol",
  "cocktails",
  "chasers",
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks",
  "desserts"
];

function normalizeLegacyMenuCategory(
  value: unknown
): MenuCategory | null {
  if (value === "main_dishes") {
    return "mains";
  }

  return MENU_CATEGORIES.includes(value as MenuCategory)
    ? (value as MenuCategory)
    : null;
}

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

export type RestaurantOrderMode = "tables" | "counter";
export type ContactRequirement = "none" | "name_or_phone" | "phone_only";

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
  orderMode: RestaurantOrderMode;
  contactRequirement: ContactRequirement;
  requireOtp: boolean;
  orderNumberPrefix: string;
  showGuestOrderHistory: boolean;
  tableCount: number;
  tableTokens: Record<string, string>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const MENU_SETTINGS_PATH = path.join(DATA_DIR, "menu-settings.json");
const MENU_SETTINGS_KEY = "menu-settings";
const MENU_SETTINGS_CACHE_TTL_MS = 60_000;
const COUNTER_MODE_FLAG_ENABLED = ["1", "true", "yes", "on"].includes(
  (process.env.FEATURE_COUNTER_MODE_ENABLED ?? "").toLowerCase()
);
const COUNTER_MODE_ALLOWED_SLUGS_RAW =
  process.env.COUNTER_MODE_ALLOWED_SLUGS ?? "";
const COUNTER_MODE_ALLOW_ALL_SLUGS =
  COUNTER_MODE_ALLOWED_SLUGS_RAW.trim() === "" ||
  COUNTER_MODE_ALLOWED_SLUGS_RAW.trim() === "*" ||
  COUNTER_MODE_ALLOWED_SLUGS_RAW.trim().toLowerCase() === "all";
const COUNTER_MODE_ALLOWED_SLUGS = new Set(
  COUNTER_MODE_ALLOWED_SLUGS_RAW
    .split(",")
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean)
);

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
  orderMode: "tables",
  contactRequirement: "none",
  requireOtp: false,
  orderNumberPrefix: "ORD",
  showGuestOrderHistory: false,
  tableCount: 8,
  tableTokens: {}
};

type MenuSettingsCacheEntry = {
  settings: MenuSettings;
  expiresAt: number;
};

type RestaurantRow = {
  id: string;
  slug: string;
};

type RestaurantSettingsRow = {
  restaurant_id: string;
  working_hours_from: string | null;
  working_hours_until: string | null;
  working_hours_rules: unknown;
  kitchen_load_warning_enabled: boolean | null;
  happy_hour_enabled: boolean | null;
  happy_hour_text: string | null;
  happy_hour_categories: unknown;
  happy_hour_days: unknown;
  happy_hour_discount_percent: number | null;
  happy_hour_starts_from: string | null;
  happy_hour_until: string | null;
  promotions: unknown;
  business_lunches: unknown;
  recommendations: unknown;
  kitchen_open_enabled: boolean | null;
  kitchen_open_until: string | null;
  bar_open_enabled: boolean | null;
  bar_open_until: string | null;
  order_mode?: string | null;
  contact_requirement?: string | null;
  require_otp?: boolean | null;
  order_number_prefix?: string | null;
  show_guest_order_history?: boolean | null;
  updated_at?: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __menuSettingsCache: Record<string, MenuSettingsCacheEntry> | undefined;
}

function getSettingsCacheKey(restaurantSlug?: string) {
  return restaurantSlug?.trim() || "__global__";
}

function getSettingsCache(restaurantSlug?: string) {
  return globalThis.__menuSettingsCache?.[getSettingsCacheKey(restaurantSlug)];
}

function setSettingsCache(settings: MenuSettings, restaurantSlug?: string) {
  globalThis.__menuSettingsCache ??= {};
  globalThis.__menuSettingsCache[getSettingsCacheKey(restaurantSlug)] = {
    settings: {
      ...settings,
      tableTokens: { ...settings.tableTokens }
    },
    expiresAt: Date.now() + MENU_SETTINGS_CACHE_TTL_MS
  };
}

function invalidateSettingsCache(restaurantSlug?: string) {
  if (!globalThis.__menuSettingsCache) {
    return;
  }

  if (restaurantSlug) {
    delete globalThis.__menuSettingsCache[getSettingsCacheKey(restaurantSlug)];
    return;
  }

  delete globalThis.__menuSettingsCache[getSettingsCacheKey(undefined)];
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
  const orderMode =
    settings?.orderMode === "counter" ? "counter" : DEFAULT_SETTINGS.orderMode;
  const contactRequirement =
    settings?.contactRequirement === "name_or_phone" ||
    settings?.contactRequirement === "phone_only"
      ? settings.contactRequirement
      : DEFAULT_SETTINGS.contactRequirement;
  const requireOtp = Boolean(settings?.requireOtp);
  const orderNumberPrefix =
    typeof settings?.orderNumberPrefix === "string" &&
    settings.orderNumberPrefix.trim()
      ? settings.orderNumberPrefix.trim().slice(0, 12).toUpperCase()
      : DEFAULT_SETTINGS.orderNumberPrefix;
  const showGuestOrderHistory = Boolean(settings?.showGuestOrderHistory);
  const happyHourCategories = Array.isArray(settings?.happyHourCategories)
    ? settings.happyHourCategories
        .map((value) => normalizeLegacyMenuCategory(value))
        .filter((value): value is MenuCategory => value !== null)
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
      ? promotion.categories
          .map((value) => normalizeLegacyMenuCategory(value))
          .filter((value): value is MenuCategory => value !== null)
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
      ? businessLunch.categories
          .map((value) => normalizeLegacyMenuCategory(value))
          .filter((value): value is MenuCategory => value !== null)
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
          const suggestedCategory = normalizeLegacyMenuCategory(
            recommendation.suggestedCategory
          );

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
    orderMode,
    contactRequirement,
    requireOtp,
    orderNumberPrefix,
    showGuestOrderHistory,
    tableCount,
    tableTokens
  };
}

export function isCounterModeAllowedForRestaurant(restaurantSlug?: string) {
  if (!COUNTER_MODE_FLAG_ENABLED) {
    return false;
  }

  if (!restaurantSlug) {
    return false;
  }

  if (COUNTER_MODE_ALLOW_ALL_SLUGS) {
    return true;
  }

  return COUNTER_MODE_ALLOWED_SLUGS.has(restaurantSlug.trim().toLowerCase());
}

function applyOrderModePolicy(
  settings: MenuSettings,
  restaurantSlug?: string
): MenuSettings {
  if (
    settings.orderMode === "counter" &&
    !isCounterModeAllowedForRestaurant(restaurantSlug)
  ) {
    return {
      ...settings,
      orderMode: "tables"
    };
  }

  return settings;
}

function parseClockTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return { hours, minutes };
}

function getLatestShiftStartTimestamp(settings: MenuSettings, now: Date) {
  const candidateDates = [
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    new Date(now)
  ];
  let latestShiftStart: number | null = null;

  for (const date of candidateDates) {
    const matchedRule = settings.workingHoursRules.find((rule) =>
      rule.days.includes(date.getDay())
    );
    const from = parseClockTime(matchedRule?.from ?? settings.workingHoursFrom);
    const until = parseClockTime(matchedRule?.until ?? settings.workingHoursUntil);

    if (!from || !until) {
      continue;
    }

    const shiftStart = new Date(date);
    shiftStart.setHours(from.hours, from.minutes, 0, 0);

    const shiftEnd = new Date(date);
    shiftEnd.setHours(until.hours, until.minutes, 0, 0);

    if (shiftEnd.getTime() <= shiftStart.getTime()) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    if (now.getTime() >= shiftEnd.getTime()) {
      continue;
    }

    const shiftStartTs = shiftStart.getTime();

    if (shiftStartTs <= now.getTime()) {
      latestShiftStart =
        latestShiftStart === null
          ? shiftStartTs
          : Math.max(latestShiftStart, shiftStartTs);
    }
  }

  return latestShiftStart;
}

function applyOpenTimersShiftPolicy(settings: MenuSettings): MenuSettings {
  const now = new Date();
  const latestShiftStart = getLatestShiftStartTimestamp(settings, now);

  if (latestShiftStart === null) {
    return settings;
  }

  const kitchenUntilTs = settings.kitchenOpenUntil
    ? Date.parse(settings.kitchenOpenUntil)
    : Number.NaN;
  const barUntilTs = settings.barOpenUntil
    ? Date.parse(settings.barOpenUntil)
    : Number.NaN;
  const kitchenExpiredInPreviousShift =
    settings.kitchenOpenEnabled &&
    Number.isFinite(kitchenUntilTs) &&
    kitchenUntilTs < latestShiftStart;
  const barExpiredInPreviousShift =
    settings.barOpenEnabled &&
    Number.isFinite(barUntilTs) &&
    barUntilTs < latestShiftStart;

  if (!kitchenExpiredInPreviousShift && !barExpiredInPreviousShift) {
    return settings;
  }

  return {
    ...settings,
    kitchenOpenEnabled: kitchenExpiredInPreviousShift
      ? false
      : settings.kitchenOpenEnabled,
    kitchenOpenUntil: kitchenExpiredInPreviousShift ? null : settings.kitchenOpenUntil,
    barOpenEnabled: barExpiredInPreviousShift ? false : settings.barOpenEnabled,
    barOpenUntil: barExpiredInPreviousShift ? null : settings.barOpenUntil
  };
}

function applyMenuRuntimePolicies(settings: MenuSettings, restaurantSlug?: string) {
  return applyOpenTimersShiftPolicy(applyOrderModePolicy(settings, restaurantSlug));
}

function mapRestaurantSettingsRowToSettings(
  row: RestaurantSettingsRow | null | undefined
): Partial<MenuSettings> {
  if (!row) {
    return {};
  }

  return {
    workingHoursFrom: row.working_hours_from,
    workingHoursUntil: row.working_hours_until,
    workingHoursRules: Array.isArray(row.working_hours_rules)
      ? (row.working_hours_rules as MenuSettings["workingHoursRules"])
      : [],
    kitchenLoadWarningEnabled: Boolean(row.kitchen_load_warning_enabled),
    happyHourEnabled: Boolean(row.happy_hour_enabled),
    happyHourText: row.happy_hour_text ?? "",
    happyHourCategories: Array.isArray(row.happy_hour_categories)
      ? (row.happy_hour_categories as MenuCategory[])
      : [],
    happyHourDays: Array.isArray(row.happy_hour_days)
      ? (row.happy_hour_days as number[])
      : [],
    happyHourDiscountPercent: row.happy_hour_discount_percent ?? 0,
    happyHourStartsFrom: row.happy_hour_starts_from,
    happyHourUntil: row.happy_hour_until,
    promotions: Array.isArray(row.promotions)
      ? (row.promotions as PromotionSettings[])
      : [],
    businessLunches: Array.isArray(row.business_lunches)
      ? (row.business_lunches as BusinessLunchSettings[])
      : [],
    recommendations: Array.isArray(row.recommendations)
      ? (row.recommendations as RecommendationRuleSettings[])
      : [],
    kitchenOpenEnabled: Boolean(row.kitchen_open_enabled),
    kitchenOpenUntil: row.kitchen_open_until,
    barOpenEnabled: Boolean(row.bar_open_enabled),
    barOpenUntil: row.bar_open_until,
    orderMode:
      row.order_mode === "counter" ? "counter" : DEFAULT_SETTINGS.orderMode,
    contactRequirement:
      row.contact_requirement === "name_or_phone" ||
      row.contact_requirement === "phone_only"
        ? row.contact_requirement
        : DEFAULT_SETTINGS.contactRequirement,
    requireOtp: Boolean(row.require_otp),
    orderNumberPrefix:
      typeof row.order_number_prefix === "string" && row.order_number_prefix.trim()
        ? row.order_number_prefix.trim().slice(0, 12).toUpperCase()
        : DEFAULT_SETTINGS.orderNumberPrefix,
    showGuestOrderHistory: Boolean(row.show_guest_order_history)
  };
}

function mapSettingsToRestaurantSettingsRow(
  restaurantId: string,
  settings: MenuSettings,
  options?: {
    includeAdvancedOrderSettings?: boolean;
  }
) {
  const row = {
    restaurant_id: restaurantId,
    working_hours_from: settings.workingHoursFrom,
    working_hours_until: settings.workingHoursUntil,
    working_hours_rules: settings.workingHoursRules,
    kitchen_load_warning_enabled: settings.kitchenLoadWarningEnabled,
    happy_hour_enabled: settings.happyHourEnabled,
    happy_hour_text: settings.happyHourText,
    happy_hour_categories: settings.happyHourCategories,
    happy_hour_days: settings.happyHourDays,
    happy_hour_discount_percent: settings.happyHourDiscountPercent,
    happy_hour_starts_from: settings.happyHourStartsFrom,
    happy_hour_until: settings.happyHourUntil,
    promotions: settings.promotions,
    business_lunches: settings.businessLunches,
    recommendations: settings.recommendations,
    kitchen_open_enabled: settings.kitchenOpenEnabled,
    kitchen_open_until: settings.kitchenOpenUntil,
    bar_open_enabled: settings.barOpenEnabled,
    bar_open_until: settings.barOpenUntil,
    updated_at: new Date().toISOString()
  };

  if (options?.includeAdvancedOrderSettings === false) {
    return row;
  }

  return {
    ...row,
    order_mode: settings.orderMode,
    contact_requirement: settings.contactRequirement,
    require_otp: settings.requireOtp,
    order_number_prefix: settings.orderNumberPrefix,
    show_guest_order_history: settings.showGuestOrderHistory
  };
}

function hasWorkingHoursConfigured(settings: MenuSettings) {
  return Boolean(
    (settings.workingHoursFrom && settings.workingHoursUntil) ||
      settings.workingHoursRules.some((rule) => rule.from && rule.until)
  );
}

function mergeRestaurantSettingsWithFallback(
  restaurantSettings: MenuSettings,
  fallbackSettings: MenuSettings
) {
  return normalizeSettings({
    ...fallbackSettings,
    ...restaurantSettings,
    workingHoursRules:
      restaurantSettings.workingHoursRules.length > 0
        ? restaurantSettings.workingHoursRules
        : fallbackSettings.workingHoursRules,
    workingHoursFrom:
      restaurantSettings.workingHoursFrom ?? fallbackSettings.workingHoursFrom,
    workingHoursUntil:
      restaurantSettings.workingHoursUntil ?? fallbackSettings.workingHoursUntil,
    promotions:
      restaurantSettings.promotions.length > 0
        ? restaurantSettings.promotions
        : fallbackSettings.promotions,
    businessLunches:
      restaurantSettings.businessLunches.length > 0
        ? restaurantSettings.businessLunches
        : fallbackSettings.businessLunches,
    recommendations: restaurantSettings.recommendations,
    happyHourText:
      restaurantSettings.happyHourText || fallbackSettings.happyHourText,
    happyHourCategories:
      restaurantSettings.happyHourCategories.length > 0
        ? restaurantSettings.happyHourCategories
        : fallbackSettings.happyHourCategories,
    happyHourDays:
      restaurantSettings.happyHourDays.length > 0
        ? restaurantSettings.happyHourDays
        : fallbackSettings.happyHourDays,
    happyHourDiscountPercent:
      restaurantSettings.happyHourDiscountPercent > 0
        ? restaurantSettings.happyHourDiscountPercent
        : fallbackSettings.happyHourDiscountPercent,
    happyHourStartsFrom:
      restaurantSettings.happyHourStartsFrom ?? fallbackSettings.happyHourStartsFrom,
    happyHourUntil:
      restaurantSettings.happyHourUntil ?? fallbackSettings.happyHourUntil,
    kitchenOpenUntil:
      restaurantSettings.kitchenOpenUntil ?? fallbackSettings.kitchenOpenUntil,
    barOpenUntil: restaurantSettings.barOpenUntil ?? fallbackSettings.barOpenUntil,
    orderMode: restaurantSettings.orderMode ?? fallbackSettings.orderMode,
    contactRequirement:
      restaurantSettings.contactRequirement ?? fallbackSettings.contactRequirement,
    requireOtp: restaurantSettings.requireOtp ?? fallbackSettings.requireOtp,
    orderNumberPrefix:
      restaurantSettings.orderNumberPrefix || fallbackSettings.orderNumberPrefix,
    showGuestOrderHistory:
      restaurantSettings.showGuestOrderHistory ??
      fallbackSettings.showGuestOrderHistory,
    tableCount: restaurantSettings.tableCount,
    tableTokens: restaurantSettings.tableTokens
  });
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

async function getRestaurantIdBySlug(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  restaurantSlug: string
) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, slug")
    .ilike("slug", restaurantSlug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as RestaurantRow;
}

async function getRestaurantSettingsFromSupabase(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  restaurantSlug: string
) {
  const restaurant = await getRestaurantIdBySlug(supabase, restaurantSlug);

  if (!restaurant) {
    return null;
  }

  const [{ data: settingsRow, error: settingsError }, { data: tableRows, error: tablesError }] =
    await Promise.all([
      supabase
        .from("restaurant_settings")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .maybeSingle(),
      supabase
        .from("restaurant_tables")
        .select("id, table_number, access_token, is_active")
        .eq("restaurant_id", restaurant.id)
        .eq("is_active", true)
        .order("table_number", { ascending: true })
    ]);

  if (settingsError || tablesError) {
    return null;
  }

  const tableRowsSafe = Array.isArray(tableRows)
    ? tableRows.map((table) => {
        const sourceToken =
          typeof table.access_token === "string" ? table.access_token : "";
        const token =
          sourceToken.trim().length >= 12 ? sourceToken : generateTableToken();

        return {
          ...table,
          access_token: token,
          __tokenRefreshed: token !== sourceToken
        };
      })
    : [];

  const rowsNeedingTokenRefresh = tableRowsSafe.filter((table) => table.__tokenRefreshed);

  if (rowsNeedingTokenRefresh.length > 0) {
    const { error: refreshTokensError } = await supabase.from("restaurant_tables").upsert(
      rowsNeedingTokenRefresh.map((table) => ({
        id: table.id,
        access_token: table.access_token
      })),
      { onConflict: "id" }
    );

    if (refreshTokensError) {
      return null;
    }
  }

  const tableTokens = Object.fromEntries(
    tableRowsSafe.map((table) => [String(table.table_number), table.access_token])
  );

  const normalized = normalizeSettings({
    ...mapRestaurantSettingsRowToSettings((settingsRow ?? null) as RestaurantSettingsRow | null),
    tableCount: tableRowsSafe.length || 1,
    tableTokens
  });

  return normalized;
}

async function getLegacyMenuSettingsFromSupabase(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>
) {
  const { data, error } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", MENU_SETTINGS_KEY)
    .maybeSingle();

  if (error || !data?.value) {
    return null;
  }

  return normalizeSettings(data.value as Partial<MenuSettings>);
}

async function persistRestaurantSettingsAsync(
  restaurantSlug: string,
  settings: MenuSettings
): Promise<MenuSettings> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    persistMenuSettings(settings);
    setSettingsCache(settings, restaurantSlug);
    return settings;
  }

  const restaurant = await getRestaurantIdBySlug(supabase, restaurantSlug);

  if (!restaurant) {
    throw new Error(`Restaurant not found: ${restaurantSlug}`);
  }

  const fullSettingsPayload = mapSettingsToRestaurantSettingsRow(restaurant.id, settings, {
    includeAdvancedOrderSettings: true
  });
  const { error: upsertWithAdvancedSettingsError } = await supabase
    .from("restaurant_settings")
    .upsert(fullSettingsPayload, {
      onConflict: "restaurant_id"
    });
  if (upsertWithAdvancedSettingsError) {
    const missingAdvancedColumns =
      upsertWithAdvancedSettingsError.message.includes("column") &&
      (
        upsertWithAdvancedSettingsError.message.includes("order_mode") ||
        upsertWithAdvancedSettingsError.message.includes("contact_requirement") ||
        upsertWithAdvancedSettingsError.message.includes("require_otp") ||
        upsertWithAdvancedSettingsError.message.includes("order_number_prefix") ||
        upsertWithAdvancedSettingsError.message.includes("show_guest_order_history")
      ) &&
      upsertWithAdvancedSettingsError.message.includes("does not exist");

    if (!missingAdvancedColumns) {
      throw new Error(`Supabase persist failed: ${upsertWithAdvancedSettingsError.message}`);
    }

    const legacySettingsPayload = mapSettingsToRestaurantSettingsRow(restaurant.id, settings, {
      includeAdvancedOrderSettings: false
    });
    const { error: fallbackUpsertError } = await supabase
      .from("restaurant_settings")
      .upsert(legacySettingsPayload, {
        onConflict: "restaurant_id"
      });

    if (fallbackUpsertError) {
      throw new Error(`Supabase persist failed: ${fallbackUpsertError.message}`);
    }
  }

  const { data: existingTableRows, error: existingTablesError } = await supabase
    .from("restaurant_tables")
    .select("id, table_number, access_token, seats, zone, is_active")
    .eq("restaurant_id", restaurant.id)
    .order("table_number", { ascending: true });

  if (existingTablesError) {
    throw new Error(`Supabase persist failed: ${existingTablesError.message}`);
  }

  const existingByNumber = new Map(
    (existingTableRows ?? []).map((table) => [Number(table.table_number), table] as const)
  );
  const activeRows = Array.from({ length: settings.tableCount }, (_, index) => {
    const tableNumber = index + 1;
    const existingRow = existingByNumber.get(tableNumber);

    return {
      id: existingRow?.id,
      restaurant_id: restaurant.id,
      table_number: tableNumber,
      access_token:
        typeof existingRow?.access_token === "string" && existingRow.access_token.trim()
          ? existingRow.access_token
          : generateTableToken(),
      seats: existingRow?.seats ?? 4,
      zone:
        typeof existingRow?.zone === "string" && existingRow.zone.trim()
          ? existingRow.zone
          : "Hall",
      is_active: true,
      updated_at: new Date().toISOString()
    };
  });

  const rowsToUpdate = activeRows.filter((row) => row.id);
  const rowsToInsert = activeRows
    .filter((row) => !row.id)
    .map(({ id: _id, ...row }) => row);
  const inactiveRows = (existingTableRows ?? [])
    .filter((table) => Number(table.table_number) > settings.tableCount)
    .map((table) => ({
      id: table.id,
      restaurant_id: restaurant.id,
      table_number: Number(table.table_number),
      access_token:
        typeof table.access_token === "string" && table.access_token.trim()
          ? table.access_token
          : generateTableToken(),
      seats: table.seats ?? 4,
      zone:
        typeof table.zone === "string" && table.zone.trim() ? table.zone : "Hall",
      is_active: false,
      updated_at: new Date().toISOString()
    }));

  if (rowsToUpdate.length > 0) {
    const { error: updateRowsError } = await supabase
      .from("restaurant_tables")
      .upsert(rowsToUpdate, { onConflict: "id" });

    if (updateRowsError) {
      throw new Error(`Supabase persist failed: ${updateRowsError.message}`);
    }
  }

  if (rowsToInsert.length > 0) {
    const { error: insertRowsError } = await supabase
      .from("restaurant_tables")
      .insert(rowsToInsert);

    if (insertRowsError) {
      throw new Error(`Supabase persist failed: ${insertRowsError.message}`);
    }
  }

  if (inactiveRows.length > 0) {
    const { error: deactivateRowsError } = await supabase
      .from("restaurant_tables")
      .upsert(inactiveRows, { onConflict: "id" });

    if (deactivateRowsError) {
      throw new Error(`Supabase persist failed: ${deactivateRowsError.message}`);
    }
  }

  const syncedSettings = normalizeSettings({
    ...settings,
    tableCount: settings.tableCount,
    tableTokens: Object.fromEntries(
      activeRows.map((row) => [String(row.table_number), row.access_token])
    )
  });

  invalidateRestaurantsCache();
  setSettingsCache(syncedSettings, restaurantSlug);
  return syncedSettings;
}

export async function getMenuSettings(
  restaurantSlug?: string,
  options?: { skipCache?: boolean }
) {
  const skipCache = Boolean(options?.skipCache);
  // Restaurant-scoped settings include operational toggles (kitchen/bar timers)
  // that must be immediately consistent after save across admin and guest pages.
  // Avoid serving process-local stale cache for restaurant reads.
  const useCache = !skipCache && !restaurantSlug;
  const cached = useCache ? getSettingsCache(restaurantSlug) : undefined;

  if (cached && cached.expiresAt > Date.now()) {
    const nextSettings = applyMenuRuntimePolicies(cached.settings, restaurantSlug);
    return {
      ...nextSettings,
      tableTokens: { ...nextSettings.tableTokens }
    };
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const localSettings = applyMenuRuntimePolicies(
      getMenuSettingsSync(),
      restaurantSlug
    );
    setSettingsCache(localSettings, restaurantSlug);
    return {
      ...localSettings,
      tableTokens: { ...localSettings.tableTokens }
    };
  }

  try {
    if (restaurantSlug) {
      const restaurantSettings = await getRestaurantSettingsFromSupabase(
        supabase,
        restaurantSlug
      );

      if (restaurantSettings) {
        const nextRestaurantSettings = applyMenuRuntimePolicies(
          hasWorkingHoursConfigured(restaurantSettings)
            ? restaurantSettings
            : mergeRestaurantSettingsWithFallback(
                restaurantSettings,
                (await getLegacyMenuSettingsFromSupabase(supabase)) ?? getMenuSettingsSync()
              ),
          restaurantSlug
        );

        setSettingsCache(nextRestaurantSettings, restaurantSlug);
        return {
          ...nextRestaurantSettings,
          tableTokens: { ...nextRestaurantSettings.tableTokens }
        };
      }
    }

    const { data, error } = await supabase
      .from("app_state")
      .select("value")
      .eq("key", MENU_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.value) {
      const normalized = applyMenuRuntimePolicies(
        normalizeSettings(DEFAULT_SETTINGS),
        restaurantSlug
      );
      if (restaurantSlug) {
        await persistRestaurantSettingsAsync(restaurantSlug, normalized);
      } else {
        await persistMenuSettingsAsync(normalized);
      }
      return {
        ...normalized,
        tableTokens: { ...normalized.tableTokens }
      };
    }

    const normalized = applyMenuRuntimePolicies(
      normalizeSettings(data.value as Partial<MenuSettings>),
      restaurantSlug
    );
    setSettingsCache(normalized, restaurantSlug);
    return {
      ...normalized,
      tableTokens: { ...normalized.tableTokens }
    };
  } catch {
    const localSettings = applyMenuRuntimePolicies(
      getMenuSettingsSync(),
      restaurantSlug
    );
    setSettingsCache(localSettings, restaurantSlug);
    return {
      ...localSettings,
      tableTokens: { ...localSettings.tableTokens }
    };
  }
}

export async function updateMenuSettings(
  restaurantSlugOrUpdates: string | undefined | Partial<MenuSettings>,
  maybeUpdates?: Partial<MenuSettings>
): Promise<MenuSettings> {
  const restaurantSlug =
    typeof restaurantSlugOrUpdates === "string" ? restaurantSlugOrUpdates : undefined;
  const updates =
    typeof restaurantSlugOrUpdates === "string"
      ? maybeUpdates ?? {}
      : restaurantSlugOrUpdates ?? {};
  // Always merge updates over a fresh snapshot to avoid restoring stale cached values.
  const current = await getMenuSettings(restaurantSlug, { skipCache: true });
  if (
    updates.orderMode === "counter" &&
    !isCounterModeAllowedForRestaurant(restaurantSlug)
  ) {
    throw new Error("Counter mode is not enabled for this restaurant.");
  }
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as Partial<MenuSettings>;
  const next = applyOrderModePolicy(
    normalizeSettings({
      ...current,
      ...definedUpdates
    }),
    restaurantSlug
  );

  if (restaurantSlug) {
    const saved = await persistRestaurantSettingsAsync(restaurantSlug, next);
    invalidateSettingsCache(restaurantSlug);
    return saved;
  } else {
    await persistMenuSettingsAsync(next);
    invalidateSettingsCache();
    return next;
  }
}
