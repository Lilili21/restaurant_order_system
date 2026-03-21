import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { getMenuSettings, updateMenuSettings } from "@/lib/menu-settings";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import type { MenuCategory } from "@/lib/types";
import type { MenuSettings } from "@/lib/menu-settings";

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

export async function GET() {
  const settings = await getMenuSettings();

  return NextResponse.json({
    kitchenLoadWarningEnabled: settings.kitchenLoadWarningEnabled,
    workingHoursRules: settings.workingHoursRules,
    workingHoursFrom: settings.workingHoursFrom,
    workingHoursUntil: settings.workingHoursUntil,
    happyHourEnabled: settings.happyHourEnabled,
    happyHourText: settings.happyHourText,
    happyHourCategories: settings.happyHourCategories,
    happyHourDiscountPercent: settings.happyHourDiscountPercent,
    happyHourStartsFrom: settings.happyHourStartsFrom,
    happyHourUntil: settings.happyHourUntil,
    kitchenOpenEnabled: settings.kitchenOpenEnabled,
    kitchenOpenUntil: settings.kitchenOpenUntil,
    barOpenEnabled: settings.barOpenEnabled,
    barOpenUntil: settings.barOpenUntil,
    tableCount: settings.tableCount,
    tableTokens: settings.tableTokens
  });
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
      happyHourDiscountPercent?: number;
      happyHourStartsFrom?: string | null;
      happyHourUntil?: string | null;
      kitchenOpenEnabled?: boolean;
      kitchenOpenUntil?: string | null;
      barOpenEnabled?: boolean;
      barOpenUntil?: string | null;
      tableCount?: number;
    };

    if (
      Array.isArray(body.happyHourCategories) &&
      body.happyHourCategories.some((category) => !MENU_CATEGORIES.includes(category))
    ) {
      throw new Error("happyHourCategories contains invalid category");
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
    if (typeof body.happyHourDiscountPercent === "number") {
      updates.happyHourDiscountPercent = body.happyHourDiscountPercent;
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

    if (typeof body.tableCount === "number") {
      updates.tableCount = body.tableCount;
    }

    return NextResponse.json(await updateMenuSettings(updates));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
