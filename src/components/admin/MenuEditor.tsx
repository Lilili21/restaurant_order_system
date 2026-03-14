"use client";

import { ChangeEvent, useEffect, useState } from "react";

import { TableCountControl } from "@/components/admin/TableCountControl";
import { formatCurrency } from "@/lib/menu";
import { MenuBadge, MenuCategory, MenuItem } from "@/lib/types";

const categoryLabels: Record<MenuCategory, string> = {
  starters: "🥗 Starters",
  mains: "🍲 Main courses",
  drinks: "🍹 Drinks",
  desserts: "🍰 Desserts"
};

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

type EditableMenuItem = MenuItem & {
  draftNameHe: string;
  draftNameEn: string;
  draftDescriptionHe: string;
  draftDescriptionEn: string;
  draftCategory: MenuCategory;
  draftPrice: string;
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

export function MenuEditor() {
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
  const [selectedCategories, setSelectedCategories] = useState<MenuCategory[]>([]);
  const [newItemLanguage, setNewItemLanguage] = useState<"he" | "en">("he");
  const [newDescriptionExpanded, setNewDescriptionExpanded] = useState(false);
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

  function updateDraft(
    itemId: string,
    field:
      | "draftNameHe"
      | "draftNameEn"
      | "draftDescriptionHe"
      | "draftDescriptionEn"
      | "draftCategory"
      | "draftPrice"
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
        price: Number(currentItem.draftPrice),
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
    if (!newItem.nameHe.trim() || !newItem.price.trim()) {
      setMessage("Fill in the item name and price for the new entry.");
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
        price: Number(newItem.price),
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
      image: "",
      showImage: true,
      badges: [],
      category: "starters",
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

  const filteredItems = items.filter((item) =>
    selectedCategories.length === 0
      ? true
      : selectedCategories.includes(item.category)
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

  return (
    <div className="orders-layout">
      {secondaryCredentials ? (
        <div className="admin-menu-tools">
          <TableCountControl credentials={secondaryCredentials} />
        </div>
      ) : null}
      {message ? <p className="status-message">{message}</p> : null}
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
      <div className="menu-editor__create">
        <button
          className="button-success"
          type="button"
          onClick={() => setShowCreateForm((current) => !current)}
        >
          {showCreateForm ? "Hide form" : "Add new dish"}
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
            All categories
          </button>
          {(Object.entries(categoryLabels) as Array<[MenuCategory, string]>).map(
            ([value, label]) => (
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
            )
          )}
        </div>
      </div>
      <div className="orders-grid">
        {showCreateForm ? (
        <article className="order-card">
          <h3>Add new dish</h3>

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
              {(Object.entries(categoryLabels) as Array<[MenuCategory, string]>).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
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
          </div>

          <div className="menu-editor__badges">
            {badgeOptions.map((badge) => (
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
                onChange={(event) =>
                  updateDraft(
                    item.id,
                    "draftCategory",
                    event.target.value as MenuCategory
                  )
                }
              >
                {(Object.entries(categoryLabels) as Array<[MenuCategory, string]>).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
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

            </div>

            <div className="menu-editor__badges">
              {badgeOptions.map((badge) => (
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
          </article>
        ))}
      </div>
    </div>
  );
}
