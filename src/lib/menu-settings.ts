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
  happyHourDiscountPercent: number;
  happyHourStartsFrom: string | null;
  happyHourUntil: string | null;
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
const MENU_SETTINGS_CACHE_TTL_MS = 2_000;

const DEFAULT_SETTINGS: MenuSettings = {
  workingHoursRules: [],
  kitchenLoadWarningEnabled: false,
  workingHoursFrom: null,
  workingHoursUntil: null,
  happyHourEnabled: false,
  happyHourText: "",
  happyHourCategories: [],
  happyHourDiscountPercent: 0,
  happyHourStartsFrom: null,
  happyHourUntil: null,
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
  const barOpenUntil =
    typeof settings?.barOpenUntil === "string" && settings.barOpenUntil.trim()
      ? settings.barOpenUntil
      : null;
  const happyHourCategories = Array.isArray(settings?.happyHourCategories)
    ? settings.happyHourCategories.filter((value): value is MenuCategory =>
        MENU_CATEGORIES.includes(value as MenuCategory)
      )
    : [];
  const happyHourDiscountPercentRaw =
    typeof settings?.happyHourDiscountPercent === "number"
      ? settings.happyHourDiscountPercent
      : Number(settings?.happyHourDiscountPercent ?? 0);
  const happyHourDiscountPercent = Number.isFinite(happyHourDiscountPercentRaw)
    ? Math.min(100, Math.max(0, happyHourDiscountPercentRaw))
    : 0;

  return {
    workingHoursRules,
    kitchenLoadWarningEnabled: Boolean(settings?.kitchenLoadWarningEnabled),
    workingHoursFrom,
    workingHoursUntil,
    happyHourEnabled: Boolean(settings?.happyHourEnabled),
    happyHourText:
      typeof settings?.happyHourText === "string" ? settings.happyHourText.trim() : "",
    happyHourCategories,
    happyHourDiscountPercent,
    happyHourStartsFrom,
    happyHourUntil,
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
