import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type MenuCategoryKind = "dishes" | "drinks" | "addons";

export type MenuCategoryDefinition = {
  slug: string;
  label: string;
  labelHe?: string;
  labelEn?: string;
  labelRu?: string;
  kind: MenuCategoryKind;
  active: boolean;
  linkedSlug: string | null;
  linkedSlugs?: string[];
  sortOrder: number;
};

const DATA_DIR = path.join(process.cwd(), "data");
const MENU_CATEGORIES_PATH = path.join(DATA_DIR, "menu-categories.json");
const MENU_CATEGORIES_KEY_PREFIX = "menu-categories:";
const CATEGORY_TYPE_REGULAR = "regular";

type RestaurantRow = {
  id: string;
  slug: string;
};

type MenuCategoryRow = {
  id: string;
  restaurant_id: string;
  slug: string;
  kind: string;
};

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

  const labelHe = String(value.labelHe ?? "").trim();
  const labelEn = String(value.labelEn ?? "").trim();
  const labelRu = String(value.labelRu ?? "").trim();
  const fallbackLabel =
    labelEn ||
    String(value.label ?? "").trim() ||
    labelHe ||
    labelRu ||
    toLabelFromSlug(slug);

  return {
    slug,
    label: fallbackLabel,
    labelHe: labelHe || undefined,
    labelEn: labelEn || undefined,
    labelRu: labelRu || undefined,
    kind: normalizeKind(value.kind),
    active: value.active !== false,
    linkedSlug: normalizeSlug(value.linkedSlug) || null,
    linkedSlugs: Array.isArray(value.linkedSlugs)
      ? value.linkedSlugs
          .map((entry) => normalizeSlug(entry))
          .filter(Boolean)
      : undefined,
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

  await syncMenuCategoriesTable(supabase, normalizedSlug, normalizedCategories);

  return normalizedCategories;
}

async function syncMenuCategoriesTable(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  restaurantSlug: string,
  categories: MenuCategoryDefinition[]
) {
  try {
    const { data: restaurantData, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, slug")
      .eq("slug", restaurantSlug)
      .maybeSingle();

    if (restaurantError || !restaurantData) {
      return;
    }

    const restaurant = restaurantData as RestaurantRow;
    const { data: existingData, error: existingError } = await supabase
      .from("menu_categories")
      .select("id, restaurant_id, slug, kind")
      .eq("restaurant_id", restaurant.id);

    if (existingError) {
      return;
    }

    const existingRows = Array.isArray(existingData)
      ? (existingData as MenuCategoryRow[])
      : [];
    const existingBySlug = new Map(
      existingRows.map((row) => [normalizeSlug(row.slug), row] as const)
    );
    const kindBySlug = new Map(
      existingRows.map((row) => [normalizeSlug(row.slug), String(row.kind || "")] as const)
    );

    for (const category of categories) {
      const slug = normalizeSlug(category.slug);
      if (!slug) {
        continue;
      }

      const linkedSlugCandidate = Array.isArray(category.linkedSlugs)
        ? normalizeSlug(category.linkedSlugs.find(Boolean))
        : normalizeSlug(category.linkedSlug);
      const linkedKind = linkedSlugCandidate ? kindBySlug.get(linkedSlugCandidate) : null;
      const resolvedKind =
        category.kind === "drinks"
          ? "drinks"
          : category.kind === "addons"
            ? (linkedKind === "drinks" ? "drinks" : "dishes")
            : "dishes";

      const payload = {
        restaurant_id: restaurant.id,
        slug,
        kind: resolvedKind,
        category_type: CATEGORY_TYPE_REGULAR,
        name_he: category.labelHe ?? null,
        name_en: category.labelEn ?? category.label ?? slug,
        name_ru: category.labelRu ?? null,
        sort_order: Number.isFinite(Number(category.sortOrder))
          ? Number(category.sortOrder)
          : 0,
        is_active: category.active !== false,
        updated_at: new Date().toISOString()
      };

      const existing = existingBySlug.get(slug);
      if (existing) {
        const { error: updateError } = await supabase
          .from("menu_categories")
          .update(payload)
          .eq("id", existing.id);
        if (updateError) {
          return;
        }
      } else {
        const { error: insertError } = await supabase
          .from("menu_categories")
          .insert({
            ...payload,
            created_at: new Date().toISOString()
          });
        if (insertError) {
          return;
        }
      }
    }

    const desiredSlugs = new Set(categories.map((entry) => normalizeSlug(entry.slug)));
    for (const existing of existingRows) {
      const existingSlug = normalizeSlug(existing.slug);
      if (!existingSlug || desiredSlugs.has(existingSlug)) {
        continue;
      }

      await supabase
        .from("menu_categories")
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id);
    }
  } catch {
    // Keep app_state write as source-of-truth fallback when table sync is unavailable.
  }
}
