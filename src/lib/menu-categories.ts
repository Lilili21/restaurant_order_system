import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type MenuCategoryKind = "dishes" | "drinks" | "addons";

export type MenuCategoryDefinition = {
  slug: string;
  label: string;
  kind: MenuCategoryKind;
  active: boolean;
  linkedSlug: string | null;
  sortOrder: number;
};

const DATA_DIR = path.join(process.cwd(), "data");
const MENU_CATEGORIES_PATH = path.join(DATA_DIR, "menu-categories.json");
const MENU_CATEGORIES_KEY_PREFIX = "menu-categories:";

function normalizeSlug(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function normalizeKind(value: unknown): MenuCategoryKind {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "drinks") {
    return "drinks";
  }
  if (normalized === "addons") {
    return "addons";
  }
  return "dishes";
}

function toLabelFromSlug(slug: string) {
  if (!slug) {
    return "Category";
  }
  return slug
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeCategoryDefinition(
  value: Partial<MenuCategoryDefinition>,
  index: number
): MenuCategoryDefinition | null {
  const slug = normalizeSlug(value.slug);
  if (!slug) {
    return null;
  }

  return {
    slug,
    label: String(value.label ?? "").trim() || toLabelFromSlug(slug),
    kind: normalizeKind(value.kind),
    active: value.active !== false,
    linkedSlug: normalizeSlug(value.linkedSlug) || null,
    sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : (index + 1) * 10
  };
}

function sanitizeCategoryDefinitions(
  categories: Partial<MenuCategoryDefinition>[]
): MenuCategoryDefinition[] {
  const deduped = new Map<string, MenuCategoryDefinition>();

  categories.forEach((entry, index) => {
    const normalized = normalizeCategoryDefinition(entry, index);
    if (!normalized) {
      return;
    }
    deduped.set(normalized.slug, normalized);
  });

  return [...deduped.values()].sort((left, right) => left.sortOrder - right.sortOrder);
}

function getLocalStore() {
  if (!existsSync(MENU_CATEGORIES_PATH)) {
    return {} as Record<string, MenuCategoryDefinition[]>;
  }

  try {
    const parsed = JSON.parse(readFileSync(MENU_CATEGORIES_PATH, "utf8")) as Record<
      string,
      MenuCategoryDefinition[]
    >;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalStore(nextValue: Record<string, MenuCategoryDefinition[]>) {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(MENU_CATEGORIES_PATH, JSON.stringify(nextValue, null, 2), "utf8");
}

export async function getRestaurantMenuCategories(restaurantSlug: string) {
  const normalizedSlug = restaurantSlug.trim().toLowerCase();
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const localStore = getLocalStore();
    return sanitizeCategoryDefinitions(localStore[normalizedSlug] ?? []);
  }

  const key = `${MENU_CATEGORIES_KEY_PREFIX}${normalizedSlug}`;
  const { data, error } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    return [];
  }

  const rawValue = data?.value;
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return sanitizeCategoryDefinitions(rawValue as Partial<MenuCategoryDefinition>[]);
}

export async function saveRestaurantMenuCategories(
  restaurantSlug: string,
  categories: Partial<MenuCategoryDefinition>[]
) {
  const normalizedSlug = restaurantSlug.trim().toLowerCase();
  const normalizedCategories = sanitizeCategoryDefinitions(categories);
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const localStore = getLocalStore();
    localStore[normalizedSlug] = normalizedCategories;
    writeLocalStore(localStore);
    return normalizedCategories;
  }

  const key = `${MENU_CATEGORIES_KEY_PREFIX}${normalizedSlug}`;
  const { error } = await supabase.from("app_state").upsert(
    {
      key,
      value: normalizedCategories,
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );

  if (error) {
    throw new Error(`Failed to save categories: ${error.message}`);
  }

  return normalizedCategories;
}
