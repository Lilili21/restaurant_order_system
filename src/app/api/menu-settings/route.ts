import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import {
  getMenuSettings,
  isCounterModeAllowedForRestaurant,
  updateMenuSettings
} from "@/lib/menu-settings";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import type { MenuCategory } from "@/lib/types";
import type {
  BusinessLunchSettings,
  ContactRequirement,
  MenuSettings,
  PromotionSettings,
  RecommendationRuleSettings,
  RestaurantOrderMode
} from "@/lib/menu-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 8;

const MENU_CATEGORIES: MenuCategory[] = [
  "starters",
  "mains",
  "main_dishes",
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
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks",
  "desserts"
];

function isValidOrderMode(value: unknown): value is RestaurantOrderMode {
  return value === "tables" || value === "counter";
}

function isValidContactRequirement(value: unknown): value is ContactRequirement {
  return (
    value === "none" || value === "name_or_phone" || value === "phone_only"
  );
}

function normalizeOrderNumberPrefix(value: string) {
  return value.trim().slice(0, 12).toUpperCase();
}

export async function GET(request: NextRequest) {
  const requestedFields = new Set(
    (request.nextUrl.searchParams.get("fields") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const includeTableTokens =
    request.nextUrl.searchParams.get("includeTableTokens") === "1";

  if (includeTableTokens) {
    const unauthorized = await requireAdminAccess(request, "secondary");

    if (unauthorized) {
      return unauthorized;
    }
  }

  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");
  const isValidSlug =
    typeof restaurantSlug === "string" &&
    /^[a-z0-9-]+$/i.test(restaurantSlug);

  if (!isValidSlug) {
    return NextResponse.json(
      { message: "restaurantSlug is required" },
      { status: 400 }
    );
  }

  const settings = await getMenuSettings(restaurantSlug);
  const payload = {
    kitchenLoadWarningEnabled: settings.kitchenLoadWarningEnabled,
    workingHoursRules: settings.workingHoursRules,
    workingHoursFrom: settings.workingHoursFrom,
    workingHoursUntil: settings.workingHoursUntil,
    happyHourEnabled: settings.happyHourEnabled,
    happyHourText: settings.happyHourText,
    happyHourCategories: settings.happyHourCategories,
    happyHourDays: settings.happyHourDays,
    happyHourDiscountPercent: settings.happyHourDiscountPercent,
    happyHourStartsFrom: settings.happyHourStartsFrom,
    happyHourUntil: settings.happyHourUntil,
    promotions: settings.promotions,
    businessLunches: settings.businessLunches,
    recommendations: settings.recommendations,
    kitchenOpenEnabled: settings.kitchenOpenEnabled,
    kitchenOpenUntil: settings.kitchenOpenUntil,
    barOpenEnabled: settings.barOpenEnabled,
    barOpenUntil: settings.barOpenUntil,
    orderMode: settings.orderMode,
    contactRequirement: settings.contactRequirement,
    requireOtp: settings.requireOtp,
    orderNumberPrefix: settings.orderNumberPrefix,
    showGuestOrderHistory: settings.showGuestOrderHistory,
    tableCount: settings.tableCount,
    ...(includeTableTokens ? { tableTokens: settings.tableTokens } : {})
  };

  if (requestedFields.size > 0) {
    const filteredPayload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => requestedFields.has(key))
    );
    return NextResponse.json(filteredPayload);
  }

  return NextResponse.json(payload);
}

export async function PATCH(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `menu-settings:patch:${clientId}`,
    maxRequests: 20,
    windowMs: 60 * 1000,
    message: "Too many settings updates. Please try again later."
  });

  if (limited) {
    return limited;
  }

  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as {
      kitchenLoadWarningEnabled?: boolean;
      workingHoursRules?: Array<{
        id?: string;
        days?: number[];
        from?: string | null;
        until?: string | null;
      }>;
      workingHoursFrom?: string | null;
      workingHoursUntil?: string | null;
      happyHourEnabled?: boolean;
      happyHourText?: string;
      happyHourCategories?: MenuCategory[];
      happyHourDays?: number[];
      happyHourDiscountPercent?: number;
      happyHourStartsFrom?: string | null;
      happyHourUntil?: string | null;
      promotions?: Array<{
        id?: string;
        enabled?: boolean;
        text?: string;
        categories?: MenuCategory[];
        days?: number[];
        discountPercent?: number;
        startsFrom?: string | null;
        until?: string | null;
      }>;
      businessLunches?: Array<{
        id?: string;
        enabled?: boolean;
        text?: string;
        categories?: MenuCategory[];
        days?: number[];
        startsFrom?: string | null;
        until?: string | null;
      }>;
      recommendations?: Array<{
        id?: string;
        enabled?: boolean;
        triggerItemId?: string;
        suggestedType?: "item" | "category";
        suggestedItemId?: string;
        suggestedCategory?: MenuCategory | null;
      }>;
      kitchenOpenEnabled?: boolean;
      kitchenOpenUntil?: string | null;
      barOpenEnabled?: boolean;
      barOpenUntil?: string | null;
      orderMode?: RestaurantOrderMode;
      contactRequirement?: ContactRequirement;
      requireOtp?: boolean;
      orderNumberPrefix?: string;
      showGuestOrderHistory?: boolean;
      tableCount?: number;
      restaurantSlug?: string;
    };
    const restaurantSlug =
      typeof body.restaurantSlug === "string" && body.restaurantSlug.trim()
        ? body.restaurantSlug.trim()
        : undefined;

    if (
      Array.isArray(body.happyHourCategories) &&
      body.happyHourCategories.some((category) => !MENU_CATEGORIES.includes(category))
    ) {
      throw new Error("happyHourCategories contains invalid category");
    }

    if (
      body.happyHourDays !== undefined &&
      (!Array.isArray(body.happyHourDays) ||
        body.happyHourDays.some(
          (day) =>
            typeof day !== "number" ||
            !Number.isInteger(day) ||
            day < 0 ||
            day > 6
        ))
    ) {
      throw new Error("happyHourDays must be integers from 0 to 6");
    }

    if (body.promotions !== undefined && !Array.isArray(body.promotions)) {
      throw new Error("promotions is invalid");
    }

    if (Array.isArray(body.promotions)) {
      if (body.promotions.length > 5) {
        throw new Error("promotions cannot contain more than 5 items");
      }

      for (const promotion of body.promotions) {
        if (!promotion || typeof promotion !== "object") {
          throw new Error("promotions contains invalid item");
        }

        if (
          promotion.categories !== undefined &&
          (!Array.isArray(promotion.categories) ||
            promotion.categories.some(
              (category) => !MENU_CATEGORIES.includes(category)
            ))
        ) {
          throw new Error("promotions contains invalid category");
        }

        if (
          promotion.days !== undefined &&
          (!Array.isArray(promotion.days) ||
            promotion.days.some(
              (day) =>
                typeof day !== "number" ||
                !Number.isInteger(day) ||
                day < 0 ||
                day > 6
            ))
        ) {
          throw new Error("promotions days must be integers from 0 to 6");
        }

        if (
          typeof promotion.discountPercent === "number" &&
          (!Number.isFinite(promotion.discountPercent) ||
            promotion.discountPercent < 0 ||
            promotion.discountPercent > 100)
        ) {
          throw new Error("promotions discountPercent must be between 0 and 100");
        }

        if (
          promotion.startsFrom !== undefined &&
          promotion.startsFrom !== null &&
          typeof promotion.startsFrom !== "string"
        ) {
          throw new Error("promotions startsFrom is invalid");
        }

        if (
          promotion.until !== undefined &&
          promotion.until !== null &&
          typeof promotion.until !== "string"
        ) {
          throw new Error("promotions until is invalid");
        }

        if (typeof promotion.startsFrom === "string") {
          const parsed = Date.parse(promotion.startsFrom);

          if (!Number.isFinite(parsed)) {
            throw new Error("promotions startsFrom is invalid");
          }
        }

        if (typeof promotion.until === "string") {
          const parsed = Date.parse(promotion.until);

          if (!Number.isFinite(parsed)) {
            throw new Error("promotions until is invalid");
          }
        }
      }
    }

    if (body.businessLunches !== undefined && !Array.isArray(body.businessLunches)) {
      throw new Error("businessLunches is invalid");
    }

    if (Array.isArray(body.businessLunches)) {
      for (const businessLunch of body.businessLunches) {
        if (!businessLunch || typeof businessLunch !== "object") {
          throw new Error("businessLunches contains invalid item");
        }

        if (
          businessLunch.categories !== undefined &&
          (!Array.isArray(businessLunch.categories) ||
            businessLunch.categories.some(
              (category) => !MENU_CATEGORIES.includes(category)
            ))
        ) {
          throw new Error("businessLunches contains invalid category");
        }

        if (
          businessLunch.days !== undefined &&
          (!Array.isArray(businessLunch.days) ||
            businessLunch.days.some(
              (day) =>
                typeof day !== "number" ||
                !Number.isInteger(day) ||
                day < 0 ||
                day > 6
            ))
        ) {
          throw new Error("businessLunches days must be integers from 0 to 6");
        }

        if (
          businessLunch.startsFrom !== undefined &&
          businessLunch.startsFrom !== null &&
          typeof businessLunch.startsFrom !== "string"
        ) {
          throw new Error("businessLunches startsFrom is invalid");
        }

        if (
          businessLunch.until !== undefined &&
          businessLunch.until !== null &&
          typeof businessLunch.until !== "string"
        ) {
          throw new Error("businessLunches until is invalid");
        }

        if (typeof businessLunch.startsFrom === "string") {
          const parsed = Date.parse(businessLunch.startsFrom);

          if (!Number.isFinite(parsed)) {
            throw new Error("businessLunches startsFrom is invalid");
          }
        }

        if (typeof businessLunch.until === "string") {
          const parsed = Date.parse(businessLunch.until);

          if (!Number.isFinite(parsed)) {
            throw new Error("businessLunches until is invalid");
          }
        }
      }
    }

    if (body.recommendations !== undefined && !Array.isArray(body.recommendations)) {
      throw new Error("recommendations is invalid");
    }

    if (Array.isArray(body.recommendations)) {
      for (const recommendation of body.recommendations) {
        if (!recommendation || typeof recommendation !== "object") {
          throw new Error("recommendations contains invalid item");
        }

        if (
          recommendation.triggerItemId !== undefined &&
          typeof recommendation.triggerItemId !== "string"
        ) {
          throw new Error("recommendations triggerItemId is invalid");
        }

        if (
          recommendation.suggestedItemId !== undefined &&
          typeof recommendation.suggestedItemId !== "string"
        ) {
          throw new Error("recommendations suggestedItemId is invalid");
        }

        if (
          recommendation.suggestedType !== undefined &&
          recommendation.suggestedType !== "item" &&
          recommendation.suggestedType !== "category"
        ) {
          throw new Error("recommendations suggestedType is invalid");
        }

        if (
          recommendation.suggestedCategory !== undefined &&
          recommendation.suggestedCategory !== null &&
          !MENU_CATEGORIES.includes(recommendation.suggestedCategory)
        ) {
          throw new Error("recommendations suggestedCategory is invalid");
        }
      }
    }

    if (
      typeof body.happyHourDiscountPercent === "number" &&
      (!Number.isFinite(body.happyHourDiscountPercent) ||
        body.happyHourDiscountPercent < 0 ||
        body.happyHourDiscountPercent > 100)
    ) {
      throw new Error("happyHourDiscountPercent must be between 0 and 100");
    }

    if (
      typeof body.tableCount === "number" &&
      (!Number.isInteger(body.tableCount) || body.tableCount < 1 || body.tableCount > 100)
    ) {
      throw new Error("tableCount must be an integer from 1 to 100");
    }

    if (typeof body.kitchenOpenUntil === "string") {
      const parsed = Date.parse(body.kitchenOpenUntil);

      if (!Number.isFinite(parsed)) {
        throw new Error("kitchenOpenUntil is invalid");
      }
    }
    if (
      body.workingHoursRules !== undefined &&
      !Array.isArray(body.workingHoursRules)
    ) {
      throw new Error("workingHoursRules is invalid");
    }

    if (Array.isArray(body.workingHoursRules)) {
      for (const rule of body.workingHoursRules) {
        if (!rule || typeof rule !== "object") {
          throw new Error("workingHoursRules contains invalid rule");
        }

        if (rule.days !== undefined) {
          if (
            !Array.isArray(rule.days) ||
            rule.days.some(
              (day) =>
                typeof day !== "number" ||
                !Number.isInteger(day) ||
                day < 0 ||
                day > 6
            )
          ) {
            throw new Error("workingHoursRules days must be integers from 0 to 6");
          }
        }

        if (
          rule.from !== undefined &&
          rule.from !== null &&
          typeof rule.from !== "string"
        ) {
          throw new Error("workingHoursRules from is invalid");
        }

        if (
          rule.until !== undefined &&
          rule.until !== null &&
          typeof rule.until !== "string"
        ) {
          throw new Error("workingHoursRules until is invalid");
        }
      }
    }

    if (
      body.workingHoursFrom !== undefined &&
      body.workingHoursFrom !== null &&
      typeof body.workingHoursFrom !== "string"
    ) {
      throw new Error("workingHoursFrom is invalid");
    }
    if (
      body.workingHoursUntil !== undefined &&
      body.workingHoursUntil !== null &&
      typeof body.workingHoursUntil !== "string"
    ) {
      throw new Error("workingHoursUntil is invalid");
    }

    if (typeof body.happyHourStartsFrom === "string") {
      const parsed = Date.parse(body.happyHourStartsFrom);

      if (!Number.isFinite(parsed)) {
        throw new Error("happyHourStartsFrom is invalid");
      }
    }
    if (typeof body.happyHourUntil === "string") {
      const parsed = Date.parse(body.happyHourUntil);

      if (!Number.isFinite(parsed)) {
        throw new Error("happyHourUntil is invalid");
      }
    }

    if (typeof body.barOpenUntil === "string") {
      const parsed = Date.parse(body.barOpenUntil);

      if (!Number.isFinite(parsed)) {
        throw new Error("barOpenUntil is invalid");
      }
    }

    if (
      body.orderMode !== undefined &&
      !isValidOrderMode(body.orderMode)
    ) {
      throw new Error("orderMode is invalid");
    }
    if (
      body.orderMode === "counter" &&
      !isCounterModeAllowedForRestaurant(restaurantSlug)
    ) {
      throw new Error(
        "Counter mode rollout is disabled for this restaurant."
      );
    }

    if (
      body.contactRequirement !== undefined &&
      !isValidContactRequirement(body.contactRequirement)
    ) {
      throw new Error("contactRequirement is invalid");
    }

    if (
      body.requireOtp !== undefined &&
      typeof body.requireOtp !== "boolean"
    ) {
      throw new Error("requireOtp is invalid");
    }

    if (
      body.showGuestOrderHistory !== undefined &&
      typeof body.showGuestOrderHistory !== "boolean"
    ) {
      throw new Error("showGuestOrderHistory is invalid");
    }

    if (
      body.orderNumberPrefix !== undefined &&
      typeof body.orderNumberPrefix !== "string"
    ) {
      throw new Error("orderNumberPrefix is invalid");
    }

    if (
      typeof body.orderNumberPrefix === "string" &&
      !normalizeOrderNumberPrefix(body.orderNumberPrefix)
    ) {
      throw new Error("orderNumberPrefix cannot be empty");
    }

    const updates: Partial<MenuSettings> = {};

    if (typeof body.kitchenLoadWarningEnabled === "boolean") {
      updates.kitchenLoadWarningEnabled = body.kitchenLoadWarningEnabled;
    }
    if (Array.isArray(body.workingHoursRules)) {
      updates.workingHoursRules = body.workingHoursRules.map((rule, index) => ({
        id:
          typeof rule.id === "string" && rule.id.trim()
            ? rule.id.trim()
            : `rule-${index + 1}`,
        days: Array.isArray(rule.days) ? rule.days : [],
        from:
          typeof rule.from === "string" && rule.from.trim()
            ? rule.from.trim()
            : null,
        until:
          typeof rule.until === "string" && rule.until.trim()
            ? rule.until.trim()
            : null
      }));
    }
    if (
      body.workingHoursFrom === null ||
      typeof body.workingHoursFrom === "string"
    ) {
      updates.workingHoursFrom = body.workingHoursFrom;
    }
    if (
      body.workingHoursUntil === null ||
      typeof body.workingHoursUntil === "string"
    ) {
      updates.workingHoursUntil = body.workingHoursUntil;
    }

    if (typeof body.happyHourEnabled === "boolean") {
      updates.happyHourEnabled = body.happyHourEnabled;
    }
    if (typeof body.happyHourText === "string") {
      updates.happyHourText = body.happyHourText;
    }
    if (Array.isArray(body.happyHourCategories)) {
      updates.happyHourCategories = body.happyHourCategories;
    }
    if (Array.isArray(body.happyHourDays)) {
      updates.happyHourDays = body.happyHourDays;
    }
    if (typeof body.happyHourDiscountPercent === "number") {
      updates.happyHourDiscountPercent = body.happyHourDiscountPercent;
    }

    if (Array.isArray(body.promotions)) {
      updates.promotions = body.promotions.map(
        (promotion, index): PromotionSettings => ({
          id:
            typeof promotion.id === "string" && promotion.id.trim()
              ? promotion.id.trim()
              : `promo-${index + 1}`,
          enabled: Boolean(promotion.enabled),
          text:
            typeof promotion.text === "string" ? promotion.text.trim() : "",
          categories: Array.isArray(promotion.categories)
            ? promotion.categories
            : [],
          days: Array.isArray(promotion.days) ? promotion.days : [],
          discountPercent:
            typeof promotion.discountPercent === "number"
              ? promotion.discountPercent
              : 0,
          startsFrom:
            typeof promotion.startsFrom === "string" &&
            promotion.startsFrom.trim()
              ? promotion.startsFrom.trim()
              : null,
          until:
            typeof promotion.until === "string" && promotion.until.trim()
              ? promotion.until.trim()
              : null
        })
      );
    }

    if (Array.isArray(body.businessLunches)) {
      updates.businessLunches = body.businessLunches.map(
        (businessLunch, index): BusinessLunchSettings => ({
          id:
            typeof businessLunch.id === "string" && businessLunch.id.trim()
              ? businessLunch.id.trim()
              : `business-lunch-${index + 1}`,
          enabled: Boolean(businessLunch.enabled),
          text:
            typeof businessLunch.text === "string"
              ? businessLunch.text.trim()
              : "",
          categories: Array.isArray(businessLunch.categories)
            ? businessLunch.categories
            : [],
          days: Array.isArray(businessLunch.days) ? businessLunch.days : [],
          startsFrom:
            typeof businessLunch.startsFrom === "string" &&
            businessLunch.startsFrom.trim()
              ? businessLunch.startsFrom.trim()
              : null,
          until:
            typeof businessLunch.until === "string" &&
            businessLunch.until.trim()
              ? businessLunch.until.trim()
              : null
        })
      );
    }

    if (Array.isArray(body.recommendations)) {
      updates.recommendations = body.recommendations
        .map(
          (recommendation, index): RecommendationRuleSettings | null => {
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
              MENU_CATEGORIES.includes(recommendation.suggestedCategory)
                ? recommendation.suggestedCategory
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
          }
        )
        .filter(Boolean) as RecommendationRuleSettings[];
    }

    if (
      body.happyHourStartsFrom === null ||
      typeof body.happyHourStartsFrom === "string"
    ) {
      updates.happyHourStartsFrom = body.happyHourStartsFrom;
    }
    if (
      body.happyHourUntil === null ||
      typeof body.happyHourUntil === "string"
    ) {
      updates.happyHourUntil = body.happyHourUntil;
    }

    if (typeof body.kitchenOpenEnabled === "boolean") {
      updates.kitchenOpenEnabled = body.kitchenOpenEnabled;
    }

    if (body.kitchenOpenUntil === null || typeof body.kitchenOpenUntil === "string") {
      updates.kitchenOpenUntil = body.kitchenOpenUntil;
    }

    if (typeof body.barOpenEnabled === "boolean") {
      updates.barOpenEnabled = body.barOpenEnabled;
    }

    if (body.barOpenUntil === null || typeof body.barOpenUntil === "string") {
      updates.barOpenUntil = body.barOpenUntil;
    }

    if (isValidOrderMode(body.orderMode)) {
      updates.orderMode = body.orderMode;
    }

    if (isValidContactRequirement(body.contactRequirement)) {
      updates.contactRequirement = body.contactRequirement;
    }

    if (typeof body.requireOtp === "boolean") {
      updates.requireOtp = body.requireOtp;
    }

    if (typeof body.orderNumberPrefix === "string") {
      updates.orderNumberPrefix = normalizeOrderNumberPrefix(body.orderNumberPrefix);
    }

    if (typeof body.showGuestOrderHistory === "boolean") {
      updates.showGuestOrderHistory = body.showGuestOrderHistory;
    }

    if (typeof body.tableCount === "number") {
      updates.tableCount = body.tableCount;
    }

    return NextResponse.json(await updateMenuSettings(restaurantSlug, updates));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
