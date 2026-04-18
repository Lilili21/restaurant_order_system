"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { ControlCenterDashboard } from "@/components/admin/ControlCenterDashboard";
import { MenuAlertsPanel } from "@/components/admin/MenuAlertsPanel";
import { MenuEditPanel } from "@/components/admin/MenuEditPanel";
import { MenuPreviewPanel } from "@/components/admin/MenuPreviewPanel";
import { ControlCenterToolbar } from "@/components/admin/ControlCenterToolbar";
import { formatCurrency } from "@/lib/menu";
import { agorotToShekels, percentToBps, shekelsToAgorot } from "@/lib/money";
import type {
  BusinessLunchSettings,
  PromotionSettings,
  RecommendationRuleSettings,
  RestaurantOrderMode
} from "@/lib/menu-settings";
import {
  MenuBadge,
  MenuCategory,
  MenuItem,
  MenuVolumeOption
} from "@/lib/types";
import type {
  EditableBusinessLunch,
  EditableRecommendationRule,
  EditablePromotion
} from "@/components/admin/MenuPromotionTypes";

const categoryLabels: Record<MenuCategory, string> = {
  starters: "🥗 Starters",
  mains: "🍲 Main courses",
  drinks: "🍹 Drinks",
  fluids: "🍹 Fluids",
  draft: "🍺 Draft",
  bottled: "🍾 Bottled",
  fuel: "⛽ Fuel",
  whiskey: "🥃 Whiskey",
  vodka: "🍸 Vodka",
  rum: "🥃 Rum",
  cognac: "🥃 Cognac",
  gin: "🍸 GIN",
  tequila: "🍸 Tequila",
  absent: "🍸 Absent",
  ouzo: "🍸 Ouzo",
  likers: "🍷 Likers",
  alcohol: "🍷 Alcohol",
  cocktails: "🍸 Cocktails",
  two_component_mixture: "🧪 2 component mixture",
  dot4: "🛢 DOT 4",
  non_alcoholic_drinks: "🥤 Non-alcoholic drinks",
  desserts: "🍰 Desserts"
};

const drinkCategories: MenuCategory[] = [
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
  "non_alcoholic_drinks"
];

const badgeOptions: Array<{ value: MenuBadge; label: string }> = [
  { value: "chef_special", label: "🔥 Chef's special" },
  { value: "most_popular", label: "⭐ Most popular" },
  { value: "vegan", label: "🌱 Vegan" },
  { value: "spicy", label: "🌶️ Spicy" },
  { value: "kids_favorite", label: "🧸 Kids favorite" },
  { value: "new", label: "🆕 New" },
  { value: "kosher", label: "Ⓚ Kosher" },
  { value: "meat", label: "🥩 Meat" },
  { value: "dairy", label: "🧀 Dairy" },
  { value: "gluten_free", label: "🌾 Gluten free" },
  { value: "dairy_free", label: "🥛 Dairy free" },
  { value: "nut_free", label: "🥜 Nut free" }
];
const drinkBadgeOptions = badgeOptions.filter(
  (badge) => badge.value === "most_popular" || badge.value === "new"
);
const dishCategories = (Object.keys(categoryLabels) as MenuCategory[]).filter(
  (category) => category !== "drinks" && !drinkCategories.includes(category)
);
const allDrinkCategories = [...drinkCategories];
const MAX_RECOMMENDATIONS_PER_TRIGGER_ITEM = 3;
const DASHBOARD_ACTIVE_POLL_MS = 12_000;
const DASHBOARD_HIDDEN_POLL_MS = 30_000;
const DASHBOARD_REQUEST_TIMEOUT_MS = 8_000;

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDiscountPercentInput(value: string) {
  const parsed = Number.parseFloat(value || "0");

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  const normalizedBps = percentToBps(parsed);
  return normalizedBps / 100;
}

type InsightStats = {
  revenue: string;
  avgCheck: string;
  orders: string;
  activeOrders: string;
  topDish: string;
  lowDish: string;
  peakHour: string;
  waiterCalls: string;
  globalInsight: string;
  globalInsightStatus: "better" | "same" | "worse";
  vsYesterday: {
    revenue: string | null;
    avgCheck: string | null;
    orders: string | null;
    activeOrders: string | null;
    waiterCalls: string | null;
  };
};

type DashboardCharts = {
  labels: string[];
  ordersByHour: number[];
  revenueTrend: number[];
};

type DashboardMeta = {
  orderMode: "tables" | "counter";
  ordersLabel: string;
  activeOrdersLabel: string;
};

type WorkingHoursRule = {
  id: string;
  days: number[];
  from: string | null;
  until: string | null;
};

type RecommendationItem = {
  id: string;
  title: string;
  summary: string;
  action: string;
  focusItems: string[];
  focusItemIds: string[];
  quickActionLabel: string;
  targetKind: "dishes" | "drinks" | null;
  targetCategories?: MenuCategory[];
};

type RecommendationSmartSuggestion = {
  id: string;
  label: string;
  suggestedType: "item" | "category";
  suggestedItemId: string;
  suggestedCategory: MenuCategory | "";
};

type EditableMenuItem = MenuItem & {
  draftNameHe: string;
  draftNameEn: string;
  draftNameRu: string;
  draftDescriptionHe: string;
  draftDescriptionEn: string;
  draftDescriptionRu: string;
  draftCategory: MenuCategory;
  draftPrice: string;
  draftVolumeOptionsText: string;
  draftImage: string;
  draftShowImage: boolean;
  draftBadges: MenuBadge[];
  saving?: boolean;
};

type NewMenuItemDraft = {
  nameHe: string;
  nameEn: string;
  nameRu: string;
  descriptionHe: string;
  descriptionEn: string;
  descriptionRu: string;
  price: string;
  volumeOptionsText: string;
  image: string;
  showImage: boolean;
  badges: MenuBadge[];
  category: MenuCategory;
  available: boolean;
  saving: boolean;
};

function formatTimeInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatShiftTimeLabel(value: string | null | undefined) {
  if (!value || !value.trim()) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function createEditablePromotion(): EditablePromotion {
  return {
    id: `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    text: "",
    categories: [],
    days: [],
    discountPercent: "0",
    startsFrom: "",
    until: ""
  };
}

function createEditableBusinessLunch(): EditableBusinessLunch {
  return {
    id: `business-lunch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    text: "",
    categories: [],
    days: [],
    startsFrom: "",
    until: ""
  };
}

function createEditableRecommendationRule(): EditableRecommendationRule {
  return {
    id: `recommendation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    triggerItemId: "",
    suggestedType: "item",
    suggestedItemId: "",
    suggestedCategory: ""
  };
}

function getBusinessLunchValidationMessage(
  businessLunch: EditableBusinessLunch
) {
  if (!businessLunch.startsFrom || !businessLunch.until) {
    return "Select business lunch start and end time first.";
  }

  if (!businessLunch.categories.length) {
    return "Select at least one category for business lunch.";
  }

  if (!businessLunch.days.length) {
    return "Select at least one day for business lunch.";
  }

  return null;
}

function getPromotionValidationMessage(promotion: EditablePromotion) {
  const parsedDiscountPercent = normalizeDiscountPercentInput(
    promotion.discountPercent
  );

  if (
    !Number.isFinite(parsedDiscountPercent) ||
    parsedDiscountPercent < 0 ||
    parsedDiscountPercent > 100
  ) {
    return "Discount must be between 0 and 100.";
  }

  if (!promotion.startsFrom || !promotion.until) {
    return "Select promo start and end time first.";
  }

  if (!promotion.categories.length) {
    return "Select at least one category for the promo.";
  }

  if (!promotion.days.length) {
    return "Select at least one day for the promo.";
  }

  return null;
}

function toEditablePromotion(promotion: PromotionSettings): EditablePromotion {
  return {
    id: promotion.id,
    enabled: promotion.enabled,
    text: promotion.text,
    categories: promotion.categories,
    days: promotion.days,
    discountPercent: String(promotion.discountPercent),
    startsFrom: formatTimeInputValue(promotion.startsFrom),
    until: formatTimeInputValue(promotion.until)
  };
}

function toEditableBusinessLunch(
  businessLunch: BusinessLunchSettings
): EditableBusinessLunch {
  return {
    id: businessLunch.id,
    enabled: businessLunch.enabled,
    text: businessLunch.text,
    categories: businessLunch.categories,
    days: businessLunch.days,
    startsFrom: formatTimeInputValue(businessLunch.startsFrom),
    until: formatTimeInputValue(businessLunch.until)
  };
}

function toEditableRecommendationRule(
  recommendation: RecommendationRuleSettings
): EditableRecommendationRule {
  return {
    id: recommendation.id,
    enabled: recommendation.enabled,
    triggerItemId: recommendation.triggerItemId,
    suggestedType: recommendation.suggestedType,
    suggestedItemId: recommendation.suggestedItemId,
    suggestedCategory: recommendation.suggestedCategory ?? ""
  };
}

function toEditableItem(item: MenuItem): EditableMenuItem {
  return {
    ...item,
    draftNameHe: item.nameHe || item.name,
    draftNameEn: item.nameEn || item.nameHe || item.name,
    draftNameRu: item.nameRu || item.nameEn || item.nameHe || item.name,
    draftDescriptionHe: item.descriptionHe || item.description,
    draftDescriptionEn: item.descriptionEn || item.descriptionHe || item.description,
    draftDescriptionRu:
      item.descriptionRu || item.descriptionEn || item.descriptionHe || item.description,
    draftCategory: item.category,
    draftPrice: String(item.price),
    draftVolumeOptionsText: (item.volumeOptions ?? [])
      .map((option) => `${option.label} | ${option.price}`)
      .join("\n"),
    draftImage: item.image,
    draftShowImage: item.showImage ?? true,
    draftBadges: item.badges ?? []
  };
}

function formatVolumeOptionsText(volumeOptions: MenuVolumeOption[] | undefined) {
  return (volumeOptions ?? [])
    .map((option) => `${option.label} | ${option.price}`)
    .join("\n");
}

function areBadgesEqual(left: MenuBadge[] | undefined, right: MenuBadge[] | undefined) {
  const leftList = left ?? [];
  const rightList = right ?? [];

  return (
    leftList.length === rightList.length &&
    leftList.every((value, index) => value === rightList[index])
  );
}

function hasUnsavedItemDraft(item: EditableMenuItem) {
  const baseNameHe = item.nameHe || item.name;
  const baseNameEn = item.nameEn || item.nameHe || item.name;
  const baseNameRu = item.nameRu || item.nameEn || item.nameHe || item.name;
  const baseDescriptionHe = item.descriptionHe || item.description;
  const baseDescriptionEn = item.descriptionEn || item.descriptionHe || item.description;
  const baseDescriptionRu =
    item.descriptionRu || item.descriptionEn || item.descriptionHe || item.description;
  const baseShowImage = item.showImage ?? true;
  const baseVolumeOptionsText = formatVolumeOptionsText(item.volumeOptions);

  return (
    item.draftNameHe !== baseNameHe ||
    item.draftNameEn !== baseNameEn ||
    item.draftNameRu !== baseNameRu ||
    item.draftDescriptionHe !== baseDescriptionHe ||
    item.draftDescriptionEn !== baseDescriptionEn ||
    item.draftDescriptionRu !== baseDescriptionRu ||
    item.draftCategory !== item.category ||
    item.draftPrice !== String(item.price) ||
    item.draftVolumeOptionsText !== baseVolumeOptionsText ||
    item.draftImage !== item.image ||
    item.draftShowImage !== baseShowImage ||
    !areBadgesEqual(item.draftBadges, item.badges)
  );
}

function mergeMenuItemsWithLocalDrafts(
  localItems: EditableMenuItem[],
  remoteItems: MenuItem[]
) {
  const localById = new Map(localItems.map((item) => [item.id, item]));
  const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
  const merged: EditableMenuItem[] = [];

  for (const localItem of localItems) {
    const remoteItem = remoteById.get(localItem.id);

    if (!remoteItem) {
      continue;
    }

    const shouldKeepLocalDraft =
      Boolean(localItem.saving) ||
      hasUnsavedItemDraft(localItem) ||
      localItem.available !== remoteItem.available;

    if (shouldKeepLocalDraft) {
      merged.push(localItem);
      continue;
    }

    merged.push(toEditableItem(remoteItem));
  }

  for (const remoteItem of remoteItems) {
    if (!localById.has(remoteItem.id)) {
      merged.push(toEditableItem(remoteItem));
    }
  }

  return merged;
}

function getPreferredDraftName(input: {
  nameHe?: string;
  nameEn?: string;
  nameRu?: string;
}) {
  return input.nameHe?.trim() || input.nameEn?.trim() || input.nameRu?.trim() || "";
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read the image."));
    };

    reader.onerror = () => reject(new Error("Failed to read the image."));
    reader.readAsDataURL(file);
  });
}

function getCategoryOptions(kind: "dishes" | "drinks") {
  return kind === "drinks" ? allDrinkCategories : dishCategories;
}

function getItemKind(category: MenuCategory): "dishes" | "drinks" {
  return drinkCategories.includes(category) ? "drinks" : "dishes";
}

function getBadgeOptionsForKind(kind: "dishes" | "drinks") {
  return kind === "drinks" ? drinkBadgeOptions : badgeOptions;
}

function sanitizePriceInput(value: string) {
  const normalized = value.replace(",", ".");
  let dotSeen = false;
  let result = "";

  for (const character of normalized) {
    if (character >= "0" && character <= "9") {
      result += character;
      continue;
    }

    if (character === "." && !dotSeen) {
      result += ".";
      dotSeen = true;
    }
  }

  return result;
}

function parsePriceInput(value: string) {
  const parsed = Number(sanitizePriceInput(value));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return NaN;
  }

  return agorotToShekels(shekelsToAgorot(parsed));
}

function parseVolumeOptions(value: string): MenuVolumeOption[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [rawLabel, rawPrice] = line.split("|").map((part) => part.trim());
      if (!rawPrice) {
        return null;
      }

      const price = parsePriceInput(rawPrice);

      if (!Number.isFinite(price) || price <= 0) {
        return null;
      }

      return {
        id: `volume_${index}_${(rawLabel || "empty").replace(/\s+/g, "_")}_${Math.max(
          0,
          shekelsToAgorot(price)
        )}`,
        label: rawLabel,
        price: Math.max(0, price)
      };
    })
    .filter(Boolean) as MenuVolumeOption[];
}

function parseVolumeRows(value: string) {
  return value
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [label = "", price = ""] = line.split("|").map((part) => part.trim());
      return { label, price };
    });
}

function getEditorItemDisplayName(item: EditableMenuItem) {
  return (
    item.draftNameEn?.trim() ||
    item.draftNameHe?.trim() ||
    item.nameEn?.trim() ||
    item.nameHe?.trim() ||
    item.name?.trim() ||
    "Untitled item"
  );
}

function stringifyVolumeRows(rows: Array<{ label: string; price: string }>) {
  return rows
    .filter((row) => row.label.trim() || row.price.trim())
    .map((row) => `${row.label.trim()} | ${row.price.trim()}`)
    .join("\n");
}

function addVolumeRow(value: string) {
  const rows = parseVolumeRows(value);
  rows.push({ label: "", price: "" });
  return rows.map((row) => `${row.label} | ${row.price}`).join("\n");
}

function removeVolumeRow(value: string) {
  const rows = parseVolumeRows(value);

  if (rows.length <= 1) {
    return "";
  }

  rows.pop();
  return rows.map((row) => `${row.label} | ${row.price}`).join("\n");
}

function updateVolumeRow(
  value: string,
  rowIndex: number,
  field: "label" | "price",
  nextValue: string
) {
  const rows = parseVolumeRows(value);

  while (rows.length <= rowIndex) {
    rows.push({ label: "", price: "" });
  }

  rows[rowIndex] = {
    ...rows[rowIndex],
    [field]: field === "price" ? sanitizePriceInput(nextValue) : nextValue
  };

  return stringifyVolumeRows(rows);
}

function getBasePriceForKind(
  kind: "dishes" | "drinks",
  priceText: string,
  volumeOptionsText: string
) {
  if (kind === "drinks") {
    const firstVolumePrice = parseVolumeOptions(volumeOptionsText)[0]?.price;
    return Number.isFinite(firstVolumePrice) ? firstVolumePrice : NaN;
  }

  return parsePriceInput(priceText);
}

function hasInvalidDrinkVolumeRows(value: string) {
  const rows = parseVolumeRows(value);

  if (rows.length === 0) {
    return true;
  }

  const hasInvalidPrice = rows.some((row) => {
    const rawPrice = row.price.trim();

    if (!rawPrice) {
      return true;
    }

    const parsedPrice = parsePriceInput(rawPrice);
    return !Number.isFinite(parsedPrice) || parsedPrice <= 0;
  });

  if (hasInvalidPrice) {
    return true;
  }

  if (rows.length > 1) {
    return rows.some((row) => !row.label.trim());
  }

  return false;
}

export function MenuEditor() {
  const pathname = usePathname() ?? "";
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authOpen, setAuthOpen] = useState(true);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [secondaryCredentials, setSecondaryCredentials] = useState<{
    login: string;
    password: string;
  } | null>(null);
  const [items, setItems] = useState<EditableMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [kitchenLoadWarningEnabled, setKitchenLoadWarningEnabled] = useState(false);
  const [kitchenLoadWarningSaving, setKitchenLoadWarningSaving] = useState(false);
  const [businessLunches, setBusinessLunches] = useState<EditableBusinessLunch[]>([]);
  const [businessLunchSaving, setBusinessLunchSaving] = useState(false);
  const [businessLunchModalOpen, setBusinessLunchModalOpen] = useState(false);
  const [businessLunchDraft, setBusinessLunchDraft] =
    useState<EditableBusinessLunch | null>(null);
  const [businessLunchMessage, setBusinessLunchMessage] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<EditablePromotion[]>([]);
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [recommendationRules, setRecommendationRules] = useState<
    EditableRecommendationRule[]
  >([]);
  const [recommendationRulesSaving, setRecommendationRulesSaving] = useState(false);
  const [recommendationRulesMessage, setRecommendationRulesMessage] = useState<string | null>(
    null
  );
  const [kitchenOpenEnabled, setKitchenOpenEnabled] = useState(false);
  const [kitchenOpenUntil, setKitchenOpenUntil] = useState("");
  const [kitchenOpenSaving, setKitchenOpenSaving] = useState(false);
  const [barOpenEnabled, setBarOpenEnabled] = useState(false);
  const [barOpenUntil, setBarOpenUntil] = useState("");
  const [barOpenSaving, setBarOpenSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [insightStats, setInsightStats] = useState<InsightStats>({
    revenue: "0",
    avgCheck: "0",
    orders: "0",
    activeOrders: "0",
    topDish: "—",
    lowDish: "—",
    peakHour: "—",
    waiterCalls: "0",
    globalInsight: "",
    globalInsightStatus: "same",
    vsYesterday: {
      revenue: null,
      avgCheck: null,
      orders: null,
      activeOrders: null,
      waiterCalls: null
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      const response = await fetch("/api/admin-auth?scope=secondary", {
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { authorized?: boolean };

      if (!cancelled && data.authorized) {
        setIsAuthorized(true);
      }
    }

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, []);
  const [dashboardCharts, setDashboardCharts] = useState<DashboardCharts>({
    labels: [],
    ordersByHour: [],
    revenueTrend: []
  });
  const [dashboardMeta, setDashboardMeta] = useState<DashboardMeta>({
    orderMode: "tables",
    ordersLabel: "Active + closed tables",
    activeOrdersLabel: "Open tables right now"
  });
  const [workingHoursFrom, setWorkingHoursFrom] = useState<string | null>(null);
  const [workingHoursUntil, setWorkingHoursUntil] = useState<string | null>(null);
  const [workingHoursRules, setWorkingHoursRules] = useState<WorkingHoursRule[]>([]);
  const [restaurantOrderMode, setRestaurantOrderMode] =
    useState<RestaurantOrderMode>("tables");
  const [selectedKind, setSelectedKind] = useState<"dishes" | "drinks">("dishes");
  const [selectedCategories, setSelectedCategories] = useState<MenuCategory[]>([]);
  const [recommendationFocusItemIds, setRecommendationFocusItemIds] = useState<string[] | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [settingsRecommendationsOpen, setSettingsRecommendationsOpen] = useState(false);
  const [newItemLanguage, setNewItemLanguage] = useState<"he" | "en" | "ru">("he");
  const [newDescriptionExpanded, setNewDescriptionExpanded] = useState(false);
  const [waiterRedirecting, setWaiterRedirecting] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(true);
  const [menuButtonsOpen, setMenuButtonsOpen] = useState(false);
  const [settingsButtonsOpen, setSettingsButtonsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [promotionModalOpen, setPromotionModalOpen] = useState(false);
  const [promotionDraft, setPromotionDraft] =
    useState<EditablePromotion | null>(null);
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);
  const [itemLanguages, setItemLanguages] = useState<Record<string, "he" | "en" | "ru">>(
    {}
  );
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>(
    {}
  );
  const [newItem, setNewItem] = useState<NewMenuItemDraft>({
    nameHe: "",
    nameEn: "",
    nameRu: "",
    descriptionHe: "",
    descriptionEn: "",
    descriptionRu: "",
    price: "",
    volumeOptionsText: "",
    image: "",
    showImage: true,
    badges: [],
    category: "starters",
    available: true,
    saving: false
  });
  const preferredNewItemCategory = useMemo<MenuCategory>(() => {
    const filteredCategory = selectedCategories.find((category) =>
      selectedKind === "drinks"
        ? drinkCategories.includes(category)
        : !drinkCategories.includes(category)
    );

    if (filteredCategory) {
      return filteredCategory;
    }

    return selectedKind === "drinks" ? drinkCategories[0] : dishCategories[0];
  }, [selectedCategories, selectedKind]);
  const pathSegments = useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname]
  );
  const restaurantSlug = useMemo(
    () =>
      pathSegments.length >= 2 && pathSegments[1] === "admin"
        ? pathSegments[0]
        : "olive-bistro",
    [pathSegments]
  );
  const menuPreviewHref = useMemo(() => `/${restaurantSlug}/menu/0`, [restaurantSlug]);
  const recommendationItemOptions = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        label: getEditorItemDisplayName(item)
      })),
    [items]
  );
  const recommendationSmartSuggestions = useMemo<
    Record<string, RecommendationSmartSuggestion[]>
  >(() => {
    const availableItems = items.filter((item) => item.available);
    const pickBestItemForCategory = (category: MenuCategory) =>
      availableItems
        .filter((item) => item.draftCategory === category)
        .sort((left, right) => {
          const leftScore =
            Number(left.draftBadges.includes("most_popular")) * 4 +
            Number(left.draftBadges.includes("new")) * 2 +
            Number(Boolean(left.draftImage && left.draftShowImage));
          const rightScore =
            Number(right.draftBadges.includes("most_popular")) * 4 +
            Number(right.draftBadges.includes("new")) * 2 +
            Number(Boolean(right.draftImage && right.draftShowImage));

          return rightScore - leftScore;
        })[0] ?? null;

    return Object.fromEntries(
      recommendationRules.map((rule) => {
        const triggerItem = items.find((item) => item.id === rule.triggerItemId);
        const triggerIsDrink = triggerItem
          ? drinkCategories.includes(triggerItem.draftCategory)
          : false;
        const candidateCategories = triggerItem
          ? triggerItem.draftCategory === "desserts"
            ? (["non_alcoholic_drinks", "drinks"] as MenuCategory[])
            : triggerIsDrink
              ? (["starters", "mains", "desserts"] as MenuCategory[])
              : (["desserts", "non_alcoholic_drinks", "drinks"] as MenuCategory[])
          : (["desserts", "non_alcoholic_drinks", "starters", "mains"] as MenuCategory[]);

        const nextSuggestions: RecommendationSmartSuggestion[] = [];

        for (const category of candidateCategories) {
          const hasCategoryItems = availableItems.some(
            (item) => item.draftCategory === category
          );

          if (!hasCategoryItems) {
            continue;
          }

          nextSuggestions.push({
            id: `${rule.id}-category-${category}`,
            label: `Suggest ${categoryLabels[category]}`,
            suggestedType: "category",
            suggestedItemId: "",
            suggestedCategory: category
          });

          const bestItem = pickBestItemForCategory(category);

          if (bestItem) {
            nextSuggestions.push({
              id: `${rule.id}-item-${bestItem.id}`,
              label: `Suggest ${getEditorItemDisplayName(bestItem)}`,
              suggestedType: "item",
              suggestedItemId: bestItem.id,
              suggestedCategory: ""
            });
          }
        }

        const dedupedSuggestions = nextSuggestions.filter(
          (suggestion, index, current) =>
            current.findIndex((item) => item.label === suggestion.label) === index
        );

        return [rule.id, dedupedSuggestions.slice(0, 6)];
      })
    );
  }, [items, recommendationRules]);
  const recommendations = useMemo<RecommendationItem[]>(() => {
    const normalizeAdviceName = (value: string) =>
      value
        .toLocaleLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .trim();
    const availableItems = items.filter((item) => item.available);
    const unavailableDishes = items
      .filter(
        (item) =>
          !item.available && !drinkCategories.includes(item.draftCategory)
      )
      .slice(0, 3);
    const unavailableDrinks = items
      .filter(
        (item) =>
          !item.available && drinkCategories.includes(item.draftCategory)
      )
      .slice(0, 3);
    const availableDishes = availableItems.filter(
      (item) => !drinkCategories.includes(item.draftCategory)
    );
    const availableDrinks = availableItems.filter((item) =>
      drinkCategories.includes(item.draftCategory)
    );
    const dishesWithoutDescription = availableDishes
      .filter(
        (item) =>
          !item.draftDescriptionHe.trim() && !item.draftDescriptionEn.trim()
      )
      .slice(0, 3);
    const drinksWithoutDescription = availableDrinks
      .filter(
        (item) =>
          !item.draftDescriptionHe.trim() && !item.draftDescriptionEn.trim()
      )
      .slice(0, 3);
    const availableDesserts = availableItems.filter(
      (item) => item.draftCategory === "desserts"
    );
    const itemsWithoutImage = availableItems.filter(
      (item) => !item.draftImage.trim() || !item.draftShowImage
    );
    const imageDishes = itemsWithoutImage
      .filter((item) => !drinkCategories.includes(item.draftCategory))
      .slice(0, 3);
    const imageDrinks = itemsWithoutImage
      .filter((item) => drinkCategories.includes(item.draftCategory))
      .slice(0, 3);
    const itemsWithoutBadges = availableItems.filter(
      (item) => (item.draftBadges ?? []).length === 0
    );
    const badgeDishes = itemsWithoutBadges
      .filter((item) => !drinkCategories.includes(item.draftCategory))
      .slice(0, 3);
    const badgeDrinks = itemsWithoutBadges
      .filter((item) => drinkCategories.includes(item.draftCategory))
      .slice(0, 3);
    const hiddenImageDishes = availableDishes
      .filter((item) => item.draftImage.trim() && !item.draftShowImage)
      .slice(0, 3);
    const hiddenImageDrinks = availableDrinks
      .filter((item) => item.draftImage.trim() && !item.draftShowImage)
      .slice(0, 3);
    const drinksWithoutVolumeOptions = availableDrinks
      .filter((item) => !item.draftVolumeOptionsText.trim())
      .slice(0, 3);
    const drinksWithoutHighlight = availableDrinks
      .filter(
        (item) =>
          !(item.draftBadges ?? []).includes("most_popular") &&
          !(item.draftBadges ?? []).includes("new")
      )
      .slice(0, 3);
    const topDishNames = insightStats.topDish
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const topDishesMissingBadge = availableDishes
      .filter((item) => {
        const normalizedName = normalizeAdviceName(getEditorItemDisplayName(item));
        return (
          topDishNames.some(
            (topDishName) => normalizeAdviceName(topDishName) === normalizedName
          ) && !(item.draftBadges ?? []).includes("most_popular")
        );
      })
      .slice(0, 3);
    const startersAvailable = availableDishes.some(
      (item) => item.draftCategory === "starters"
    );
    const mainsAvailable = availableDishes.some(
      (item) => item.draftCategory === "mains"
    );
    const hasEnabledBusinessLunch = businessLunches.some(
      (businessLunch) => businessLunch.enabled
    );
    const hasActivePromo = promotions.some((promotion) => promotion.enabled);
    const peakHourAvailable =
      insightStats.peakHour !== "—" && insightStats.peakHour.trim().length > 0;
    const nextRecommendations: RecommendationItem[] = [];

    if (insightStats.lowDish !== "—") {
      nextRecommendations.push({
        id: "slow-movers",
        title: "Lift slow movers",
        summary: `Low-performing dishes right now: ${insightStats.lowDish}. They likely need stronger placement or a clearer reason to choose them.`,
        action:
          "Add a promo, improve the image, or place one of these items near the top of its category before slower hours.",
        focusItems: insightStats.lowDish.split(",").map((item) => item.trim()).filter(Boolean),
        focusItemIds: [],
        quickActionLabel: "Open dishes",
        targetKind: "dishes"
      });
    }

    if (imageDishes.length > 0) {
      nextRecommendations.push({
        id: "images-dishes",
        title: "Add images to improve dish conversion",
        summary:
          "Some live dishes still have no visible image. Those usually underperform on the customer menu compared with photo-backed cards.",
        action:
          "Upload photos for these dishes first, especially if they are high-margin or often ordered together with drinks.",
        focusItems: imageDishes.map(getEditorItemDisplayName),
        focusItemIds: imageDishes.map((item) => item.id),
        quickActionLabel: "Open dishes",
        targetKind: "dishes"
      });
    }

    if (imageDrinks.length > 0) {
      nextRecommendations.push({
        id: "images-drinks",
        title: "Add images to improve drink conversion",
        summary:
          "Some live drinks still have no visible image. Those usually underperform on the customer menu compared with photo-backed cards.",
        action:
          "Upload photos for these drinks first, especially the ones used in upsell or recommendation flows.",
        focusItems: imageDrinks.map(getEditorItemDisplayName),
        focusItemIds: imageDrinks.map((item) => item.id),
        quickActionLabel: "Open drinks",
        targetKind: "drinks"
      });
    }

    if (hiddenImageDishes.length > 0) {
      nextRecommendations.push({
        id: "show-images-dishes",
        title: "Turn dish photos back on",
        summary:
          "Some dishes already have uploaded images, but image display is switched off. That removes visual proof without any extra benefit.",
        action:
          "Re-enable photos for the strongest dish cards first so guests can scan the menu faster.",
        focusItems: hiddenImageDishes.map(getEditorItemDisplayName),
        focusItemIds: hiddenImageDishes.map((item) => item.id),
        quickActionLabel: "Open dishes",
        targetKind: "dishes"
      });
    }

    if (hiddenImageDrinks.length > 0) {
      nextRecommendations.push({
        id: "show-images-drinks",
        title: "Turn drink photos back on",
        summary:
          "Some drinks already have uploaded images, but image display is switched off. That weakens visual upsell on the customer menu.",
        action:
          "Re-enable photos for signature drinks and cocktails first so they stand out in the drinks flow.",
        focusItems: hiddenImageDrinks.map(getEditorItemDisplayName),
        focusItemIds: hiddenImageDrinks.map((item) => item.id),
        quickActionLabel: "Open drinks",
        targetKind: "drinks"
      });
    }

    if (badgeDishes.length > 0) {
      nextRecommendations.push({
        id: "badges-dishes",
        title: "Use dish badges more deliberately",
        summary:
          "Several live dishes are missing badges like Most popular, New, Vegan, or Spicy, so they lose quick visual context in the menu.",
        action:
          "Tag the strongest candidates with one clear badge each. Start with items that are easier to sell through social proof or dietary filters.",
        focusItems: badgeDishes.map(getEditorItemDisplayName),
        focusItemIds: badgeDishes.map((item) => item.id),
        quickActionLabel: "Open dishes",
        targetKind: "dishes"
      });
    }

    if (badgeDrinks.length > 0) {
      nextRecommendations.push({
        id: "badges-drinks",
        title: "Use drink badges more deliberately",
        summary:
          "Several live drinks are missing badges like Most popular or New, so they lose quick visual context in the menu.",
        action:
          "Badge the drinks you want to push most, especially cocktails, signature serves, and items with strong margins.",
        focusItems: badgeDrinks.map(getEditorItemDisplayName),
        focusItemIds: badgeDrinks.map((item) => item.id),
        quickActionLabel: "Open drinks",
        targetKind: "drinks"
      });
    }

    if (drinksWithoutVolumeOptions.length > 0) {
      nextRecommendations.push({
        id: "drink-volume-options",
        title: "Add drink size or pour options",
        summary:
          "Some live drinks have no volume options yet. That makes the bar menu feel flatter and leaves upsell room on the table.",
        action:
          "Add at least one labeled pour or serving option first for the strongest drinks you want to push.",
        focusItems: drinksWithoutVolumeOptions.map(getEditorItemDisplayName),
        focusItemIds: drinksWithoutVolumeOptions.map((item) => item.id),
        quickActionLabel: "Open drinks",
        targetKind: "drinks"
      });
    }

    if (dishesWithoutDescription.length > 0) {
      nextRecommendations.push({
        id: "descriptions-dishes",
        title: "Add short dish descriptions",
        summary:
          "Some live dishes still have no description at all. Even one short line helps guests decide faster and reduces hesitation.",
        action:
          "Start with a one-sentence benefit for each dish: key ingredient, texture, or serving style.",
        focusItems: dishesWithoutDescription.map(getEditorItemDisplayName),
        focusItemIds: dishesWithoutDescription.map((item) => item.id),
        quickActionLabel: "Open dishes",
        targetKind: "dishes"
      });
    }

    if (drinksWithoutDescription.length > 0) {
      nextRecommendations.push({
        id: "descriptions-drinks",
        title: "Add short drink descriptions",
        summary:
          "Some live drinks still have no description at all. A quick note on taste or mix can make the bar menu feel much clearer.",
        action:
          "Add a short cue for each drink, for example spirit base, sweetness, or freshness.",
        focusItems: drinksWithoutDescription.map(getEditorItemDisplayName),
        focusItemIds: drinksWithoutDescription.map((item) => item.id),
        quickActionLabel: "Open drinks",
        targetKind: "drinks"
      });
    }

    if (availableDishes.length > 0 && availableDrinks.length > 0 && drinksWithoutHighlight.length > 0) {
      nextRecommendations.push({
        id: "drink-attach",
        title: "Increase drink attach rate",
        summary:
          "You have a healthy food menu and live drinks, but some drink items are not highlighted at all. That makes beverage upsell harder at checkout.",
        action:
          "Mark 2-3 drinks as Most popular or New, then surface them whenever a guest has dishes in the cart but no drinks yet.",
        focusItems: drinksWithoutHighlight.map(getEditorItemDisplayName),
        focusItemIds: drinksWithoutHighlight.map((item) => item.id),
        quickActionLabel: "Open drinks",
        targetKind: "drinks"
      });
    }

    if (topDishesMissingBadge.length > 0) {
      nextRecommendations.push({
        id: "bestseller-badges",
        title: "Mark best sellers as Most popular",
        summary:
          "Some items already performing as top dishes are not labeled as Most popular yet, so you are missing easy social proof.",
        action:
          "Add the Most popular badge to these winners first so guests spot them immediately.",
        focusItems: topDishesMissingBadge.map(getEditorItemDisplayName),
        focusItemIds: topDishesMissingBadge.map((item) => item.id),
        quickActionLabel: "Open dishes",
        targetKind: "dishes"
      });
    }

    if (availableDesserts.length <= 1) {
      nextRecommendations.push({
        id: "desserts",
        title: "Strengthen dessert upsell",
        summary:
          "Dessert coverage is thin right now, which makes the last-step upsell weaker than it could be.",
        action:
          "Add one more easy dessert or promote the current dessert earlier in the flow, especially after mains are added.",
        focusItems: availableDesserts.map(getEditorItemDisplayName),
        focusItemIds: availableDesserts.map((item) => item.id),
        quickActionLabel: "Open desserts",
        targetKind: "dishes",
        targetCategories: ["desserts"]
      });
    }

    if (
      startersAvailable &&
      mainsAvailable &&
      !hasEnabledBusinessLunch
    ) {
      nextRecommendations.push({
        id: "business-lunch",
        title: "Create a business lunch set",
        summary:
          "You already have the core categories for a lunch offer, but there is no enabled business lunch right now.",
        action:
          "Bundle one starter and one main into a weekday lunch offer to create a faster decision path during daytime traffic.",
        focusItems: [],
        focusItemIds: [],
        quickActionLabel: "Create lunch",
        targetKind: null
      });
    }

    if (!startersAvailable || !mainsAvailable) {
      const missingCategories = [
        !startersAvailable ? "starters" : null,
        !mainsAvailable ? "mains" : null
      ].filter(Boolean) as MenuCategory[];
      const missingCategoryLabels = missingCategories.map(
        (category) => categoryLabels[category]
      );

      nextRecommendations.push({
        id: "dish-coverage",
        title: "Balance dish category coverage",
        summary: `Some core dish categories are empty right now: ${missingCategoryLabels.join(", ")}.`,
        action:
          "Add at least one strong option in each core category so the customer menu feels complete and easier to browse.",
        focusItems: [],
        focusItemIds: [],
        quickActionLabel: "Open dishes",
        targetKind: "dishes",
        targetCategories: missingCategories
      });
    }

    if (unavailableDishes.length > 0) {
      nextRecommendations.push({
        id: "unavailable-dishes",
        title: "Review unavailable dishes",
        summary:
          "Some dish cards are currently unavailable. If that stays for long, guests will see a thinner menu than intended.",
        action:
          "Bring back the strongest dishes when possible, or replace them so the core food offer stays complete.",
        focusItems: unavailableDishes.map(getEditorItemDisplayName),
        focusItemIds: unavailableDishes.map((item) => item.id),
        quickActionLabel: "Open dishes",
        targetKind: "dishes"
      });
    }

    if (unavailableDrinks.length > 0) {
      nextRecommendations.push({
        id: "unavailable-drinks",
        title: "Review unavailable drinks",
        summary:
          "Some drink cards are currently unavailable. That can weaken drink attach rate and make the bar section feel patchy.",
        action:
          "Restore the most requested drinks first, or swap them for available alternatives with similar role in the menu.",
        focusItems: unavailableDrinks.map(getEditorItemDisplayName),
        focusItemIds: unavailableDrinks.map((item) => item.id),
        quickActionLabel: "Open drinks",
        targetKind: "drinks"
      });
    }

    if (!hasActivePromo && peakHourAvailable) {
      nextRecommendations.push({
        id: "timed-promo",
        title: "Schedule a timed recommendation window",
        summary: `Peak traffic is around ${insightStats.peakHour}, but there is no enabled promo or recommendation window helping guests choose faster.`,
        action:
          "Create a lightweight timed recommendation set for 30-60 minutes before peak hour: one drink, one main, one dessert.",
        focusItems: [],
        focusItemIds: [],
        quickActionLabel: "Create promo",
        targetKind: null
      });
    }

    if (insightStats.topDish !== "—") {
      nextRecommendations.push({
        id: "social-proof",
        title: "Turn best sellers into anchors",
        summary: `Top dishes right now: ${insightStats.topDish}. These items should anchor categories and pull attention to nearby upsells.`,
        action:
          "Keep them near the top, give them strong photos and badges, and pair each with one drink or dessert recommendation.",
        focusItems: insightStats.topDish.split(",").map((item) => item.trim()).filter(Boolean),
        focusItemIds: [],
        quickActionLabel: "Open dishes",
        targetKind: "dishes"
      });
    }

    if (!nextRecommendations.length) {
      nextRecommendations.push({
        id: "baseline",
        title: "Build a simple recommendation engine first",
        summary:
          "You already have enough data to start without machine learning: menu metadata, badges, categories, availability, and shift analytics.",
        action:
          "Begin with three rules: recommend drinks if the cart has dishes only, recommend dessert before checkout, and prioritize available high-margin items during quiet hours.",
        focusItems: [],
        focusItemIds: [],
        quickActionLabel: "Open menu",
        targetKind: null
      });
    }

    return nextRecommendations.slice(0, 10);
  }, [
    businessLunches,
    insightStats.lowDish,
    insightStats.peakHour,
    insightStats.topDish,
    items,
    promotions
  ]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const authHeaders = secondaryCredentials
      ? {
          "x-admin-secondary-login": secondaryCredentials.login,
          "x-admin-secondary-password": secondaryCredentials.password
        }
      : undefined;
    let cancelled = false;
    let timeoutId: number | null = null;
    let loadingInFlight = false;

    function scheduleNextLoad() {
      if (cancelled) {
        return;
      }

      const delay =
        document.visibilityState === "hidden"
          ? DASHBOARD_HIDDEN_POLL_MS
          : DASHBOARD_ACTIVE_POLL_MS;
      timeoutId = window.setTimeout(() => {
        void load();
      }, delay);
    }

    async function fetchDashboardResource(url: string, init?: RequestInit) {
      const controller = new AbortController();
      const abortTimeoutId = window.setTimeout(() => {
        controller.abort();
      }, DASHBOARD_REQUEST_TIMEOUT_MS);

      try {
        return await fetch(url, {
          ...init,
          signal: controller.signal
        });
      } finally {
        window.clearTimeout(abortTimeoutId);
      }
    }

    async function load() {
      if (cancelled || loadingInFlight) {
        return;
      }

      loadingInFlight = true;

      try {
        const [menuResult, settingsResult, analyticsResult] =
          await Promise.allSettled([
            fetchDashboardResource(`/api/menu?restaurantSlug=${restaurantSlug}`, {
              cache: "no-store",
              headers: authHeaders
            }),
            fetchDashboardResource(`/api/menu-settings?restaurantSlug=${restaurantSlug}`, {
              cache: "no-store"
            }),
            fetchDashboardResource(
              `/api/admin-analytics?restaurantSlug=${restaurantSlug}`,
              {
                cache: "no-store",
                headers: authHeaders
              }
            )
          ]);

        if (cancelled) {
          return;
        }

        let hasSuccessfulResponse = false;
        const menuResponse = menuResult.status === "fulfilled" ? menuResult.value : null;
        const settingsResponse =
          settingsResult.status === "fulfilled" ? settingsResult.value : null;
        const analyticsResponse =
          analyticsResult.status === "fulfilled" ? analyticsResult.value : null;

        if (menuResponse?.ok) {
          const data = (await menuResponse.json()) as MenuItem[];
          setItems((current) => mergeMenuItemsWithLocalDrafts(current, data));
          hasSuccessfulResponse = true;
          setMessage((current) => (current === "Failed to load menu." ? null : current));
        } else if (menuResult.status === "fulfilled" && !menuResponse?.ok) {
          setMessage("Failed to load menu.");
        }

        if (menuResult.status === "rejected") {
          setMessage("Failed to load menu.");
        }

        if (settingsResponse?.ok) {
          const settings = (await settingsResponse.json()) as {
            kitchenLoadWarningEnabled?: boolean;
            workingHoursRules?: WorkingHoursRule[];
            workingHoursFrom?: string | null;
            workingHoursUntil?: string | null;
            promotions?: PromotionSettings[];
            businessLunches?: BusinessLunchSettings[];
            recommendations?: RecommendationRuleSettings[];
            happyHourEnabled?: boolean;
            happyHourText?: string;
            happyHourCategories?: MenuCategory[];
            happyHourDays?: number[];
            happyHourDiscountPercent?: number;
            happyHourStartsFrom?: string | null;
            happyHourUntil?: string | null;
            kitchenOpenEnabled?: boolean;
            kitchenOpenUntil?: string | null;
            barOpenEnabled?: boolean;
            barOpenUntil?: string | null;
            orderMode?: RestaurantOrderMode;
          };

          setKitchenLoadWarningEnabled(Boolean(settings.kitchenLoadWarningEnabled));
          const nextPromotions =
            Array.isArray(settings.promotions) && settings.promotions.length > 0
              ? settings.promotions.map(toEditablePromotion)
              : settings.happyHourEnabled ||
                  (typeof settings.happyHourText === "string" &&
                    settings.happyHourText.trim()) ||
                  (Array.isArray(settings.happyHourCategories) &&
                    settings.happyHourCategories.length > 0) ||
                  (Array.isArray(settings.happyHourDays) &&
                    settings.happyHourDays.length > 0) ||
                  typeof settings.happyHourDiscountPercent === "number"
                ? [
                    {
                      id: "promo-1",
                      enabled: Boolean(settings.happyHourEnabled),
                      text:
                        typeof settings.happyHourText === "string"
                          ? settings.happyHourText
                          : "",
                      categories: Array.isArray(settings.happyHourCategories)
                        ? settings.happyHourCategories
                        : [],
                      days: Array.isArray(settings.happyHourDays)
                        ? settings.happyHourDays
                        : [],
                      discountPercent:
                        typeof settings.happyHourDiscountPercent === "number"
                          ? String(settings.happyHourDiscountPercent)
                          : "0",
                      startsFrom: formatTimeInputValue(settings.happyHourStartsFrom),
                      until: formatTimeInputValue(settings.happyHourUntil)
                    }
                  ]
                : [];
          const nextBusinessLunches =
            Array.isArray(settings.businessLunches) &&
            settings.businessLunches.length > 0
              ? settings.businessLunches.map(toEditableBusinessLunch)
              : [];
          const nextRecommendationRules =
            Array.isArray(settings.recommendations) &&
            settings.recommendations.length > 0
              ? settings.recommendations.map(toEditableRecommendationRule)
              : [];
          setBusinessLunches(nextBusinessLunches);
          setBusinessLunchMessage(null);
          setPromotions(nextPromotions);
          setPromotionMessage(null);
          setRecommendationRules(nextRecommendationRules);
          setRecommendationRulesMessage(null);
          setWorkingHoursRules(
            Array.isArray(settings.workingHoursRules) ? settings.workingHoursRules : []
          );
          setWorkingHoursFrom(settings.workingHoursFrom ?? null);
          setWorkingHoursUntil(settings.workingHoursUntil ?? null);
          setKitchenOpenEnabled(Boolean(settings.kitchenOpenEnabled));
          setKitchenOpenUntil(
            settings.kitchenOpenUntil
              ? new Date(settings.kitchenOpenUntil).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false
                })
              : ""
          );
          setBarOpenEnabled(Boolean(settings.barOpenEnabled));
          setBarOpenUntil(
            settings.barOpenUntil
              ? new Date(settings.barOpenUntil).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false
                })
              : ""
          );
          setRestaurantOrderMode(
            settings.orderMode === "counter" ? "counter" : "tables"
          );
          hasSuccessfulResponse = true;
        }

        if (analyticsResponse?.ok) {
          const analytics = (await analyticsResponse.json()) as {
            insights?: Partial<InsightStats> & {
              vsYesterday?: Partial<InsightStats["vsYesterday"]>;
            };
            charts?: Partial<DashboardCharts>;
            meta?: {
              sourceWarnings?: string[];
              error?: string;
              orderMode?: "tables" | "counter";
              ordersLabel?: string;
              activeOrdersLabel?: string;
            };
          };
          const nextInsightStats: InsightStats = {
            revenue:
              typeof analytics.insights?.revenue === "number"
                ? formatCurrency(analytics.insights.revenue)
                : "0",
            avgCheck:
              typeof analytics.insights?.avgCheck === "number"
                ? formatCurrency(analytics.insights.avgCheck)
                : "0",
            orders:
              analytics.insights?.orders !== undefined
                ? String(analytics.insights.orders)
                : "0",
            activeOrders:
              analytics.insights?.activeOrders !== undefined
                ? String(analytics.insights.activeOrders)
                : "0",
            topDish: analytics.insights?.topDish || "—",
            lowDish: analytics.insights?.lowDish || "—",
            peakHour: analytics.insights?.peakHour || "—",
            waiterCalls:
              analytics.insights?.waiterCalls !== undefined
                ? String(analytics.insights.waiterCalls)
                : "0",
            globalInsight:
              typeof analytics.insights?.globalInsight === "string"
                ? analytics.insights.globalInsight
                : "",
            globalInsightStatus:
              analytics.insights?.globalInsightStatus === "better" ||
              analytics.insights?.globalInsightStatus === "worse"
                ? analytics.insights.globalInsightStatus
                : "same",
            vsYesterday: {
              revenue: analytics.insights?.vsYesterday?.revenue ?? null,
              avgCheck: analytics.insights?.vsYesterday?.avgCheck ?? null,
              orders: analytics.insights?.vsYesterday?.orders ?? null,
              activeOrders: analytics.insights?.vsYesterday?.activeOrders ?? null,
              waiterCalls: analytics.insights?.vsYesterday?.waiterCalls ?? null
            }
          };
          const nextDashboardCharts: DashboardCharts = {
            labels: Array.isArray(analytics.charts?.labels) ? analytics.charts.labels : [],
            ordersByHour: Array.isArray(analytics.charts?.ordersByHour)
              ? analytics.charts.ordersByHour
              : [],
            revenueTrend: Array.isArray(analytics.charts?.revenueTrend)
              ? analytics.charts.revenueTrend
              : []
          };
          const sourceWarnings = Array.isArray(analytics.meta?.sourceWarnings)
            ? analytics.meta.sourceWarnings
            : [];
          const hasMetaError =
            typeof analytics.meta?.error === "string" &&
            analytics.meta.error.trim().length > 0;
          const hasOnlyZeroCounters =
            toFiniteNumber(analytics.insights?.revenue) === 0 &&
            toFiniteNumber(analytics.insights?.avgCheck) === 0 &&
            toFiniteNumber(analytics.insights?.orders) === 0 &&
            toFiniteNumber(analytics.insights?.activeOrders) === 0 &&
            toFiniteNumber(analytics.insights?.waiterCalls) === 0;
          const hasEmptyCharts =
            nextDashboardCharts.labels.length === 0 &&
            nextDashboardCharts.ordersByHour.length === 0 &&
            nextDashboardCharts.revenueTrend.length === 0;
          const shouldKeepPreviousAnalytics =
            (hasMetaError || sourceWarnings.length > 0) &&
            hasOnlyZeroCounters &&
            hasEmptyCharts;

          if (!shouldKeepPreviousAnalytics) {
            setInsightStats(nextInsightStats);
            setDashboardCharts(nextDashboardCharts);
            setDashboardMeta({
              orderMode:
                analytics.meta?.orderMode === "counter" ? "counter" : "tables",
              ordersLabel:
                typeof analytics.meta?.ordersLabel === "string" &&
                analytics.meta.ordersLabel.trim()
                  ? analytics.meta.ordersLabel
                  : "Active + closed tables",
              activeOrdersLabel:
                typeof analytics.meta?.activeOrdersLabel === "string" &&
                analytics.meta.activeOrdersLabel.trim()
                  ? analytics.meta.activeOrdersLabel
                  : "Open tables right now"
            });
          }

          hasSuccessfulResponse = true;
        }

        if (!hasSuccessfulResponse) {
          setMessage("Failed to load admin data.");
        }

        setLoading(false);
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setMessage(
            error instanceof Error ? error.message : "Failed to load admin data."
          );
        }
      } finally {
        loadingInFlight = false;

        if (!cancelled) {
          scheduleNextLoad();
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      void load();
    }

    void load();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthorized, secondaryCredentials, restaurantSlug]);

  const currentShiftLabel = useMemo(() => {
    const today = new Date().getDay();
    const matchedRule = workingHoursRules.find((rule) => rule.days.includes(today));
    const from = formatShiftTimeLabel(matchedRule?.from ?? workingHoursFrom);
    const until = formatShiftTimeLabel(matchedRule?.until ?? workingHoursUntil);

    if (!from || !until) {
      return "Calendar day 00:00–24:00";
    }

    return `${from}–${until}`;
  }, [workingHoursFrom, workingHoursRules, workingHoursUntil]);

  async function submitAuth() {
    const response = await fetch("/api/admin-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scope: "secondary",
        login,
        password,
        persist: false
      })
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      setAuthError(error.message ?? "Invalid login or password.");
      return;
    }

    setIsAuthorized(true);
    setSecondaryCredentials({ login, password });
    setAuthError(null);
    setLogin("");
    setPassword("");
    setShowPassword(false);
  }

  async function openWaiterPanel() {
    if (waiterRedirecting) {
      return;
    }

    setWaiterRedirecting(true);

    if (secondaryCredentials) {
      const response = await fetch("/api/admin-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scope: "admin",
          persist: true,
          secondaryLogin: secondaryCredentials.login,
          secondaryPassword: secondaryCredentials.password
        })
      });

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        setMessage(error.message ?? "Failed to open waiter panel.");
        setWaiterRedirecting(false);
        return;
      }
    }

    const segments = pathname.split("/").filter(Boolean);
    const restaurantSlug =
      segments.length >= 2 && segments[1] === "admin" ? segments[0] : "olive-bistro";

    window.location.href = `/${restaurantSlug}/waiter/orders`;
  }

  const updateDraft = useCallback(function updateDraft(
    itemId: string,
    field:
      | "draftNameHe"
      | "draftNameEn"
      | "draftNameRu"
      | "draftDescriptionHe"
      | "draftDescriptionEn"
      | "draftDescriptionRu"
      | "draftCategory"
      | "draftPrice"
      | "draftVolumeOptionsText"
      | "draftImage"
      | "draftShowImage"
      | "draftBadges"
      | "category",
    value: string | boolean | MenuBadge[]
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    );
  }, []);

  const updateNewItem = useCallback(function updateNewItem(
    field: keyof NewMenuItemDraft,
    value: string | boolean | MenuBadge[]
  ) {
    setNewItem((current) => ({
      ...current,
      [field]: value
    }));
  }, []);

  const clearExistingImage = useCallback(
    function clearExistingImage(itemId: string) {
    updateDraft(itemId, "draftImage", "");
    setMessage("Image removed.");
    },
    [updateDraft]
  );

  const toggleNewBadge = useCallback(function toggleNewBadge(badge: MenuBadge) {
    setNewItem((current) => ({
      ...current,
      badges: current.badges.includes(badge)
        ? current.badges.filter((value) => value !== badge)
        : [...current.badges, badge]
    }));
  }, []);

  const toggleItemBadge = useCallback(function toggleItemBadge(
    itemId: string,
    badge: MenuBadge
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              draftBadges: item.draftBadges.includes(badge)
                ? item.draftBadges.filter((value) => value !== badge)
                : [...item.draftBadges, badge]
            }
          : item
      )
    );
  }, []);

  const clearNewImage = useCallback(function clearNewImage() {
    updateNewItem("image", "");
    setMessage("Image removed.");
  }, [updateNewItem]);

  const uploadExistingImage = useCallback(async function uploadExistingImage(
    itemId: string,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const image = await readImageFile(file);
      updateDraft(itemId, "draftImage", image);
      setMessage("Image uploaded.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to upload the image."
      );
    } finally {
      event.target.value = "";
    }
  }, [updateDraft]);

  const uploadNewImage = useCallback(async function uploadNewImage(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const image = await readImageFile(file);
      updateNewItem("image", image);
      setMessage("Image uploaded.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to upload the image."
      );
    } finally {
      event.target.value = "";
    }
  }, [updateNewItem]);

  const uploadImageToStorageIfNeeded = useCallback(
    async function uploadImageToStorageIfNeeded(
      imageValue: string,
      itemId: string
    ) {
      const normalizedImage = imageValue.trim();

      if (!normalizedImage.startsWith("data:image/")) {
        return normalizedImage;
      }

      const response = await fetch("/api/menu-image-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secondary-login": secondaryCredentials?.login ?? "",
          "x-admin-secondary-password": secondaryCredentials?.password ?? ""
        },
        body: JSON.stringify({
          restaurantSlug,
          itemId,
          imageDataUrl: normalizedImage
        })
      });

      const bodyText = await response.text();

      if (!response.ok) {
        throw new Error(
          `Image upload failed: ${bodyText || response.statusText || "Unknown error"}`
        );
      }

      const parsed = JSON.parse(bodyText) as { imageUrl?: string };
      const uploadedImageUrl = (parsed.imageUrl ?? "").trim();

      if (!uploadedImageUrl) {
        throw new Error("Image upload failed: empty URL returned.");
      }

      return uploadedImageUrl;
    },
    [restaurantSlug, secondaryCredentials?.login, secondaryCredentials?.password]
  );

  const toggleAvailability = useCallback(async function toggleAvailability(itemId: string) {
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem) {
      return;
    }

    const nextAvailable = !targetItem.available;

    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              available: nextAvailable
            }
          : item
      )
    );

    setMessage(
      nextAvailable
        ? "Availability changed to Available. Press Save to apply."
        : "Availability changed to Unavailable. Press Save to apply."
    );
  }, [items]);

  async function toggleKitchenLoadWarning(nextValue: boolean) {
    setKitchenLoadWarningEnabled(nextValue);
    setKitchenLoadWarningSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        restaurantSlug,
        kitchenLoadWarningEnabled: nextValue
      })
    });

    if (!response.ok) {
      setKitchenLoadWarningEnabled(!nextValue);
      setMessage("Failed to update the kitchen warning.");
      setKitchenLoadWarningSaving(false);
      return;
    }

    setKitchenLoadWarningSaving(false);
  }

  function toPromotionIsoTimeValue(value: string) {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      return null;
    }

    const [hours, minutes] = normalizedValue.split(":").map(Number);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    return target.toISOString();
  }

  async function saveBusinessLunches(nextBusinessLunches: EditableBusinessLunch[]) {
    const previousBusinessLunches = businessLunches;
    const normalizedBusinessLunches = nextBusinessLunches.map(
      (businessLunch, index) => ({
        ...businessLunch,
        id: businessLunch.id || `business-lunch-${index + 1}`,
        text: businessLunch.text.trim(),
        categories: [...businessLunch.categories],
        days: [...new Set(businessLunch.days)].sort(
          (left, right) => left - right
        ),
        startsFrom: businessLunch.startsFrom.trim(),
        until: businessLunch.until.trim()
      })
    );

    for (const businessLunch of normalizedBusinessLunches) {
      if (!businessLunch.enabled) {
        continue;
      }

      const validationMessage = getBusinessLunchValidationMessage(businessLunch);

      if (validationMessage) {
        setBusinessLunchMessage(validationMessage);
        return false;
      }

      if (
        !toPromotionIsoTimeValue(businessLunch.startsFrom) ||
        !toPromotionIsoTimeValue(businessLunch.until)
      ) {
        setBusinessLunchMessage("Invalid business lunch time.");
        return false;
      }
    }

    setBusinessLunchMessage(null);
    setBusinessLunches(normalizedBusinessLunches);
    setBusinessLunchSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        restaurantSlug,
        businessLunches: normalizedBusinessLunches.map((businessLunch) => ({
          id: businessLunch.id,
          enabled: businessLunch.enabled,
          text: businessLunch.text,
          categories: businessLunch.categories,
          days: businessLunch.days,
          startsFrom: businessLunch.enabled
            ? toPromotionIsoTimeValue(businessLunch.startsFrom)
            : null,
          until: businessLunch.enabled
            ? toPromotionIsoTimeValue(businessLunch.until)
            : null
        }))
      })
    });

    if (!response.ok) {
      setBusinessLunches(previousBusinessLunches);
      setBusinessLunchMessage("Failed to update business lunch.");
      setBusinessLunchSaving(false);
      return false;
    }

    setBusinessLunchSaving(false);
    setBusinessLunchMessage(null);
    return true;
  }

  async function savePromotions(nextPromotions: EditablePromotion[]) {
    const previousPromotions = promotions;
    if (nextPromotions.length > 5) {
      setPromotionMessage("You can add up to 5 promos.");
      return false;
    }

    const normalizedPromotions = nextPromotions.map((promotion, index) => ({
      ...promotion,
      id: promotion.id || `promo-${index + 1}`,
      text: promotion.text.trim(),
      categories: [...promotion.categories],
      days: [...new Set(promotion.days)].sort((left, right) => left - right),
      discountPercent: String(normalizeDiscountPercentInput(promotion.discountPercent)),
      startsFrom: promotion.startsFrom.trim(),
      until: promotion.until.trim()
    }));

    for (const promotion of normalizedPromotions) {
      if (!promotion.enabled) {
        continue;
      }

      const validationMessage = getPromotionValidationMessage(promotion);

      if (validationMessage) {
        setPromotionMessage(validationMessage);
        return false;
      }

      if (!toPromotionIsoTimeValue(promotion.startsFrom) || !toPromotionIsoTimeValue(promotion.until)) {
        setPromotionMessage("Invalid promo time.");
        return false;
      }
    }

    setPromotionMessage(null);
    setPromotions(normalizedPromotions);
    setPromotionSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        restaurantSlug,
        promotions: normalizedPromotions.map((promotion) => ({
          id: promotion.id,
          enabled: promotion.enabled,
          text: promotion.text,
          categories: promotion.categories,
          days: promotion.days,
          discountPercent: normalizeDiscountPercentInput(promotion.discountPercent),
          startsFrom: promotion.enabled
            ? toPromotionIsoTimeValue(promotion.startsFrom)
            : null,
          until: promotion.enabled ? toPromotionIsoTimeValue(promotion.until) : null
        }))
      })
    });

    if (!response.ok) {
      setPromotions(previousPromotions);
      setPromotionMessage("Failed to update promo.");
      setPromotionSaving(false);
      return false;
    }

    setPromotionSaving(false);
    setPromotionMessage(null);
    return true;
  }

  async function saveRecommendationRules(
    nextRecommendationRules: EditableRecommendationRule[]
  ) {
    const previousRecommendationRules = recommendationRules;
    const normalizedRecommendationRules: EditableRecommendationRule[] =
      nextRecommendationRules
      .map((recommendation, index): EditableRecommendationRule => ({
        ...recommendation,
        id: recommendation.id || `recommendation-${index + 1}`,
        triggerItemId: recommendation.triggerItemId.trim(),
        suggestedItemId: recommendation.suggestedItemId.trim(),
        suggestedCategory: recommendation.suggestedCategory
          ? recommendation.suggestedCategory
          : ""
      }))
      .filter(
        (recommendation) =>
          recommendation.triggerItemId &&
          (
            recommendation.suggestedType === "category"
              ? Boolean(recommendation.suggestedCategory)
              : Boolean(recommendation.suggestedItemId)
          ) &&
          !(
            recommendation.suggestedType === "item" &&
            recommendation.triggerItemId === recommendation.suggestedItemId
          )
      );

    const recommendationCountsByTrigger = normalizedRecommendationRules.reduce<
      Record<string, number>
    >((acc, recommendation) => {
      acc[recommendation.triggerItemId] =
        (acc[recommendation.triggerItemId] ?? 0) + 1;
      return acc;
    }, {});
    const overLimitTriggerItemId = Object.entries(recommendationCountsByTrigger).find(
      ([, count]) => count > MAX_RECOMMENDATIONS_PER_TRIGGER_ITEM
    )?.[0];

    if (overLimitTriggerItemId) {
      const triggerItem = items.find((item) => item.id === overLimitTriggerItemId);
      setRecommendationRulesMessage(
        triggerItem
          ? `You can keep up to 3 recommendations for ${getEditorItemDisplayName(triggerItem)}.`
          : "You can keep up to 3 recommendations per dish."
      );
      return false;
    }

    setRecommendationRulesMessage(null);
    setRecommendationRules(normalizedRecommendationRules);
    setRecommendationRulesSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        restaurantSlug,
        recommendations: normalizedRecommendationRules.map((recommendation) => ({
          id: recommendation.id,
          enabled: recommendation.enabled,
          triggerItemId: recommendation.triggerItemId,
          suggestedType: recommendation.suggestedType,
          suggestedItemId:
            recommendation.suggestedType === "item"
              ? recommendation.suggestedItemId
              : "",
          suggestedCategory:
            recommendation.suggestedType === "category"
              ? recommendation.suggestedCategory
              : null
        }))
      })
    });

    if (!response.ok) {
      setRecommendationRules(previousRecommendationRules);
      setRecommendationRulesMessage("Failed to update recommendations.");
      setRecommendationRulesSaving(false);
      return false;
    }

    setRecommendationRulesSaving(false);
    setRecommendationRulesMessage(null);
    return true;
  }

  const openNewBusinessLunchModal = useCallback(
    function openNewBusinessLunchModal() {
      setBusinessLunchMessage(null);
      setBusinessLunchDraft(createEditableBusinessLunch());
      setBusinessLunchModalOpen(true);
    },
    []
  );

  const openEditBusinessLunchModal = useCallback(
    function openEditBusinessLunchModal(businessLunchId: string) {
      const businessLunch = businessLunches.find(
        (current) => current.id === businessLunchId
      );

      if (!businessLunch) {
        return;
      }

      setBusinessLunchMessage(null);
      setBusinessLunchDraft({ ...businessLunch });
      setBusinessLunchModalOpen(true);
    },
    [businessLunches]
  );

  const updateBusinessLunchDraft = useCallback(function updateBusinessLunchDraft(
    field: keyof EditableBusinessLunch,
    value: string | boolean | MenuCategory[] | number[]
  ) {
    setBusinessLunchMessage(null);
    setBusinessLunchDraft((current) =>
      current ? { ...current, [field]: value } : current
    );
  }, []);

  const toggleBusinessLunchDraftCategory = useCallback(
    function toggleBusinessLunchDraftCategory(category: MenuCategory) {
      setBusinessLunchMessage(null);
      setBusinessLunchDraft((current) =>
        current
          ? {
              ...current,
              categories: current.categories.includes(category)
                ? current.categories.filter((value) => value !== category)
                : [...current.categories, category]
            }
          : current
      );
    },
    []
  );

  const toggleBusinessLunchDraftDay = useCallback(function toggleBusinessLunchDraftDay(day: number) {
    setBusinessLunchMessage(null);
    setBusinessLunchDraft((current) =>
      current
        ? {
            ...current,
            days: current.days.includes(day)
              ? current.days.filter((value) => value !== day)
              : [...current.days, day].sort((left, right) => left - right)
          }
        : current
    );
  }, []);

  async function saveBusinessLunchModal() {
    if (!businessLunchDraft) {
      return;
    }

    const nextBusinessLunches = businessLunches.some(
      (businessLunch) => businessLunch.id === businessLunchDraft.id
    )
      ? businessLunches.map((businessLunch) =>
          businessLunch.id === businessLunchDraft.id
            ? businessLunchDraft
            : businessLunch
        )
      : [...businessLunches, businessLunchDraft];

    const saved = await saveBusinessLunches(nextBusinessLunches);

    if (saved) {
      setBusinessLunchModalOpen(false);
      setBusinessLunchDraft(null);
    }
  }

  async function toggleBusinessLunchEnabled(
    businessLunchId: string,
    enabled: boolean
  ) {
    const currentBusinessLunch = businessLunches.find(
      (businessLunch) => businessLunch.id === businessLunchId
    );

    if (!currentBusinessLunch) {
      return;
    }

    if (enabled) {
      const validationMessage = getBusinessLunchValidationMessage(
        currentBusinessLunch
      );

      if (validationMessage) {
        setBusinessLunchMessage(validationMessage);
        setBusinessLunchDraft({ ...currentBusinessLunch });
        setBusinessLunchModalOpen(true);
        return;
      }
    }

    await saveBusinessLunches(
      businessLunches.map((businessLunch) =>
        businessLunch.id === businessLunchId
          ? { ...businessLunch, enabled }
          : businessLunch
      )
    );
  }

  async function deleteBusinessLunch(businessLunchId: string) {
    const saved = await saveBusinessLunches(
      businessLunches.filter(
        (businessLunch) => businessLunch.id !== businessLunchId
      )
    );

    if (saved && businessLunchDraft?.id === businessLunchId) {
      setBusinessLunchDraft(null);
      setBusinessLunchModalOpen(false);
    }
  }

  const openNewPromotionModal = useCallback(function openNewPromotionModal() {
    if (promotions.length >= 5) {
      setPromotionMessage("You can add up to 5 promos.");
      return;
    }

    setPromotionMessage(null);
    setPromotionDraft(createEditablePromotion());
    setPromotionModalOpen(true);
  }, [promotions]);

  const updateRecommendationRule = useCallback(
    function updateRecommendationRule(
      ruleId: string,
      field:
        | "triggerItemId"
        | "suggestedType"
        | "suggestedItemId"
        | "suggestedCategory"
        | "enabled",
      value: string | boolean
    ) {
      const nextRecommendationRules: EditableRecommendationRule[] =
        recommendationRules.map((recommendation): EditableRecommendationRule => {
          if (recommendation.id !== ruleId) {
            return recommendation;
          }

          if (field === "suggestedType") {
            const nextSuggestedType = value === "category" ? "category" : "item";

            return {
              ...recommendation,
              suggestedType: nextSuggestedType,
              suggestedItemId:
                nextSuggestedType === "category"
                  ? ""
                  : recommendation.suggestedItemId,
              suggestedCategory:
                nextSuggestedType === "category"
                  ? recommendation.suggestedCategory
                  : ""
            };
          }

          if (field === "triggerItemId") {
            return {
              ...recommendation,
              triggerItemId: String(value)
            };
          }

          if (field === "suggestedItemId") {
            return {
              ...recommendation,
              suggestedItemId: String(value)
            };
          }

          if (field === "suggestedCategory") {
            return {
              ...recommendation,
              suggestedCategory: String(value) as EditableRecommendationRule["suggestedCategory"]
            };
          }

          return {
            ...recommendation,
            enabled: Boolean(value)
          };
        });

      void saveRecommendationRules(nextRecommendationRules);
    },
    [recommendationRules]
  );

  const addRecommendationRule = useCallback(function addRecommendationRule() {
    if (items.length < 2) {
      setRecommendationRulesMessage("Add at least two menu items first.");
      return;
    }

    void saveRecommendationRules([
      ...recommendationRules,
      {
        ...createEditableRecommendationRule(),
        triggerItemId: items[0]?.id ?? "",
        suggestedType: "item",
        suggestedItemId: items[1]?.id ?? items[0]?.id ?? "",
        suggestedCategory: ""
      }
    ]);
  }, [items, recommendationRules]);

  const deleteRecommendationRule = useCallback(
    function deleteRecommendationRule(ruleId: string) {
      void saveRecommendationRules(
        recommendationRules.filter((recommendation) => recommendation.id !== ruleId)
      );
    },
    [recommendationRules]
  );

  const applyRecommendationSmartSuggestion = useCallback(
    function applyRecommendationSmartSuggestion(
      ruleId: string,
      suggestion: RecommendationSmartSuggestion
    ) {
      const nextRecommendationRules = recommendationRules.map((recommendation) =>
        recommendation.id === ruleId
          ? {
              ...recommendation,
              suggestedType: suggestion.suggestedType,
              suggestedItemId: suggestion.suggestedType === "item"
                ? suggestion.suggestedItemId
                : "",
              suggestedCategory: suggestion.suggestedType === "category"
                ? suggestion.suggestedCategory
                : ""
            }
          : recommendation
      );

      void saveRecommendationRules(nextRecommendationRules);
    },
    [recommendationRules]
  );

  const openEditPromotionModal = useCallback(
    function openEditPromotionModal(promotionId: string) {
      const promotion = promotions.find((current) => current.id === promotionId);

      if (!promotion) {
        return;
      }

      setPromotionMessage(null);
      setPromotionDraft({ ...promotion });
      setPromotionModalOpen(true);
    },
    [promotions]
  );

  const updatePromotionDraft = useCallback(function updatePromotionDraft(
    field: keyof EditablePromotion,
    value: string | boolean | MenuCategory[] | number[]
  ) {
    setPromotionMessage(null);
    setPromotionDraft((current) =>
      current ? { ...current, [field]: value } : current
    );
  }, []);

  const togglePromotionDraftCategory = useCallback(
    function togglePromotionDraftCategory(category: MenuCategory) {
      setPromotionMessage(null);
      setPromotionDraft((current) =>
        current
          ? {
              ...current,
              categories: current.categories.includes(category)
                ? current.categories.filter((value) => value !== category)
                : [...current.categories, category]
            }
          : current
      );
    },
    []
  );

  const togglePromotionDraftDay = useCallback(function togglePromotionDraftDay(day: number) {
    setPromotionMessage(null);
    setPromotionDraft((current) =>
      current
        ? {
            ...current,
            days: current.days.includes(day)
              ? current.days.filter((value) => value !== day)
              : [...current.days, day].sort((left, right) => left - right)
          }
        : current
    );
  }, []);

  async function savePromotionModal() {
    if (!promotionDraft) {
      return;
    }

    const nextPromotions = promotions.some(
      (promotion) => promotion.id === promotionDraft.id
    )
      ? promotions.map((promotion) =>
          promotion.id === promotionDraft.id ? promotionDraft : promotion
        )
      : [...promotions, promotionDraft];

    const saved = await savePromotions(nextPromotions);

    if (saved) {
      setPromotionModalOpen(false);
      setPromotionDraft(null);
    }
  }

  async function togglePromotionEnabled(promotionId: string, enabled: boolean) {
    const currentPromotion = promotions.find(
      (promotion) => promotion.id === promotionId
    );

    if (!currentPromotion) {
      return;
    }

    if (enabled) {
      const validationMessage = getPromotionValidationMessage(currentPromotion);

      if (validationMessage) {
        setPromotionMessage(validationMessage);
        setPromotionDraft({ ...currentPromotion });
        setPromotionModalOpen(true);
        return;
      }
    }

    await savePromotions(
      promotions.map((promotion) =>
        promotion.id === promotionId ? { ...promotion, enabled } : promotion
      )
    );
  }

  async function deletePromotion(promotionId: string) {
    const saved = await savePromotions(
      promotions.filter((promotion) => promotion.id !== promotionId)
    );

    if (saved && promotionDraft?.id === promotionId) {
      setPromotionDraft(null);
      setPromotionModalOpen(false);
    }
  }

  async function saveKitchenOpenSettings(
    nextEnabled: boolean,
    nextTime: string
  ) {
    const previousEnabled = kitchenOpenEnabled;
    const previousTime = kitchenOpenUntil;
    const normalizedTime = nextTime.trim();
    let isoValue: string | null = null;

    if (nextEnabled) {
      if (!normalizedTime) {
        setMessage("Select the kitchen open time first.");
        return;
      }

      const [hours, minutes] = normalizedTime.split(":").map(Number);

      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        setMessage("Invalid kitchen open time.");
        return;
      }

      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      isoValue = target.toISOString();
    }

    setKitchenOpenEnabled(nextEnabled);
    setKitchenOpenUntil(normalizedTime);
    setKitchenOpenSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        restaurantSlug,
        kitchenOpenEnabled: nextEnabled,
        kitchenOpenUntil: nextEnabled ? isoValue : null
      })
    });

    if (!response.ok) {
      setKitchenOpenEnabled(previousEnabled);
      setKitchenOpenUntil(previousTime);
      setMessage("Failed to update kitchen open settings.");
      setKitchenOpenSaving(false);
      return;
    }

    setKitchenOpenSaving(false);
    if (nextEnabled) {
      setMessage(`Kitchen open time saved until ${normalizedTime}.`);
    } else {
      setMessage("Kitchen open settings saved.");
    }
  }

  async function saveBarOpenSettings(nextEnabled: boolean, nextTime: string) {
    const previousEnabled = barOpenEnabled;
    const previousTime = barOpenUntil;
    const normalizedTime = nextTime.trim();
    let isoValue: string | null = null;

    if (nextEnabled) {
      if (!normalizedTime) {
        setMessage("Select the bar open time first.");
        return;
      }

      const [hours, minutes] = normalizedTime.split(":").map(Number);

      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        setMessage("Invalid bar open time.");
        return;
      }

      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      isoValue = target.toISOString();
    }

    setBarOpenEnabled(nextEnabled);
    setBarOpenUntil(normalizedTime);
    setBarOpenSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        restaurantSlug,
        barOpenEnabled: nextEnabled,
        barOpenUntil: nextEnabled ? isoValue : null
      })
    });

    if (!response.ok) {
      setBarOpenEnabled(previousEnabled);
      setBarOpenUntil(previousTime);
      setMessage("Failed to update bar open settings.");
      setBarOpenSaving(false);
      return;
    }

    setBarOpenSaving(false);
    if (nextEnabled) {
      setMessage(`Bar open time saved until ${normalizedTime}.`);
    } else {
      setMessage("Bar open settings saved.");
    }
  }

  async function saveItem(itemId: string) {
    const currentItem = items.find((item) => item.id === itemId);

    if (!currentItem) {
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, saving: true } : item
      )
    );

    const itemKind = getItemKind(currentItem.draftCategory);
    if (
      itemKind === "drinks" &&
      hasInvalidDrinkVolumeRows(currentItem.draftVolumeOptionsText)
    ) {
      setMessage(
        "Add a valid price for every row. If there are multiple rows, fill in volume for each."
      );
      setItems((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, saving: false } : item
        )
      );
      return;
    }

    const basePrice = getBasePriceForKind(
      itemKind,
      currentItem.draftPrice,
      currentItem.draftVolumeOptionsText
    );

    const preferredName = getPreferredDraftName({
      nameHe: currentItem.draftNameHe,
      nameEn: currentItem.draftNameEn,
      nameRu: currentItem.draftNameRu
    });

    if (!preferredName || !Number.isFinite(basePrice)) {
      setMessage(
        itemKind === "drinks"
          ? "Fill in the item name and at least one volume and price."
          : "Fill in the item name and price."
      );
      setItems((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, saving: false } : item
        )
      );
      return;
    }

    let resolvedImage = currentItem.draftImage;

    try {
      resolvedImage = await uploadImageToStorageIfNeeded(currentItem.draftImage, itemId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to upload image.");
      setItems((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, saving: false } : item
        )
      );
      return;
    }

    const response = await fetch("/api/menu", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        id: itemId,
        name: preferredName,
        description: currentItem.draftDescriptionHe,
        nameHe: currentItem.draftNameHe || preferredName,
        nameEn: currentItem.draftNameEn || currentItem.draftNameRu || currentItem.draftNameHe || preferredName,
        nameRu:
          currentItem.draftNameRu ||
          currentItem.draftNameEn ||
          currentItem.draftNameHe,
        descriptionHe: currentItem.draftDescriptionHe,
        descriptionEn:
          currentItem.draftDescriptionEn || currentItem.draftDescriptionHe,
        descriptionRu:
          currentItem.draftDescriptionRu ||
          currentItem.draftDescriptionEn ||
          currentItem.draftDescriptionHe,
        price: basePrice,
        volumeOptions:
          itemKind === "drinks"
            ? parseVolumeOptions(currentItem.draftVolumeOptionsText)
            : [],
        image: resolvedImage,
        showImage: currentItem.draftShowImage,
        badges: currentItem.draftBadges,
        available: currentItem.available,
        category: currentItem.draftCategory
      })
    });

    if (!response.ok) {
      setMessage("Failed to save menu changes.");
      setItems((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, saving: false } : item
        )
      );
      return;
    }

    const updatedItem = (await response.json()) as MenuItem;
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...toEditableItem(updatedItem),
              saving: false
            }
          : item
      )
    );
    setMessage(`Saved: ${updatedItem.name}`);
  }

  async function createItem() {
    if (
      selectedKind === "drinks" &&
      hasInvalidDrinkVolumeRows(newItem.volumeOptionsText)
    ) {
      setMessage(
        "Add a valid price for every row. If there are multiple rows, fill in volume for each."
      );
      return;
    }

    const basePrice = getBasePriceForKind(
      selectedKind,
      newItem.price,
      newItem.volumeOptionsText
    );

    const preferredName = getPreferredDraftName({
      nameHe: newItem.nameHe,
      nameEn: newItem.nameEn,
      nameRu: newItem.nameRu
    });

    if (!preferredName || !Number.isFinite(basePrice)) {
      setMessage(
        selectedKind === "drinks"
          ? "Fill in the item name and at least one volume and price for the new entry."
          : "Fill in the item name and price for the new entry."
      );
      return;
    }

    setNewItem((current) => ({ ...current, saving: true }));

    const temporaryItemId = `new-${Date.now()}`;
    let resolvedImage = newItem.image;

    try {
      resolvedImage = await uploadImageToStorageIfNeeded(newItem.image, temporaryItemId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to upload image.");
      setNewItem((current) => ({ ...current, saving: false }));
      return;
    }

    const response = await fetch("/api/menu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        restaurantSlug,
        name: preferredName,
        description: newItem.descriptionHe,
        nameHe: newItem.nameHe || preferredName,
        nameEn: newItem.nameEn || newItem.nameRu || newItem.nameHe || preferredName,
        nameRu: newItem.nameRu || newItem.nameEn || newItem.nameHe,
        descriptionHe: newItem.descriptionHe,
        descriptionEn: newItem.descriptionEn || newItem.descriptionHe,
        descriptionRu:
          newItem.descriptionRu ||
          newItem.descriptionEn ||
          newItem.descriptionHe,
        price: basePrice,
        volumeOptions:
          selectedKind === "drinks"
            ? parseVolumeOptions(newItem.volumeOptionsText)
            : [],
        image: resolvedImage,
        showImage: newItem.showImage,
        badges: newItem.badges,
        available: newItem.available,
        category: newItem.category
      })
    });

    if (!response.ok) {
      setMessage("Failed to add the new menu item.");
      setNewItem((current) => ({ ...current, saving: false }));
      return;
    }

    const createdItem = (await response.json()) as MenuItem;
    setItems((current) => [toEditableItem(createdItem), ...current]);
    setShowCreateForm(false);
    setNewItem({
      nameHe: "",
      nameEn: "",
      nameRu: "",
      descriptionHe: "",
      descriptionEn: "",
      descriptionRu: "",
      price: "",
      volumeOptionsText: "",
      image: "",
      showImage: true,
      badges: [],
      category: preferredNewItemCategory,
      available: true,
      saving: false
    });
    setMessage(`Added: ${createdItem.name}`);
  }

  async function removeItem(itemId: string) {
    const response = await fetch("/api/menu", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({ id: itemId })
    });

    if (!response.ok) {
      setMessage("Failed to delete the menu item.");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== itemId));
    setMessage("Dish deleted.");
  }

  const visibleCategories = useMemo(
    () =>
      (Object.entries(categoryLabels) as Array<[MenuCategory, string]>).filter(
        ([value]) =>
          selectedKind === "drinks"
            ? drinkCategories.includes(value)
            : value !== "drinks" && !drinkCategories.includes(value)
      ),
    [selectedKind]
  );

  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (selectedKind === "drinks"
            ? drinkCategories.includes(item.category)
            : !drinkCategories.includes(item.category)) &&
          (!recommendationFocusItemIds ||
            recommendationFocusItemIds.includes(item.id)) &&
          (selectedCategories.length === 0 ||
            selectedCategories.includes(item.category))
      ),
    [items, recommendationFocusItemIds, selectedCategories, selectedKind]
  );

  useEffect(() => {
    if (!recommendationFocusItemIds?.length) {
      return;
    }

    const hasAnyFocusedItem = items.some((item) =>
      recommendationFocusItemIds.includes(item.id)
    );

    if (!hasAnyFocusedItem) {
      setRecommendationFocusItemIds(null);
    }
  }, [items, recommendationFocusItemIds]);

  const toggleCategory = useCallback(function toggleCategory(category: MenuCategory) {
    setRecommendationFocusItemIds(null);
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category]
    );
  }, []);

  const getItemLanguage = useCallback(function getItemLanguage(itemId: string) {
    return itemLanguages[itemId] ?? "he";
  }, [itemLanguages]);

  const setItemLanguage = useCallback(function setItemLanguage(
    itemId: string,
    language: "he" | "en" | "ru"
  ) {
    setItemLanguages((current) => ({ ...current, [itemId]: language }));
  }, []);

  const setItemsCategoryDraft = useCallback(function setItemsCategoryDraft(
    itemId: string,
    nextCategory: MenuCategory
  ) {
    const nextKind = getItemKind(nextCategory);
    const allowedBadges = getBadgeOptionsForKind(nextKind).map(
      (badge) => badge.value
    );

    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === itemId
          ? {
              ...currentItem,
              draftCategory: nextCategory,
              draftVolumeOptionsText:
                nextKind === "drinks" ? currentItem.draftVolumeOptionsText : "",
              draftBadges: currentItem.draftBadges.filter((badge) =>
                allowedBadges.includes(badge)
              )
            }
          : currentItem
      )
    );
  }, []);

  const toggleItemDescription = useCallback(function toggleItemDescription(
    itemId: string
  ) {
    setExpandedDescriptions((current) => ({
      ...current,
      [itemId]: !current[itemId]
    }));
  }, []);

  const closeControlCenterPanels = useCallback(function closeControlCenterPanels() {
    setDashboardOpen(false);
    setMenuButtonsOpen(false);
    setSettingsButtonsOpen(false);
    setPreviewOpen(false);
    setMenuOpen(false);
    setNotificationsOpen(false);
    setRecommendationsOpen(false);
    setSettingsRecommendationsOpen(false);
    setRecommendationFocusItemIds(null);
  }, []);

  const toggleMenuBlock = useCallback(function toggleMenuBlock() {
    setMenuButtonsOpen((current) => {
      const nextOpen = !current;

      if (!nextOpen) {
        setPreviewOpen(false);
        setMenuOpen(false);
        setNotificationsOpen(false);
        setRecommendationsOpen(false);
        setSettingsRecommendationsOpen(false);
      } else {
        setDashboardOpen(false);
        setSettingsButtonsOpen(false);
        setNotificationsOpen(false);
        setRecommendationsOpen(false);
        setSettingsRecommendationsOpen(false);
        setPreviewOpen(true);
        setMenuOpen(false);
      }

      return nextOpen;
    });
  }, []);

  const toggleSettingsBlock = useCallback(function toggleSettingsBlock() {
    setSettingsButtonsOpen((current) => {
      const nextOpen = !current;

      if (!nextOpen) {
        setNotificationsOpen(false);
        setRecommendationsOpen(false);
        setSettingsRecommendationsOpen(false);
      } else {
        setDashboardOpen(false);
        setMenuButtonsOpen(false);
        setPreviewOpen(false);
        setMenuOpen(false);
        setNotificationsOpen(true);
        setRecommendationsOpen(false);
        setSettingsRecommendationsOpen(false);
      }

      return nextOpen;
    });
  }, []);

  const toggleDashboardBlock = useCallback(function toggleDashboardBlock() {
    setDashboardOpen((current) => {
      const nextOpen = !current;

      if (nextOpen) {
        setMenuButtonsOpen(false);
        setSettingsButtonsOpen(false);
        setPreviewOpen(false);
        setMenuOpen(false);
        setNotificationsOpen(false);
        setRecommendationsOpen(false);
        setSettingsRecommendationsOpen(false);
      }

      return nextOpen;
    });
  }, []);

  const selectDishes = useCallback(() => {
    setRecommendationFocusItemIds(null);
    setSelectedKind("dishes");
    setSelectedCategories([]);
    setNewItem((current) => ({
      ...current,
      category: dishCategories.includes(current.category)
        ? current.category
        : "starters",
      volumeOptionsText: "",
      badges: current.badges.filter((badge) =>
        getBadgeOptionsForKind("dishes").some((option) => option.value === badge)
      )
    }));
  }, []);

  const selectDrinks = useCallback(() => {
    setRecommendationFocusItemIds(null);
    setSelectedKind("drinks");
    setSelectedCategories([]);
    setNewItem((current) => ({
      ...current,
      category: drinkCategories.includes(current.category)
        ? current.category
        : drinkCategories[0],
      badges: current.badges.filter((badge) =>
        getBadgeOptionsForKind("drinks").some((option) => option.value === badge)
      )
    }));
  }, []);

  const togglePreview = useCallback(() => {
    setPreviewOpen((current) => {
      const nextOpen = !current;

      if (nextOpen) {
        setMenuOpen(false);
        setRecommendationsOpen(false);
        setSettingsRecommendationsOpen(false);
        setRecommendationFocusItemIds(null);
      }

      return nextOpen;
    });
  }, []);

  const toggleRecommendations = useCallback(() => {
    setRecommendationsOpen((current) => {
      const nextOpen = !current;

      if (nextOpen) {
        setNotificationsOpen(false);
        setPreviewOpen(false);
        setMenuOpen(false);
        setSettingsRecommendationsOpen(false);
      } else {
        setRecommendationFocusItemIds(null);
      }

      return nextOpen;
    });
  }, []);

  const toggleEdit = useCallback(() => {
    setMenuOpen((current) => {
      const nextOpen = !current;

      if (nextOpen) {
        setPreviewOpen(false);
        setRecommendationsOpen(false);
        setSettingsRecommendationsOpen(false);
        setRecommendationFocusItemIds(null);
      }

      return nextOpen;
    });
  }, []);

  const toggleNotifications = useCallback(
    () => {
      setRecommendationFocusItemIds(null);
      setSettingsRecommendationsOpen(false);
      setNotificationsOpen((current) => !current);
    },
    []
  );

  const toggleSettingsRecommendations = useCallback(() => {
    setRecommendationFocusItemIds(null);
    setNotificationsOpen(false);
    setSettingsRecommendationsOpen((current) => !current);
  }, []);

  const toggleCreateForm = useCallback(() => {
    setShowCreateForm((current) => {
      const next = !current;

      if (next) {
        setNewItem((draft) => ({
          ...draft,
          category: preferredNewItemCategory
        }));
      }

      return next;
    });
  }, [preferredNewItemCategory]);

  const clearSelectedCategories = useCallback(() => {
    setRecommendationFocusItemIds(null);
    setSelectedCategories([]);
  }, []);

  const runRecommendationAction = useCallback(
    (recommendationId: string) => {
      const recommendation = recommendations.find((item) => item.id === recommendationId);

      if (!recommendation) {
        return;
      }

      setDashboardOpen(false);
      setSettingsButtonsOpen(false);
      setMenuButtonsOpen(true);
      setPreviewOpen(false);
      setMenuOpen(true);
      setNotificationsOpen(false);
      setRecommendationsOpen(false);
      setSettingsRecommendationsOpen(false);

      if (recommendationId === "timed-promo") {
        setMenuButtonsOpen(false);
        setSettingsButtonsOpen(true);
        setMenuOpen(false);
        setRecommendationFocusItemIds(null);
        openNewPromotionModal();
        return;
      }

      if (recommendationId === "business-lunch") {
        setMenuButtonsOpen(false);
        setSettingsButtonsOpen(true);
        setMenuOpen(false);
        setRecommendationFocusItemIds(null);
        openNewBusinessLunchModal();
        return;
      }

      if (recommendation.targetKind) {
        setSelectedKind(recommendation.targetKind);
      }

      setSelectedCategories(recommendation.targetCategories ?? []);

      setRecommendationFocusItemIds(
        recommendation.focusItemIds.length ? recommendation.focusItemIds : null
      );
    },
    [openNewBusinessLunchModal, openNewPromotionModal, recommendations]
  );

  const toggleNewDescription = useCallback(
    () => setNewDescriptionExpanded((current) => !current),
    []
  );

  if (!isAuthorized && authOpen) {
    return (
      <div className="modal-backdrop" role="presentation">
        <div
          className="modal-card modal-card--form"
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-auth-title"
        >
          <button
            className="modal-card__close"
            type="button"
            aria-label="Close dialog"
            onClick={() => setAuthOpen(false)}
          >
            X
          </button>
          <h2 id="menu-auth-title">Menu access</h2>
          <div className="modal-form">
            <input
              className="modal-input"
              type="text"
              placeholder="Login"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
            <div className="modal-password-field">
              <input
                className="modal-input modal-input--password"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="modal-password-toggle"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {showPassword ? (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.9 5.2A10.9 10.9 0 0112 5c5 0 8.7 4.5 9.8 7-0.5 1.2-1.6 3-3.3 4.5" />
                      <path d="M6.2 6.2C4.4 7.5 3.3 9.4 2.2 12 3.3 14.5 7 19 12 19c1.5 0 2.8-.3 4-.8" />
                    </>
                  ) : (
                    <>
                      <path d="M2.2 12C3.3 9.5 7 5 12 5s8.7 4.5 9.8 7C20.7 14.5 17 19 12 19S3.3 14.5 2.2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
          {authError ? <p className="modal-error">{authError}</p> : null}
          <div className="modal-actions">
            <button
              className="button-success"
              type="button"
              onClick={() => void submitAuth()}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <p className="muted">Menu editor access was cancelled.</p>;
  }

  if (loading) {
    return <p className="muted">Loading menu...</p>;
  }

  return (
    <div className="orders-layout">
      <ControlCenterToolbar
        dashboardOpen={dashboardOpen}
        onToggleDashboard={toggleDashboardBlock}
        waiterRedirecting={waiterRedirecting}
        onOpenLiveOrders={() => {
          closeControlCenterPanels();
          void openWaiterPanel();
        }}
        menuButtonsOpen={menuButtonsOpen}
        onToggleMenu={toggleMenuBlock}
        settingsButtonsOpen={settingsButtonsOpen}
        onToggleSettings={toggleSettingsBlock}
        previewOpen={previewOpen}
        onTogglePreview={togglePreview}
        menuOpen={menuOpen}
        onToggleEdit={toggleEdit}
        secondaryCredentials={secondaryCredentials}
        restaurantSlug={restaurantSlug}
        notificationsOpen={notificationsOpen}
        onToggleNotifications={toggleNotifications}
        recommendationsOpen={recommendationsOpen}
        onToggleRecommendations={toggleRecommendations}
        settingsRecommendationsOpen={settingsRecommendationsOpen}
        onToggleSettingsRecommendations={toggleSettingsRecommendations}
        selectedKind={selectedKind}
        onSelectDishes={selectDishes}
        onSelectDrinks={selectDrinks}
        orderMode={restaurantOrderMode}
      />
      {dashboardOpen ? (
        <ControlCenterDashboard
          insightStats={insightStats}
          dashboardCharts={dashboardCharts}
          currentShiftLabel={currentShiftLabel}
          dashboardMeta={dashboardMeta}
        />
      ) : null}
      {message ? <p className="status-message">{message}</p> : null}
      {previewOpen ? <MenuPreviewPanel src={menuPreviewHref} /> : null}
      <MenuAlertsPanel
        notificationsOpen={notificationsOpen}
        recommendationsOpen={recommendationsOpen}
        settingsRecommendationsOpen={settingsRecommendationsOpen}
        recommendations={recommendations}
        onRunRecommendation={runRecommendationAction}
        kitchenLoadWarningEnabled={kitchenLoadWarningEnabled}
        kitchenLoadWarningSaving={kitchenLoadWarningSaving}
        toggleKitchenLoadWarning={toggleKitchenLoadWarning}
        businessLunches={businessLunches}
        businessLunchSaving={businessLunchSaving}
        businessLunchModalOpen={businessLunchModalOpen}
        businessLunchDraft={businessLunchDraft}
        businessLunchMessage={businessLunchMessage}
        openNewBusinessLunchModal={openNewBusinessLunchModal}
        openEditBusinessLunchModal={openEditBusinessLunchModal}
        updateBusinessLunchDraft={updateBusinessLunchDraft}
        toggleBusinessLunchDraftCategory={toggleBusinessLunchDraftCategory}
        toggleBusinessLunchDraftDay={toggleBusinessLunchDraftDay}
        setBusinessLunchModalOpen={setBusinessLunchModalOpen}
        saveBusinessLunchModal={saveBusinessLunchModal}
        toggleBusinessLunchEnabled={toggleBusinessLunchEnabled}
        deleteBusinessLunch={deleteBusinessLunch}
        promotions={promotions}
        promotionSaving={promotionSaving}
        promotionModalOpen={promotionModalOpen}
        promotionDraft={promotionDraft}
        promotionMessage={promotionMessage}
        recommendationRules={recommendationRules}
        recommendationRulesSaving={recommendationRulesSaving}
        recommendationRulesMessage={recommendationRulesMessage}
        recommendationItemOptions={recommendationItemOptions}
        recommendationSmartSuggestions={recommendationSmartSuggestions}
        updateRecommendationRule={updateRecommendationRule}
        addRecommendationRule={addRecommendationRule}
        deleteRecommendationRule={deleteRecommendationRule}
        applyRecommendationSmartSuggestion={applyRecommendationSmartSuggestion}
        openNewPromotionModal={openNewPromotionModal}
        openEditPromotionModal={openEditPromotionModal}
        updatePromotionDraft={updatePromotionDraft}
        togglePromotionDraftCategory={togglePromotionDraftCategory}
        togglePromotionDraftDay={togglePromotionDraftDay}
        setPromotionModalOpen={setPromotionModalOpen}
        savePromotionModal={savePromotionModal}
        togglePromotionEnabled={togglePromotionEnabled}
        deletePromotion={deletePromotion}
        kitchenOpenEnabled={kitchenOpenEnabled}
        kitchenOpenSaving={kitchenOpenSaving}
        kitchenOpenUntil={kitchenOpenUntil}
        saveKitchenOpenSettings={saveKitchenOpenSettings}
        setKitchenOpenUntil={setKitchenOpenUntil}
        barOpenEnabled={barOpenEnabled}
        barOpenSaving={barOpenSaving}
        barOpenUntil={barOpenUntil}
        saveBarOpenSettings={saveBarOpenSettings}
        setBarOpenUntil={setBarOpenUntil}
        dishCategories={dishCategories}
        allDrinkCategories={allDrinkCategories}
        categoryLabels={categoryLabels}
      />
      <MenuEditPanel
        menuOpen={menuOpen}
        showCreateForm={showCreateForm}
        onToggleCreateForm={toggleCreateForm}
        selectedKind={selectedKind}
        selectedCategories={selectedCategories}
        categoryLabels={categoryLabels}
        visibleCategories={visibleCategories}
        onToggleCategory={toggleCategory}
        onClearSelectedCategories={clearSelectedCategories}
        filteredItems={filteredItems}
        newItemLanguage={newItemLanguage}
        onSetNewItemLanguage={setNewItemLanguage}
        newDescriptionExpanded={newDescriptionExpanded}
        onToggleNewDescription={toggleNewDescription}
        newItem={newItem}
        updateNewItem={updateNewItem}
        clearNewImage={clearNewImage}
        uploadNewImage={uploadNewImage}
        toggleNewBadge={toggleNewBadge}
        createItem={createItem}
        getCategoryOptions={getCategoryOptions}
        getBadgeOptionsForKind={getBadgeOptionsForKind}
        parseVolumeRows={parseVolumeRows}
        addVolumeRow={addVolumeRow}
        removeVolumeRow={removeVolumeRow}
        updateVolumeRow={updateVolumeRow}
        getItemKind={getItemKind}
        getItemLanguage={getItemLanguage}
        setItemLanguage={setItemLanguage}
        expandedDescriptions={expandedDescriptions}
        toggleItemDescription={toggleItemDescription}
        updateDraft={updateDraft}
        setItemsCategoryDraft={setItemsCategoryDraft}
        toggleAvailability={toggleAvailability}
        uploadExistingImage={uploadExistingImage}
        clearExistingImage={clearExistingImage}
        toggleItemBadge={toggleItemBadge}
        removeItem={removeItem}
        saveItem={saveItem}
      />
    </div>
  );
}
