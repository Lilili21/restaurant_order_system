"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { ControlCenterDashboard } from "@/components/admin/ControlCenterDashboard";
import { MenuAlertsPanel } from "@/components/admin/MenuAlertsPanel";
import { MenuEditPanel } from "@/components/admin/MenuEditPanel";
import { MenuPreviewPanel } from "@/components/admin/MenuPreviewPanel";
import { ControlCenterToolbar } from "@/components/admin/ControlCenterToolbar";
import { formatCurrency } from "@/lib/menu";
import {
  MenuBadge,
  MenuCategory,
  MenuItem,
  MenuVolumeOption
} from "@/lib/types";

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
  const [happyHourEnabled, setHappyHourEnabled] = useState(false);
  const [happyHourText, setHappyHourText] = useState("");
  const [happyHourCategories, setHappyHourCategories] = useState<MenuCategory[]>([]);
  const [happyHourDiscountPercent, setHappyHourDiscountPercent] = useState("0");
  const [happyHourStartsFrom, setHappyHourStartsFrom] = useState("");
  const [happyHourUntil, setHappyHourUntil] = useState("");
  const [happyHourSaving, setHappyHourSaving] = useState(false);
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
  const [happyHourModalOpen, setHappyHourModalOpen] = useState(false);
  const [happyHourDraftText, setHappyHourDraftText] = useState("");
  const [happyHourDraftCategories, setHappyHourDraftCategories] = useState<
    MenuCategory[]
  >([]);
  const [happyHourDraftDiscountPercent, setHappyHourDraftDiscountPercent] =
    useState("0");
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
        };

        setKitchenLoadWarningEnabled(Boolean(settings.kitchenLoadWarningEnabled));
        setHappyHourEnabled(Boolean(settings.happyHourEnabled));
        const nextHappyHourText =
          typeof settings.happyHourText === "string" ? settings.happyHourText : "";
        setHappyHourText(nextHappyHourText);
        setHappyHourCategories(
          Array.isArray(settings.happyHourCategories)
            ? settings.happyHourCategories
            : []
        );
        setHappyHourDiscountPercent(
          typeof settings.happyHourDiscountPercent === "number"
            ? String(settings.happyHourDiscountPercent)
            : "0"
        );
        setHappyHourStartsFrom(
          settings.happyHourStartsFrom
            ? new Date(settings.happyHourStartsFrom).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
              })
            : ""
        );
        setHappyHourUntil(
          settings.happyHourUntil
            ? new Date(settings.happyHourUntil).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
              })
            : ""
        );
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

  async function saveHappyHourSettings(
    nextEnabled: boolean,
    nextText: string,
    nextCategories: MenuCategory[],
    nextDiscountPercent: string,
    nextStartTime: string,
    nextUntilTime: string
  ) {
    const previousEnabled = happyHourEnabled;
    const previousText = happyHourText;
    const previousCategories = happyHourCategories;
    const previousDiscountPercent = happyHourDiscountPercent;
    const previousStartTime = happyHourStartsFrom;
    const previousUntilTime = happyHourUntil;
    const normalizedText = nextText.trim();
    const normalizedDiscountPercent = Number(
      Number.parseFloat(nextDiscountPercent || "0").toFixed(2)
    );
    const normalizedStartTime = nextStartTime.trim();
    const normalizedUntilTime = nextUntilTime.trim();
    let startIsoValue: string | null = null;
    let untilIsoValue: string | null = null;

    if (
      !Number.isFinite(normalizedDiscountPercent) ||
      normalizedDiscountPercent < 0 ||
      normalizedDiscountPercent > 100
    ) {
      setMessage("Discount must be between 0 and 100.");
      return;
    }

    if (nextEnabled) {
      if (!normalizedStartTime || !normalizedUntilTime) {
        setMessage("Select Happy hour start and end time first.");
        return;
      }
      if (!nextCategories.length) {
        setMessage("Select at least one category for Happy hour.");
        return;
      }

      const [startHours, startMinutes] = normalizedStartTime
        .split(":")
        .map(Number);
      const [untilHours, untilMinutes] = normalizedUntilTime
        .split(":")
        .map(Number);

      if (
        !Number.isFinite(startHours) ||
        !Number.isFinite(startMinutes) ||
        !Number.isFinite(untilHours) ||
        !Number.isFinite(untilMinutes)
      ) {
        setMessage("Invalid Happy hour time.");
        return;
      }

      const startTarget = new Date();
      startTarget.setHours(startHours, startMinutes, 0, 0);
      startIsoValue = startTarget.toISOString();

      const untilTarget = new Date();
      untilTarget.setHours(untilHours, untilMinutes, 0, 0);
      untilIsoValue = untilTarget.toISOString();
    }

    setHappyHourEnabled(nextEnabled);
    setHappyHourText(normalizedText);
    setHappyHourCategories(nextCategories);
    setHappyHourDiscountPercent(String(normalizedDiscountPercent));
    setHappyHourStartsFrom(normalizedStartTime);
    setHappyHourUntil(normalizedUntilTime);
    setHappyHourSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": secondaryCredentials?.login ?? "",
        "x-admin-secondary-password": secondaryCredentials?.password ?? ""
      },
      body: JSON.stringify({
        happyHourEnabled: nextEnabled,
        happyHourText: normalizedText,
        happyHourCategories: nextCategories,
        happyHourDiscountPercent: normalizedDiscountPercent,
        happyHourStartsFrom: nextEnabled ? startIsoValue : null,
        happyHourUntil: nextEnabled ? untilIsoValue : null
      })
    });

    if (!response.ok) {
      setHappyHourEnabled(previousEnabled);
      setHappyHourText(previousText);
      setHappyHourCategories(previousCategories);
      setHappyHourDiscountPercent(previousDiscountPercent);
      setHappyHourStartsFrom(previousStartTime);
      setHappyHourUntil(previousUntilTime);
      setMessage("Failed to update Happy hour.");
      setHappyHourSaving(false);
      return;
    }
    setHappyHourSaving(false);
  }

  const openHappyHourModal = useCallback(function openHappyHourModal() {
    setHappyHourDraftText(happyHourText);
    setHappyHourDraftCategories(happyHourCategories);
    setHappyHourDraftDiscountPercent(happyHourDiscountPercent || "0");
    setHappyHourModalOpen(true);
  }, [happyHourCategories, happyHourDiscountPercent, happyHourText]);

  const toggleHappyHourDraftCategory = useCallback(
    function toggleHappyHourDraftCategory(category: MenuCategory) {
    setHappyHourDraftCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category]
    );
    },
    []
  );

  async function saveHappyHourModal() {
    await saveHappyHourSettings(
      happyHourEnabled,
      happyHourDraftText,
      happyHourDraftCategories,
      happyHourDraftDiscountPercent,
      happyHourStartsFrom,
      happyHourUntil
    );

    setHappyHourModalOpen(false);
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
        happyHourEnabled={happyHourEnabled}
        happyHourSaving={happyHourSaving}
        happyHourModalOpen={happyHourModalOpen}
        happyHourText={happyHourText}
        happyHourCategories={happyHourCategories}
        happyHourDiscountPercent={happyHourDiscountPercent}
        happyHourStartsFrom={happyHourStartsFrom}
        happyHourUntil={happyHourUntil}
        openHappyHourModal={openHappyHourModal}
        saveHappyHourSettings={saveHappyHourSettings}
        setHappyHourStartsFrom={setHappyHourStartsFrom}
        setHappyHourUntil={setHappyHourUntil}
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
        happyHourDraftText={happyHourDraftText}
        setHappyHourDraftText={setHappyHourDraftText}
        happyHourDraftDiscountPercent={happyHourDraftDiscountPercent}
        setHappyHourDraftDiscountPercent={setHappyHourDraftDiscountPercent}
        happyHourDraftCategories={happyHourDraftCategories}
        toggleHappyHourDraftCategory={toggleHappyHourDraftCategory}
        setHappyHourModalOpen={setHappyHourModalOpen}
        saveHappyHourModal={saveHappyHourModal}
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
