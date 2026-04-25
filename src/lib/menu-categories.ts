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
  category_type?: string | null;
  name_he?: string | null;
  name_en?: string | null;
  name_ru?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
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

async function readStoredRestaurantMenuCategories(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>> | null,
  normalizedSlug: string
) {
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

async function writeStoredRestaurantMenuCategories(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>> | null,
  normalizedSlug: string,
  categories: MenuCategoryDefinition[]
) {
  if (!supabase) {
    const localStore = getLocalStore();
    localStore[normalizedSlug] = categories;
    writeLocalStore(localStore);
    return;
  }

  const key = `${MENU_CATEGORIES_KEY_PREFIX}${normalizedSlug}`;
  const { error } = await supabase.from("app_state").upsert(
    {
      key,
      value: categories,
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );

  if (error) {
    throw new Error(`Failed to save categories: ${error.message}`);
  }
}

async function resolveRestaurantBySlug(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  restaurantSlug: string
) {
  const exactMatch = await supabase
    .from("restaurants")
    .select("id, slug")
    .eq("slug", restaurantSlug)
    .maybeSingle();

  let restaurantData = exactMatch.data;
  let restaurantError = exactMatch.error;

  if (!restaurantData) {
    const fallbackMatch = await supabase
      .from("restaurants")
      .select("id, slug")
      .ilike("slug", restaurantSlug)
      .maybeSingle();

    restaurantData = fallbackMatch.data;
    restaurantError = fallbackMatch.error;
  }

  if (restaurantError || !restaurantData) {
    throw new Error(
      `Failed to resolve restaurant "${restaurantSlug}" for menu_categories sync.`
    );
  }

  return restaurantData as RestaurantRow;
}

export async function getRestaurantMenuCategories(restaurantSlug: string) {
  const normalizedSlug = restaurantSlug.trim().toLowerCase();
  const supabase = getSupabaseAdminClient();
  return readStoredRestaurantMenuCategories(supabase, normalizedSlug);
}

export async function saveRestaurantMenuCategories(
  restaurantSlug: string,
  categories: Partial<MenuCategoryDefinition>[]
) {
  const normalizedSlug = restaurantSlug.trim().toLowerCase();
  const normalizedCategories = sanitizeCategoryDefinitions(categories);
  const supabase = getSupabaseAdminClient();

  if (supabase) {
    await syncMenuCategoriesTable(supabase, normalizedSlug, normalizedCategories);
  }

  await writeStoredRestaurantMenuCategories(supabase, normalizedSlug, normalizedCategories);
  return normalizedCategories;
}

export async function upsertRestaurantMenuCategory(
  restaurantSlug: string,
  category: Partial<MenuCategoryDefinition>
) {
  const normalizedSlug = restaurantSlug.trim().toLowerCase();
  const normalizedCategory = normalizeCategoryDefinition(category, 0);

  if (!normalizedCategory) {
    throw new Error("category slug is required");
  }

  const supabase = getSupabaseAdminClient();
  const currentCategories = await readStoredRestaurantMenuCategories(supabase, normalizedSlug);
  const existingIndex = currentCategories.findIndex(
    (entry) => entry.slug === normalizedCategory.slug
  );

  const nextCategories = [...currentCategories];
  if (existingIndex >= 0) {
    nextCategories[existingIndex] = normalizedCategory;
  } else {
    nextCategories.push(normalizedCategory);
  }

  const sanitizedNext = sanitizeCategoryDefinitions(nextCategories);

  if (supabase) {
    const restaurant = await resolveRestaurantBySlug(supabase, normalizedSlug);
    await syncSingleMenuCategoryTable(supabase, restaurant, normalizedCategory, sanitizedNext);
  }

  await writeStoredRestaurantMenuCategories(supabase, normalizedSlug, sanitizedNext);
  return sanitizedNext;
}

export async function deleteRestaurantMenuCategory(
  restaurantSlug: string,
  categorySlug: string
) {
  const normalizedRestaurantSlug = restaurantSlug.trim().toLowerCase();
  const normalizedCategorySlug = normalizeSlug(categorySlug);

  if (!normalizedCategorySlug) {
    throw new Error("category slug is required");
  }

  const supabase = getSupabaseAdminClient();
  const currentCategories = await readStoredRestaurantMenuCategories(
    supabase,
    normalizedRestaurantSlug
  );
  const nextCategories = currentCategories.filter(
    (entry) => entry.slug !== normalizedCategorySlug
  );

  if (supabase) {
    const restaurant = await resolveRestaurantBySlug(supabase, normalizedRestaurantSlug);
    const { data: existingRow, error: existingError } = await supabase
      .from("menu_categories")
      .select("id, is_active")
      .eq("restaurant_id", restaurant.id)
      .ilike("slug", normalizedCategorySlug)
      .maybeSingle();

    if (existingError) {
      throw new Error(
        `Failed to read category "${normalizedCategorySlug}": ${existingError.message}`
      );
    }

    if (existingRow && existingRow.is_active !== false) {
      const { error: deactivateError } = await supabase
        .from("menu_categories")
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingRow.id);

      if (deactivateError) {
        throw new Error(
          `Failed to delete category "${normalizedCategorySlug}": ${deactivateError.message}`
        );
      }
    }
  }

  await writeStoredRestaurantMenuCategories(supabase, normalizedRestaurantSlug, nextCategories);
  return nextCategories;
}

async function syncMenuCategoriesTable(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  restaurantSlug: string,
  categories: MenuCategoryDefinition[]
) {
  const restaurant = await resolveRestaurantBySlug(supabase, restaurantSlug);
  const { data: existingData, error: existingError } = await supabase
    .from("menu_categories")
    .select(
      "id, restaurant_id, slug, kind, category_type, name_he, name_en, name_ru, sort_order, is_active"
    )
    .eq("restaurant_id", restaurant.id);

  if (existingError) {
    throw new Error(`Failed to read menu_categories: ${existingError.message}`);
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

  const syncTasks: PromiseLike<void>[] = [];

  for (const category of categories) {
    const slug = normalizeSlug(category.slug);
    if (!slug) {
      continue;
    }

    const fallbackLabel = String(
      category.labelEn ??
        category.label ??
        category.labelHe ??
        category.labelRu ??
        toLabelFromSlug(slug)
    ).trim() || toLabelFromSlug(slug);

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
      name_he: String(category.labelHe ?? fallbackLabel).trim() || fallbackLabel,
      name_en: String(category.labelEn ?? category.label ?? fallbackLabel).trim() || fallbackLabel,
      name_ru: String(category.labelRu ?? fallbackLabel).trim() || fallbackLabel,
      sort_order: Number.isFinite(Number(category.sortOrder))
        ? Number(category.sortOrder)
        : 0,
      is_active: category.active !== false,
      updated_at: new Date().toISOString()
    };

    const existing = existingBySlug.get(slug);
    if (existing) {
      const hasChanges =
        String(existing.kind ?? "") !== String(payload.kind) ||
        String(existing.category_type ?? "") !== String(payload.category_type) ||
        String(existing.name_he ?? "") !== String(payload.name_he) ||
        String(existing.name_en ?? "") !== String(payload.name_en) ||
        String(existing.name_ru ?? "") !== String(payload.name_ru) ||
        Number(existing.sort_order ?? 0) !== Number(payload.sort_order) ||
        Boolean(existing.is_active) !== Boolean(payload.is_active);

      if (!hasChanges) {
        continue;
      }

      syncTasks.push(
        supabase
          .from("menu_categories")
          .update(payload)
          .eq("id", existing.id)
          .then(({ error: updateError }) => {
            if (updateError) {
              throw new Error(
                `Failed to update category "${slug}": ${updateError.message}`
              );
            }
          })
      );
    } else {
      syncTasks.push(
        supabase
          .from("menu_categories")
          .insert({
            ...payload,
            created_at: new Date().toISOString()
          })
          .then(({ error: insertError }) => {
            if (insertError) {
              throw new Error(
                `Failed to insert category "${slug}": ${insertError.message}`
              );
            }
          })
      );
    }
  }

  const desiredSlugs = new Set(categories.map((entry) => normalizeSlug(entry.slug)));
  for (const existing of existingRows) {
    const existingSlug = normalizeSlug(existing.slug);
    if (!existingSlug || desiredSlugs.has(existingSlug)) {
      continue;
    }

    if (existing.is_active === false) {
      continue;
    }

    syncTasks.push(
      supabase
        .from("menu_categories")
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .then(({ error: deactivateError }) => {
          if (deactivateError) {
            throw new Error(
              `Failed to deactivate category "${existingSlug}": ${deactivateError.message}`
            );
          }
        })
    );
  }

  await Promise.all(syncTasks);
}

async function syncSingleMenuCategoryTable(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  restaurant: RestaurantRow,
  category: MenuCategoryDefinition,
  allCategories: MenuCategoryDefinition[]
) {
  const slug = normalizeSlug(category.slug);
  if (!slug) {
    return;
  }

  const linkedSlugCandidate = Array.isArray(category.linkedSlugs)
    ? normalizeSlug(category.linkedSlugs.find(Boolean))
    : normalizeSlug(category.linkedSlug);
  const linkedCategory = linkedSlugCandidate
    ? allCategories.find((entry) => normalizeSlug(entry.slug) === linkedSlugCandidate) ?? null
    : null;
  const resolvedKind =
    category.kind === "drinks"
      ? "drinks"
      : category.kind === "addons"
        ? (linkedCategory?.kind === "drinks" ? "drinks" : "dishes")
        : "dishes";
  const fallbackLabel = String(
    category.labelEn ??
      category.label ??
      category.labelHe ??
      category.labelRu ??
      toLabelFromSlug(slug)
  ).trim() || toLabelFromSlug(slug);

  const payload = {
    restaurant_id: restaurant.id,
    slug,
    kind: resolvedKind,
    category_type: CATEGORY_TYPE_REGULAR,
    name_he: String(category.labelHe ?? fallbackLabel).trim() || fallbackLabel,
    name_en: String(category.labelEn ?? category.label ?? fallbackLabel).trim() || fallbackLabel,
    name_ru: String(category.labelRu ?? fallbackLabel).trim() || fallbackLabel,
    sort_order: Number.isFinite(Number(category.sortOrder))
      ? Number(category.sortOrder)
      : 0,
    is_active: category.active !== false,
    updated_at: new Date().toISOString()
  };

  const { data: existingRow, error: existingError } = await supabase
    .from("menu_categories")
    .select(
      "id, restaurant_id, slug, kind, category_type, name_he, name_en, name_ru, sort_order, is_active"
    )
    .eq("restaurant_id", restaurant.id)
    .ilike("slug", slug)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to read category "${slug}": ${existingError.message}`);
  }

  if (existingRow) {
    const hasChanges =
      String(existingRow.kind ?? "") !== String(payload.kind) ||
      String(existingRow.category_type ?? "") !== String(payload.category_type) ||
      String(existingRow.name_he ?? "") !== String(payload.name_he) ||
      String(existingRow.name_en ?? "") !== String(payload.name_en) ||
      String(existingRow.name_ru ?? "") !== String(payload.name_ru) ||
      Number(existingRow.sort_order ?? 0) !== Number(payload.sort_order) ||
      Boolean(existingRow.is_active) !== Boolean(payload.is_active);

    if (!hasChanges) {
      return;
    }

    const { error: updateError } = await supabase
      .from("menu_categories")
      .update(payload)
      .eq("id", existingRow.id);

    if (updateError) {
      throw new Error(`Failed to update category "${slug}": ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await supabase.from("menu_categories").insert({
    ...payload,
    created_at: new Date().toISOString()
  });

  if (insertError) {
    throw new Error(`Failed to insert category "${slug}": ${insertError.message}`);
  }
}
