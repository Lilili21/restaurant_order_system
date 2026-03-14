"use client";

import { ChangeEvent, useEffect, useState } from "react";

import { TableCountControl } from "@/components/admin/TableCountControl";
import { formatCurrency } from "@/lib/menu";
import { MenuCategory, MenuItem } from "@/lib/types";

const categoryLabels: Record<MenuCategory, string> = {
  starters: "Starters",
  mains: "Main courses",
  drinks: "Drinks",
  desserts: "Desserts"
};

type EditableMenuItem = MenuItem & {
  draftNameHe: string;
  draftNameEn: string;
  draftDescriptionHe: string;
  draftDescriptionEn: string;
  draftPrice: string;
  draftImage: string;
  draftShowImage: boolean;
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
    draftPrice: String(item.price),
    draftImage: item.image,
    draftShowImage: item.showImage ?? true
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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<MenuCategory[]>([]);
  const [newItem, setNewItem] = useState<NewMenuItemDraft>({
    nameHe: "",
    nameEn: "",
    descriptionHe: "",
    descriptionEn: "",
    price: "",
    image: "",
    showImage: true,
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
        };

        setKitchenLoadWarningEnabled(Boolean(settings.kitchenLoadWarningEnabled));
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
  }

  function updateDraft(
    itemId: string,
    field:
      | "draftNameHe"
      | "draftNameEn"
      | "draftDescriptionHe"
      | "draftDescriptionEn"
      | "draftPrice"
      | "draftImage"
      | "draftShowImage"
      | "category",
    value: string | boolean
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    );
  }

  function updateNewItem(
    field: keyof NewMenuItemDraft,
    value: string | boolean
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
        available: currentItem.available,
        category: currentItem.category
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
            <input
              className="modal-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
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

  return (
    <div className="orders-layout">
      {secondaryCredentials ? (
        <div className="admin-menu-tools">
          <TableCountControl credentials={secondaryCredentials} />
        </div>
      ) : null}
      {message ? <p className="status-message">{message}</p> : null}
      <div className="menu-notice-control">
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
            Order preparation may take longer than usual right now due to a busy kitchen.
          </span>
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
              <input
                className="modal-input"
                type="text"
                placeholder="שם המנה"
                value={newItem.nameHe}
                onChange={(event) => updateNewItem("nameHe", event.target.value)}
                dir="rtl"
              />
              <span className="status-pill menu-editor__availability status-pill--served">
                Available
              </span>
            </div>

            <input
              className="modal-input"
              type="text"
              placeholder="Dish name (EN)"
              value={newItem.nameEn}
              onChange={(event) => updateNewItem("nameEn", event.target.value)}
            />

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

            <textarea
              className="modal-input menu-editor__textarea"
              placeholder="תיאור"
              value={newItem.descriptionHe}
              dir="rtl"
              onChange={(event) =>
                updateNewItem("descriptionHe", event.target.value)
              }
            />

            <textarea
              className="modal-input menu-editor__textarea"
              placeholder="Description (EN)"
              value={newItem.descriptionEn}
              onChange={(event) =>
                updateNewItem("descriptionEn", event.target.value)
              }
            />

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

            <div className="menu-editor__meta">
              <label className="menu-editor__toggle">
                <input
                  type="checkbox"
                  checked={newItem.available}
                  onChange={(event) =>
                    updateNewItem("available", event.target.checked)
                  }
                />
                <span>Available</span>
              </label>
            </div>
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
              <input
                className="modal-input"
                type="text"
                placeholder="שם המנה"
                value={item.draftNameHe}
                dir="rtl"
                onChange={(event) =>
                  updateDraft(item.id, "draftNameHe", event.target.value)
                }
              />
              <span
                className={`status-pill menu-editor__availability ${
                  item.available ? "status-pill--served" : "status-pill--cancelled"
                }`}
              >
                {item.available ? "Available" : "Unavailable"}
              </span>
            </div>

            <div className="menu-editor__form">
              <input
                className="modal-input"
                type="text"
                placeholder="Dish name (EN)"
                value={item.draftNameEn}
                onChange={(event) =>
                  updateDraft(item.id, "draftNameEn", event.target.value)
                }
              />

              <select
                className="modal-input"
                value={item.category}
                onChange={(event) =>
                  updateDraft(item.id, "category", event.target.value)
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

              <textarea
                className="modal-input menu-editor__textarea"
                placeholder="תיאור"
                value={item.draftDescriptionHe}
                dir="rtl"
                onChange={(event) =>
                  updateDraft(item.id, "draftDescriptionHe", event.target.value)
                }
              />

              <textarea
                className="modal-input menu-editor__textarea"
                placeholder="Description (EN)"
                value={item.draftDescriptionEn}
                onChange={(event) =>
                  updateDraft(item.id, "draftDescriptionEn", event.target.value)
                }
              />

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

              <div className="menu-editor__meta">
                <label className="menu-editor__toggle">
                  <input
                    type="checkbox"
                    checked={item.available}
                    onChange={() => toggleAvailability(item.id)}
                  />
                  <span>Available</span>
                </label>
              </div>
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
