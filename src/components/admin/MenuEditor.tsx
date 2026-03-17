"use client";

import { ChangeEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { TableCountControl } from "@/components/admin/TableCountControl";
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
      const price = Number(rawPrice);

      if (!rawLabel || !Number.isFinite(price)) {
        return null;
      }

      return {
        id: `volume_${index}_${rawLabel.replace(/\s+/g, "_")}`,
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

export function MenuEditor() {
  const pathname = usePathname();
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
  const [kitchenOpenEnabled, setKitchenOpenEnabled] = useState(false);
  const [kitchenOpenUntil, setKitchenOpenUntil] = useState("");
  const [kitchenOpenSaving, setKitchenOpenSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedKind, setSelectedKind] = useState<"dishes" | "drinks">("dishes");
  const [selectedCategories, setSelectedCategories] = useState<MenuCategory[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newItemLanguage, setNewItemLanguage] = useState<"he" | "en">("he");
  const [newDescriptionExpanded, setNewDescriptionExpanded] = useState(false);
  const [waiterRedirecting, setWaiterRedirecting] = useState(false);
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
      const [menuResponse, settingsResponse] = await Promise.all([
        fetch("/api/menu?restaurantSlug=olive-bistro", {
          cache: "no-store",
          headers: authHeaders
        }),
        fetch("/api/menu-settings", {
          cache: "no-store"
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
          kitchenOpenEnabled?: boolean;
          kitchenOpenUntil?: string | null;
        };

        setKitchenLoadWarningEnabled(Boolean(settings.kitchenLoadWarningEnabled));
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
      }
    }

    load();

    return () => {
      cancelled = true;
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

  function updateDraft(
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
  }

  function updateNewItem(
    field: keyof NewMenuItemDraft,
    value: string | boolean | MenuBadge[]
  ) {
    setNewItem((current) => ({
      ...current,
      [field]: value
    }));
  }

  function clearExistingImage(itemId: string) {
    updateDraft(itemId, "draftImage", "");
    setMessage("Image removed.");
  }

  function toggleNewBadge(badge: MenuBadge) {
    setNewItem((current) => ({
      ...current,
      badges: current.badges.includes(badge)
        ? current.badges.filter((value) => value !== badge)
        : [...current.badges, badge]
    }));
  }

  function toggleItemBadge(itemId: string, badge: MenuBadge) {
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
  }

  function clearNewImage() {
    updateNewItem("image", "");
    setMessage("Image removed.");
  }

  async function uploadExistingImage(
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
  }

  async function uploadNewImage(event: ChangeEvent<HTMLInputElement>) {
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
  }

  function toggleAvailability(itemId: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, available: !item.available } : item
      )
    );
  }

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

  async function saveKitchenOpenSettings(
    nextEnabled: boolean,
    nextTime: string
  ) {
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
      setMessage("Failed to update kitchen open settings.");
      setKitchenOpenSaving(false);
      return;
    }

    setKitchenOpenSaving(false);
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

  const visibleCategories = (Object.entries(categoryLabels) as Array<
    [MenuCategory, string]
  >).filter(([value]) =>
    selectedKind === "drinks"
      ? drinkCategories.includes(value)
      : value !== "drinks" && !drinkCategories.includes(value)
  );

  const filteredItems = items.filter((item) =>
    (selectedKind === "drinks"
      ? drinkCategories.includes(item.category)
      : !drinkCategories.includes(item.category)) &&
    (selectedCategories.length === 0
      ? true
      : selectedCategories.includes(item.category))
  );

  function toggleCategory(category: MenuCategory) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category]
    );
  }

  function getItemLanguage(itemId: string) {
    return itemLanguages[itemId] ?? "he";
  }

  function setItemLanguage(itemId: string, language: "he" | "en") {
    setItemLanguages((current) => ({ ...current, [itemId]: language }));
  }

  function toggleItemDescription(itemId: string) {
    setExpandedDescriptions((current) => ({
      ...current,
      [itemId]: !current[itemId]
    }));
  }

  const pathSegments = pathname.split("/").filter(Boolean);
  const restaurantSlug =
    pathSegments.length >= 2 && pathSegments[1] === "admin"
      ? pathSegments[0]
      : "olive-bistro";
  const menuPreviewHref = `/${restaurantSlug}/menu/0`;

  return (
    <div className="orders-layout">
      <div className="menu-editor__toolbar">
        <div className="menu-editor__toolbar-row">
          {secondaryCredentials ? <TableCountControl credentials={secondaryCredentials} /> : null}
          <Link href={menuPreviewHref} className="admin-menu-bubble">
            Menu preview
          </Link>
          <button
            className="admin-menu-bubble"
            type="button"
            disabled={waiterRedirecting}
            onClick={() => void openWaiterPanel()}
          >
            Waiter
          </button>
        </div>
        <div className="menu-editor__toolbar-row">
          <div className="admin-switch menu-editor__kind-switch">
            <button
              type="button"
              className={
                selectedKind === "dishes"
                  ? "admin-switch__item menu-editor__kind-button admin-switch__item--active"
                  : "admin-switch__item menu-editor__kind-button"
              }
              onClick={() => {
                setSelectedKind("dishes");
                setSelectedCategories([]);
                setNewItem((current) => ({
                  ...current,
                  category: dishCategories.includes(current.category)
                    ? current.category
                    : "starters",
                  volumeOptionsText: "",
                  badges: current.badges.filter((badge) =>
                    getBadgeOptionsForKind("dishes").some(
                      (option) => option.value === badge
                    )
                  )
                }));
              }}
            >
              Dishes
            </button>
            <button
              type="button"
              className={
                selectedKind === "drinks"
                  ? "admin-switch__item menu-editor__kind-button admin-switch__item--active"
                  : "admin-switch__item menu-editor__kind-button"
              }
              onClick={() => {
                setSelectedKind("drinks");
                setSelectedCategories([]);
                setNewItem((current) => ({
                  ...current,
                  category: drinkCategories.includes(current.category)
                    ? current.category
                    : drinkCategories[0],
                  badges: current.badges.filter((badge) =>
                    getBadgeOptionsForKind("drinks").some(
                      (option) => option.value === badge
                    )
                  )
                }));
              }}
            >
              Drinks
            </button>
          </div>
          <button
            className={
              notificationsOpen
                ? "admin-menu-bubble admin-menu-bubble--active"
                : "admin-menu-bubble"
            }
            type="button"
            onClick={() => setNotificationsOpen((current) => !current)}
          >
            Notifications
          </button>
        </div>
      </div>
      {message ? <p className="status-message">{message}</p> : null}
      {notificationsOpen ? (
        <>
          <div className="menu-notice-control menu-notice-control--inline">
            <label className="menu-notice-control__toggle">
              <input
                type="checkbox"
                checked={kitchenLoadWarningEnabled}
                disabled={kitchenLoadWarningSaving}
                onChange={(event) =>
                  void toggleKitchenLoadWarning(event.target.checked)
                }
              />
              <span
                className={
                  kitchenLoadWarningEnabled
                    ? "menu-notice-control__text menu-notice-control__text--active"
                    : "menu-notice-control__text"
                }
              >
                Due to a high volume of orders, preparation time may be longer than usual. Thank you for your patience.
              </span>
            </label>
          </div>
          <div className="menu-notice-control">
            <label className="menu-notice-control__toggle">
              <input
                type="checkbox"
                checked={kitchenOpenEnabled}
                disabled={kitchenOpenSaving}
                onChange={(event) =>
                  void saveKitchenOpenSettings(
                    event.target.checked,
                    kitchenOpenUntil
                  )
                }
              />
              <span
                className={
                  kitchenOpenEnabled
                    ? "menu-notice-control__text menu-notice-control__text--neutral-active"
                    : "menu-notice-control__text"
                }
              >
                Kitchen open
              </span>
            </label>
            <label className="menu-settings-panel__field menu-settings-panel__field--compact">
              <span>Until</span>
              <input
                className="modal-input"
                type="time"
                value={kitchenOpenUntil}
                disabled={kitchenOpenSaving}
                onChange={(event) => setKitchenOpenUntil(event.target.value)}
                onBlur={() => {
                  if (kitchenOpenEnabled) {
                    void saveKitchenOpenSettings(true, kitchenOpenUntil);
                  }
                }}
              />
            </label>
          </div>
        </>
      ) : null}
      <div className="menu-editor__create">
        <button
          className="button-success"
          type="button"
          onClick={() => setShowCreateForm((current) => !current)}
        >
          {showCreateForm ? "Hide form" : "Add new"}
        </button>
      </div>
      <div className="orders-filter">
        <div className="orders-filter__chips">
          <button
            type="button"
            className={
              selectedCategories.length === 0
                ? "orders-filter__chip orders-filter__chip--active"
                : "orders-filter__chip"
            }
            onClick={() => setSelectedCategories([])}
          >
            {selectedKind === "drinks" ? "All drinks" : "All dishes"}
          </button>
          {visibleCategories.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  selectedCategories.includes(value)
                    ? "orders-filter__chip orders-filter__chip--active"
                    : "orders-filter__chip"
                }
                onClick={() => toggleCategory(value)}
              >
                {label}
              </button>
            ))}
        </div>
      </div>
      <div className="orders-grid">
        {showCreateForm ? (
        <article className="order-card">
          <h3>Add new</h3>

          <div className="menu-editor__form">
            <div className="menu-editor__top-row">
              <div className="menu-editor__language-block">
                <div className="menu-editor__language-toggle" role="tablist" aria-label="Dish language">
                  <button
                    type="button"
                    className={
                      newItemLanguage === "he"
                        ? "menu-editor__language-chip menu-editor__language-chip--active"
                        : "menu-editor__language-chip"
                    }
                    onClick={() => setNewItemLanguage("he")}
                  >
                    HE
                  </button>
                  <button
                    type="button"
                    className={
                      newItemLanguage === "en"
                        ? "menu-editor__language-chip menu-editor__language-chip--active"
                        : "menu-editor__language-chip"
                    }
                    onClick={() => setNewItemLanguage("en")}
                  >
                    EN
                  </button>
                </div>
                <input
                  className="modal-input"
                  type="text"
                  placeholder={newItemLanguage === "he" ? "שם המנה" : "Dish name"}
                  value={newItemLanguage === "he" ? newItem.nameHe : newItem.nameEn}
                  onChange={(event) =>
                    updateNewItem(
                      newItemLanguage === "he" ? "nameHe" : "nameEn",
                      event.target.value
                    )
                  }
                  dir={newItemLanguage === "he" ? "rtl" : "ltr"}
                />
              </div>
              <label className="menu-editor__availability-toggle">
                <input
                  type="checkbox"
                  checked={newItem.available}
                  onChange={(event) =>
                    updateNewItem("available", event.target.checked)
                  }
                />
                <span className="status-pill menu-editor__availability status-pill--served">
                  Available
                </span>
              </label>
            </div>

            <select
              className="modal-input"
              value={newItem.category}
              onChange={(event) =>
                updateNewItem("category", event.target.value as MenuCategory)
              }
            >
              {getCategoryOptions(selectedKind).map((value) => (
                  <option key={value} value={value}>
                    {categoryLabels[value]}
                  </option>
                ))}
            </select>

            <div className="menu-editor__description-block">
              <button
                className="menu-editor__description-toggle"
                type="button"
                onClick={() => setNewDescriptionExpanded((current) => !current)}
              >
                {newDescriptionExpanded ? "Hide description" : "Show description"}
              </button>
            {newDescriptionExpanded ? (
                <textarea
                  className="modal-input menu-editor__textarea"
                  placeholder={newItemLanguage === "he" ? "תיאור" : "Description"}
                  value={
                    newItemLanguage === "he"
                      ? newItem.descriptionHe
                      : newItem.descriptionEn
                  }
                  dir={newItemLanguage === "he" ? "rtl" : "ltr"}
                  onChange={(event) =>
                    updateNewItem(
                      newItemLanguage === "he"
                        ? "descriptionHe"
                        : "descriptionEn",
                      event.target.value
                    )
                  }
                />
              ) : null}
            </div>

            <label className="menu-editor__toggle">
              <input
                type="checkbox"
                checked={newItem.showImage}
                onChange={(event) =>
                  updateNewItem("showImage", event.target.checked)
                }
              />
              <span>Image</span>
            </label>

            {newItem.showImage ? (
              <div className="menu-editor__upload">
                <label className="button-neutral menu-editor__upload-icon">
                  <svg
                    className="menu-editor__upload-svg"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M15 7l-6.5 6.5a3.5 3.5 0 104.95 4.95L21 11a5 5 0 10-7.07-7.07L6.4 11.46"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <input
                    className="menu-editor__file-input"
                    type="file"
                    accept="image/*"
                    onChange={uploadNewImage}
                  />
                </label>
                <div className="menu-editor__upload-state" />
                <button
                  className="button-neutral menu-editor__upload-icon"
                  type="button"
                  onClick={clearNewImage}
                  disabled={!newItem.image}
                >
                  <svg
                    className="menu-editor__upload-svg"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            ) : null}

            {selectedKind === "drinks" ? (
              <div className="menu-editor__volume-options">
                <div className="menu-editor__field">
                  <span className="menu-editor__volume-label">
                    <span>Volumes and prices</span>
                    <span className="menu-editor__volume-actions">
                      <button
                        className="menu-editor__volume-add"
                        type="button"
                        onClick={() =>
                          updateNewItem(
                            "volumeOptionsText",
                            removeVolumeRow(newItem.volumeOptionsText)
                          )
                        }
                      >
                        -
                      </button>
                      <button
                        className="menu-editor__volume-add"
                        type="button"
                        onClick={() =>
                          updateNewItem(
                            "volumeOptionsText",
                            addVolumeRow(newItem.volumeOptionsText)
                          )
                        }
                      >
                        +
                      </button>
                    </span>
                  </span>
                  <div className="menu-editor__volume-grid">
                    {(parseVolumeRows(newItem.volumeOptionsText).length
                      ? parseVolumeRows(newItem.volumeOptionsText)
                      : [{ label: "", price: "" }]
                    ).map((row, index) => (
                      <div key={`new-volume-${index}`} className="menu-editor__volume-row">
                        <input
                          className="modal-input"
                          type="text"
                          placeholder="Volume"
                          value={row.label}
                          onChange={(event) =>
                            updateNewItem(
                              "volumeOptionsText",
                              updateVolumeRow(
                                newItem.volumeOptionsText,
                                index,
                                "label",
                                event.target.value
                              )
                            )
                          }
                        />
                        <div className="menu-editor__price-input menu-editor__volume-price">
                          <input
                            className="modal-input"
                            type="text"
                            inputMode="numeric"
                            placeholder="Price"
                            value={row.price}
                            onChange={(event) =>
                              updateNewItem(
                                "volumeOptionsText",
                                updateVolumeRow(
                                  newItem.volumeOptionsText,
                                  index,
                                  "price",
                                  event.target.value
                                )
                              )
                            }
                          />
                          <span className="menu-editor__price-currency">₪</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

              {selectedKind === "drinks" ? null : (
                <label className="menu-editor__field">
                  <span>Price</span>
                  <div className="menu-editor__price-input">
                    <input
                      className="modal-input"
                      type="text"
                      inputMode="numeric"
                      value={newItem.price}
                      onChange={(event) =>
                        updateNewItem(
                          "price",
                          event.target.value.replace(/[^\d]/g, "")
                        )
                      }
                    />
                    <span className="menu-editor__price-currency">₪</span>
                  </div>
                </label>
              )}
          </div>

          <div className="menu-editor__badges">
            {getBadgeOptionsForKind(selectedKind).map((badge) => (
              <label key={badge.value} className="menu-editor__badge-option">
                <input
                  type="checkbox"
                  checked={newItem.badges.includes(badge.value)}
                  onChange={() => toggleNewBadge(badge.value)}
                />
                <span>{badge.label}</span>
              </label>
            ))}
          </div>

          <div className="order-actions">
            <button
              className="button-success"
              type="button"
              disabled={newItem.saving}
              onClick={() => void createItem()}
            >
              {newItem.saving ? "Adding..." : "Add"}
            </button>
          </div>
        </article>
        ) : null}

        {filteredItems.map((item) => (
          <article key={item.id} className="order-card">
            {(() => {
              const itemKind = getItemKind(item.draftCategory);
              const itemCategoryOptions = getCategoryOptions(itemKind);
              const itemBadgeOptions = getBadgeOptionsForKind(itemKind);

              return (
                <>
            <div className="menu-editor__top-row">
              <div className="menu-editor__language-block">
                <div className="menu-editor__language-toggle" role="tablist" aria-label="Dish language">
                  <button
                    type="button"
                    className={
                      getItemLanguage(item.id) === "he"
                        ? "menu-editor__language-chip menu-editor__language-chip--active"
                        : "menu-editor__language-chip"
                    }
                    onClick={() => setItemLanguage(item.id, "he")}
                  >
                    HE
                  </button>
                  <button
                    type="button"
                    className={
                      getItemLanguage(item.id) === "en"
                        ? "menu-editor__language-chip menu-editor__language-chip--active"
                        : "menu-editor__language-chip"
                    }
                    onClick={() => setItemLanguage(item.id, "en")}
                  >
                    EN
                  </button>
                </div>
                <input
                  className="modal-input"
                  type="text"
                  placeholder={getItemLanguage(item.id) === "he" ? "שם המנה" : "Dish name"}
                  value={
                    getItemLanguage(item.id) === "he"
                      ? item.draftNameHe
                      : item.draftNameEn
                  }
                  dir={getItemLanguage(item.id) === "he" ? "rtl" : "ltr"}
                  onChange={(event) =>
                    updateDraft(
                      item.id,
                      getItemLanguage(item.id) === "he"
                        ? "draftNameHe"
                        : "draftNameEn",
                      event.target.value
                    )
                  }
                />
              </div>
              <label className="menu-editor__availability-toggle">
                <input
                  type="checkbox"
                  checked={item.available}
                  onChange={() => toggleAvailability(item.id)}
                />
                <span
                  className={`status-pill menu-editor__availability ${
                    item.available ? "status-pill--served" : "status-pill--cancelled"
                  }`}
                >
                  {item.available ? "Available" : "Unavailable"}
                </span>
              </label>
            </div>

            <div className="menu-editor__form">
              <select
                className="modal-input"
                value={item.draftCategory}
                onChange={(event) => {
                  const nextCategory = event.target.value as MenuCategory;
                  const nextKind = getItemKind(nextCategory);
                  const allowedBadges = getBadgeOptionsForKind(nextKind).map(
                    (badge) => badge.value
                  );

                  setItems((current) =>
                    current.map((currentItem) =>
                      currentItem.id === item.id
                        ? {
                            ...currentItem,
                            draftCategory: nextCategory,
                            draftVolumeOptionsText:
                              nextKind === "drinks"
                                ? currentItem.draftVolumeOptionsText
                                : "",
                            draftBadges: currentItem.draftBadges.filter((badge) =>
                              allowedBadges.includes(badge)
                            )
                          }
                        : currentItem
                    )
                  );
                }}
              >
                {itemCategoryOptions.map((value) => (
                    <option key={value} value={value}>
                      {categoryLabels[value]}
                    </option>
                ))}
              </select>

              <div className="menu-editor__description-block">
                <button
                  className="menu-editor__description-toggle"
                  type="button"
                  onClick={() => toggleItemDescription(item.id)}
                >
                  {expandedDescriptions[item.id]
                    ? "Hide description"
                    : "Show description"}
                </button>
                {expandedDescriptions[item.id] ? (
                  <textarea
                    className="modal-input menu-editor__textarea"
                    placeholder={
                      getItemLanguage(item.id) === "he" ? "תיאור" : "Description"
                    }
                    value={
                      getItemLanguage(item.id) === "he"
                        ? item.draftDescriptionHe
                        : item.draftDescriptionEn
                    }
                    dir={getItemLanguage(item.id) === "he" ? "rtl" : "ltr"}
                    onChange={(event) =>
                      updateDraft(
                        item.id,
                        getItemLanguage(item.id) === "he"
                          ? "draftDescriptionHe"
                          : "draftDescriptionEn",
                        event.target.value
                      )
                    }
                  />
                ) : null}
              </div>

              <label className="menu-editor__toggle">
                <input
                  type="checkbox"
                  checked={item.draftShowImage}
                  onChange={(event) =>
                    updateDraft(item.id, "draftShowImage", event.target.checked)
                  }
                />
                <span>Image</span>
              </label>

              {item.draftShowImage ? (
                <div className="menu-editor__upload">
                  <label className="button-neutral menu-editor__upload-icon">
                    <svg
                      className="menu-editor__upload-svg"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M15 7l-6.5 6.5a3.5 3.5 0 104.95 4.95L21 11a5 5 0 10-7.07-7.07L6.4 11.46"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <input
                      className="menu-editor__file-input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => void uploadExistingImage(item.id, event)}
                    />
                  </label>
                  <div className="menu-editor__upload-state" />
                  <button
                    className="button-neutral menu-editor__upload-icon"
                    type="button"
                    onClick={() => clearExistingImage(item.id)}
                    disabled={!item.draftImage}
                  >
                    <svg
                      className="menu-editor__upload-svg"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              ) : null}

              {itemKind === "drinks" ? (
                <div className="menu-editor__volume-options">
                  <div className="menu-editor__field">
                    <span className="menu-editor__volume-label">
                      <span>Volumes and prices</span>
                      <span className="menu-editor__volume-actions">
                        <button
                          className="menu-editor__volume-add"
                          type="button"
                          onClick={() =>
                            updateDraft(
                              item.id,
                              "draftVolumeOptionsText",
                              removeVolumeRow(item.draftVolumeOptionsText)
                            )
                          }
                        >
                          -
                        </button>
                        <button
                          className="menu-editor__volume-add"
                          type="button"
                          onClick={() =>
                            updateDraft(
                              item.id,
                              "draftVolumeOptionsText",
                              addVolumeRow(item.draftVolumeOptionsText)
                            )
                          }
                        >
                          +
                        </button>
                      </span>
                    </span>
                    <div className="menu-editor__volume-grid">
                      {(parseVolumeRows(item.draftVolumeOptionsText).length
                        ? parseVolumeRows(item.draftVolumeOptionsText)
                        : [{ label: "", price: "" }]
                      ).map((row, index) => (
                        <div key={`${item.id}-volume-${index}`} className="menu-editor__volume-row">
                          <input
                            className="modal-input"
                            type="text"
                            placeholder="Volume"
                            value={row.label}
                            onChange={(event) =>
                              updateDraft(
                                item.id,
                                "draftVolumeOptionsText",
                                updateVolumeRow(
                                  item.draftVolumeOptionsText,
                                  index,
                                  "label",
                                  event.target.value
                                )
                              )
                            }
                          />
                        <div className="menu-editor__price-input menu-editor__volume-price">
                          <input
                              className="modal-input"
                              type="text"
                              inputMode="numeric"
                              placeholder="Price"
                              value={row.price}
                              onChange={(event) =>
                                updateDraft(
                                  item.id,
                                  "draftVolumeOptionsText",
                                  updateVolumeRow(
                                    item.draftVolumeOptionsText,
                                    index,
                                    "price",
                                    event.target.value
                                  )
                                )
                              }
                            />
                            <span className="menu-editor__price-currency">₪</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {itemKind === "drinks" ? null : (
                <label className="menu-editor__field">
                  <span>Price</span>
                  <div className="menu-editor__price-input">
                    <input
                      className="modal-input"
                      type="text"
                      inputMode="numeric"
                      value={item.draftPrice}
                      onChange={(event) =>
                        updateDraft(
                          item.id,
                          "draftPrice",
                          event.target.value.replace(/[^\d]/g, "")
                        )
                      }
                    />
                    <span className="menu-editor__price-currency">₪</span>
                  </div>
                </label>
              )}

            </div>

            <div className="menu-editor__badges">
              {itemBadgeOptions.map((badge) => (
                <label key={badge.value} className="menu-editor__badge-option">
                  <input
                    type="checkbox"
                    checked={item.draftBadges.includes(badge.value)}
                    onChange={() => toggleItemBadge(item.id, badge.value)}
                  />
                  <span>{badge.label}</span>
                </label>
              ))}
            </div>

            <div className="order-actions">
              <button
                className="button-danger"
                type="button"
                onClick={() => void removeItem(item.id)}
              >
                Delete
              </button>
              <button
                className="button-success"
                type="button"
                disabled={item.saving}
                onClick={() => void saveItem(item.id)}
              >
                {item.saving ? "Saving..." : "Save"}
              </button>
            </div>
                </>
              );
            })()}
          </article>
        ))}
      </div>
    </div>
  );
}
