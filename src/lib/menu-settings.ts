import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type MenuSettings = {
  kitchenLoadWarningEnabled: boolean;
  kitchenOpenEnabled: boolean;
  kitchenOpenUntil: string | null;
  tableCount: number;
  tableTokens: Record<string, string>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const MENU_SETTINGS_PATH = path.join(DATA_DIR, "menu-settings.json");
const MENU_SETTINGS_KEY = "menu-settings";

const DEFAULT_SETTINGS: MenuSettings = {
  kitchenLoadWarningEnabled: false,
  kitchenOpenEnabled: false,
  kitchenOpenUntil: null,
  tableCount: 8,
  tableTokens: {}
};

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

  const kitchenOpenUntil =
    typeof settings?.kitchenOpenUntil === "string" &&
    settings.kitchenOpenUntil.trim()
      ? settings.kitchenOpenUntil
      : null;

  return {
    kitchenLoadWarningEnabled: Boolean(settings?.kitchenLoadWarningEnabled),
    kitchenOpenEnabled: Boolean(settings?.kitchenOpenEnabled),
    kitchenOpenUntil,
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
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return getMenuSettingsSync();
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
      return normalized;
    }

    const normalized = normalizeSettings(data.value as Partial<MenuSettings>);
    return normalized;
  } catch {
    return getMenuSettingsSync();
  }
}

export async function updateMenuSettings(
  updates: Partial<MenuSettings>
): Promise<MenuSettings> {
  const current = await getMenuSettings();
  const next = normalizeSettings({
    ...current,
    ...updates
  });

  await persistMenuSettingsAsync(next);
  return next;
}
