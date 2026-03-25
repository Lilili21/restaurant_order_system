"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { ControlCenterDashboard } from "@/components/admin/ControlCenterDashboard";
import { MenuAlertsPanel } from "@/components/admin/MenuAlertsPanel";
import { MenuEditPanel } from "@/components/admin/MenuEditPanel";
import { MenuPreviewPanel } from "@/components/admin/MenuPreviewPanel";
import { ControlCenterToolbar } from "@/components/admin/ControlCenterToolbar";
import { formatCurrency } from "@/lib/menu";
import type {
  BusinessLunchSettings,
  PromotionSettings
} from "@/lib/menu-settings";
import {
  MenuBadge,
  MenuCategory,
  MenuItem,
  MenuVolumeOption
} from "@/lib/types";
import type {
  EditableBusinessLunch,
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
type InsightStats = {
  revenue: string;
  avgCheck: string;
  orders: string;
  activeOrders: string;
  topDish: string;
  lowDish: string;
  peakHour: string;
  waiterCalls: string;
};

type DashboardCharts = {
  labels: string[];
  ordersByHour: number[];
  revenueTrend: number[];
};

type EditableMenuItem = MenuItem & {
  draftNameHe: string;
  draftNameEn: string;
  draftDescriptionHe: string;
  draftDescriptionEn: string;
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
  descriptionHe: string;
  descriptionEn: string;
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
  const parsedDiscountPercent = Number(
    Number.parseFloat(promotion.discountPercent || "0").toFixed(2)
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

function toEditableItem(item: MenuItem): EditableMenuItem {
  return {
    ...item,
    draftNameHe: item.nameHe || item.name,
    draftNameEn: item.nameEn || item.nameHe || item.name,
    draftDescriptionHe: item.descriptionHe || item.description,
    draftDescriptionEn: item.descriptionEn || item.descriptionHe || item.description,
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

      const price = Number(rawPrice);

      if (!Number.isFinite(price) || price <= 0) {
        return null;
      }

      return {
        id: `volume_${index}_${(rawLabel || "empty").replace(/\s+/g, "_")}_${Math.max(
          0,
          Math.round(price)
        )}`,
        label: rawLabel,
        price: Math.max(0, Math.round(price))
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
    [field]:
      field === "price" ? nextValue.replace(/[^\d./]/g, "") : nextValue
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

  return Number(priceText);
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

    const parsedPrice = Number(rawPrice);
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
  const [kitchenOpenEnabled, setKitchenOpenEnabled] = useState(false);
  const [kitchenOpenUntil, setKitchenOpenUntil] = useState("");
  const [kitchenOpenSaving, setKitchenOpenSaving] = useState(false);
  const [barOpenEnabled, setBarOpenEnabled] = useState(false);
  const [barOpenUntil, setBarOpenUntil] = useState("");
  const [barOpenSaving, setBarOpenSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [insightStats, setInsightStats] = useState<InsightStats>({
    revenue: "—",
    avgCheck: "—",
    orders: "—",
    activeOrders: "—",
    topDish: "—",
    lowDish: "—",
    peakHour: "—",
    waiterCalls: "—"
  });
  const [dashboardCharts, setDashboardCharts] = useState<DashboardCharts>({
    labels: [],
    ordersByHour: [],
    revenueTrend: []
  });
  const [selectedKind, setSelectedKind] = useState<"dishes" | "drinks">("dishes");
  const [selectedCategories, setSelectedCategories] = useState<MenuCategory[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newItemLanguage, setNewItemLanguage] = useState<"he" | "en">("he");
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
  const [itemLanguages, setItemLanguages] = useState<Record<string, "he" | "en">>(
    {}
  );
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>(
    {}
  );
  const [newItem, setNewItem] = useState<NewMenuItemDraft>({
    nameHe: "",
    nameEn: "",
    descriptionHe: "",
    descriptionEn: "",
    price: "",
    volumeOptionsText: "",
    image: "",
    showImage: true,
    badges: [],
    category: "starters",
    available: true,
    saving: false
  });
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

  useEffect(() => {
    if (!isAuthorized || !secondaryCredentials) {
      return;
    }

    const authHeaders = {
      "x-admin-secondary-login": secondaryCredentials.login,
      "x-admin-secondary-password": secondaryCredentials.password
    };
    let cancelled = false;

    async function load() {
      const [menuResponse, settingsResponse, analyticsResponse] = await Promise.all([
        fetch("/api/menu?restaurantSlug=olive-bistro", {
          cache: "no-store",
          headers: authHeaders
        }),
        fetch("/api/menu-settings", {
          cache: "no-store"
        }),
        fetch(`/api/admin-analytics?restaurantSlug=${restaurantSlug}`, {
          cache: "no-store",
          headers: authHeaders
        })
      ]);

      if (!menuResponse.ok) {
        return;
      }

      const data = (await menuResponse.json()) as MenuItem[];

      if (!cancelled) {
        setItems(data.map(toEditableItem));
        setLoading(false);
      }

      if (!cancelled && settingsResponse.ok) {
        const settings = (await settingsResponse.json()) as {
          kitchenLoadWarningEnabled?: boolean;
          promotions?: PromotionSettings[];
          businessLunches?: BusinessLunchSettings[];
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
        setBusinessLunches(nextBusinessLunches);
        setBusinessLunchMessage(null);
        setPromotions(nextPromotions);
        setPromotionMessage(null);
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
      }

      if (!cancelled && analyticsResponse.ok) {
        const analytics = (await analyticsResponse.json()) as {
          insights?: Partial<InsightStats>;
          charts?: Partial<DashboardCharts>;
        };

        setInsightStats({
          revenue:
            typeof analytics.insights?.revenue === "number"
              ? formatCurrency(analytics.insights.revenue)
              : "—",
          avgCheck:
            typeof analytics.insights?.avgCheck === "number"
              ? formatCurrency(analytics.insights.avgCheck)
              : "—",
          orders:
            analytics.insights?.orders !== undefined
              ? String(analytics.insights.orders)
              : "—",
          activeOrders:
            analytics.insights?.activeOrders !== undefined
              ? String(analytics.insights.activeOrders)
              : "—",
          topDish: analytics.insights?.topDish || "—",
          lowDish: analytics.insights?.lowDish || "—",
          peakHour: analytics.insights?.peakHour || "—",
          waiterCalls:
            analytics.insights?.waiterCalls !== undefined
              ? String(analytics.insights.waiterCalls)
              : "—"
        });
        setDashboardCharts({
          labels: Array.isArray(analytics.charts?.labels) ? analytics.charts.labels : [],
          ordersByHour: Array.isArray(analytics.charts?.ordersByHour)
            ? analytics.charts.ordersByHour
            : [],
          revenueTrend: Array.isArray(analytics.charts?.revenueTrend)
            ? analytics.charts.revenueTrend
            : []
        });
      }
    }

    load();

    const intervalId = window.setInterval(() => {
      void load();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isAuthorized, secondaryCredentials]);

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
    if (!secondaryCredentials || waiterRedirecting) {
      return;
    }

    setWaiterRedirecting(true);

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
      | "draftDescriptionHe"
      | "draftDescriptionEn"
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

  const toggleAvailability = useCallback(function toggleAvailability(itemId: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, available: !item.available } : item
      )
    );
  }, []);

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
      discountPercent: String(
        Number(Number.parseFloat(promotion.discountPercent || "0").toFixed(2))
      ),
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
        promotions: normalizedPromotions.map((promotion) => ({
          id: promotion.id,
          enabled: promotion.enabled,
          text: promotion.text,
          categories: promotion.categories,
          days: promotion.days,
          discountPercent: Number(
            Number.parseFloat(promotion.discountPercent || "0").toFixed(2)
          ),
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

    if (!currentItem.draftNameHe.trim() || !Number.isFinite(basePrice)) {
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

    const response = await fetch("/api/menu", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        id: itemId,
        name: currentItem.draftNameHe,
        description: currentItem.draftDescriptionHe,
        nameHe: currentItem.draftNameHe,
        nameEn: currentItem.draftNameEn || currentItem.draftNameHe,
        descriptionHe: currentItem.draftDescriptionHe,
        descriptionEn:
          currentItem.draftDescriptionEn || currentItem.draftDescriptionHe,
        price: basePrice,
        volumeOptions:
          itemKind === "drinks"
            ? parseVolumeOptions(currentItem.draftVolumeOptionsText)
            : [],
        image: currentItem.draftImage,
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

    if (!newItem.nameHe.trim() || !Number.isFinite(basePrice)) {
      setMessage(
        selectedKind === "drinks"
          ? "Fill in the item name and at least one volume and price for the new entry."
          : "Fill in the item name and price for the new entry."
      );
      return;
    }

    setNewItem((current) => ({ ...current, saving: true }));

    const response = await fetch("/api/menu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        restaurantSlug: "olive-bistro",
        name: newItem.nameHe,
        description: newItem.descriptionHe,
        nameHe: newItem.nameHe,
        nameEn: newItem.nameEn || newItem.nameHe,
        descriptionHe: newItem.descriptionHe,
        descriptionEn: newItem.descriptionEn || newItem.descriptionHe,
        price: basePrice,
        volumeOptions:
          selectedKind === "drinks"
            ? parseVolumeOptions(newItem.volumeOptionsText)
            : [],
        image: newItem.image,
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
      descriptionHe: "",
      descriptionEn: "",
      price: "",
      volumeOptionsText: "",
      image: "",
      showImage: true,
      badges: [],
      category: selectedKind === "drinks" ? drinkCategories[0] : "starters",
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
          (selectedCategories.length === 0 ||
            selectedCategories.includes(item.category))
      ),
    [items, selectedCategories, selectedKind]
  );

  const toggleCategory = useCallback(function toggleCategory(category: MenuCategory) {
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
    language: "he" | "en"
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
  }, []);

  const toggleMenuBlock = useCallback(function toggleMenuBlock() {
    setMenuButtonsOpen((current) => {
      const nextOpen = !current;

      if (!nextOpen) {
        setPreviewOpen(false);
        setMenuOpen(false);
        setNotificationsOpen(false);
      } else {
        setDashboardOpen(false);
        setSettingsButtonsOpen(false);
        setNotificationsOpen(false);
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
      } else {
        setDashboardOpen(false);
        setMenuButtonsOpen(false);
        setPreviewOpen(false);
        setMenuOpen(false);
        setNotificationsOpen(true);
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
      }

      return nextOpen;
    });
  }, []);

  const selectDishes = useCallback(() => {
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
      }

      return nextOpen;
    });
  }, []);

  const toggleEdit = useCallback(() => {
    setMenuOpen((current) => {
      const nextOpen = !current;

      if (nextOpen) {
        setPreviewOpen(false);
      }

      return nextOpen;
    });
  }, []);

  const toggleNotifications = useCallback(
    () => setNotificationsOpen((current) => !current),
    []
  );

  const toggleCreateForm = useCallback(
    () => setShowCreateForm((current) => !current),
    []
  );

  const clearSelectedCategories = useCallback(() => setSelectedCategories([]), []);

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
        selectedKind={selectedKind}
        onSelectDishes={selectDishes}
        onSelectDrinks={selectDrinks}
      />
      {dashboardOpen ? (
        <ControlCenterDashboard
          insightStats={insightStats}
          dashboardCharts={dashboardCharts}
        />
      ) : null}
      {message ? <p className="status-message">{message}</p> : null}
      {previewOpen ? <MenuPreviewPanel src={menuPreviewHref} /> : null}
      <MenuAlertsPanel
        notificationsOpen={notificationsOpen}
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
