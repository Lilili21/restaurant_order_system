"use client";

import { ChangeEvent, useEffect, useState } from "react";

import { formatCurrency } from "@/lib/menu";
import { MenuCategory, MenuItem } from "@/lib/types";

const categoryLabels: Record<MenuCategory, string> = {
  starters: "Закуски",
  mains: "Основные блюда",
  drinks: "Напитки",
  desserts: "Десерты"
};

type EditableMenuItem = MenuItem & {
  draftName: string;
  draftDescription: string;
  draftPrice: string;
  draftImage: string;
  saving?: boolean;
};

type NewMenuItemDraft = {
  name: string;
  description: string;
  price: string;
  image: string;
  category: MenuCategory;
  available: boolean;
  saving: boolean;
};

function toEditableItem(item: MenuItem): EditableMenuItem {
  return {
    ...item,
    draftName: item.name,
    draftDescription: item.description,
    draftPrice: String(item.price),
    draftImage: item.image
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

      reject(new Error("Не удалось прочитать изображение."));
    };

    reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
    reader.readAsDataURL(file);
  });
}

export function MenuEditor() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authOpen, setAuthOpen] = useState(true);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [items, setItems] = useState<EditableMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newItem, setNewItem] = useState<NewMenuItemDraft>({
    name: "",
    description: "",
    price: "",
    image: "",
    category: "starters",
    available: true,
    saving: false
  });

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let cancelled = false;

    async function load() {
      const response = await fetch("/api/menu?restaurantSlug=olive-bistro", {
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as MenuItem[];

      if (!cancelled) {
        setItems(data.map(toEditableItem));
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isAuthorized]);

  function submitAuth() {
    if (login === "admin" && password === "admin") {
      setIsAuthorized(true);
      setAuthError(null);
      setLogin("");
      setPassword("");
      return;
    }

    setAuthError("Неверный логин или пароль.");
  }

  function updateDraft(
    itemId: string,
    field:
      | "draftName"
      | "draftDescription"
      | "draftPrice"
      | "draftImage"
      | "category",
    value: string
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
    setMessage("Картинка удалена.");
  }

  function clearNewImage() {
    updateNewItem("image", "");
    setMessage("Картинка удалена.");
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
      setMessage(`Картинка загружена.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось загрузить картинку."
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
      setMessage("Картинка загружена.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось загрузить картинку."
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: itemId,
        name: currentItem.draftName,
        description: currentItem.draftDescription,
        price: Number(currentItem.draftPrice),
        image: currentItem.draftImage,
        available: currentItem.available,
        category: currentItem.category
      })
    });

    if (!response.ok) {
      setMessage("Не удалось сохранить изменения меню.");
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
    setMessage(`Сохранено: ${updatedItem.name}`);
  }

  async function createItem() {
    if (!newItem.name.trim() || !newItem.price.trim()) {
      setMessage("Для новой позиции заполните название и цену.");
      return;
    }

    setNewItem((current) => ({ ...current, saving: true }));

    const response = await fetch("/api/menu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        restaurantSlug: "olive-bistro",
        name: newItem.name,
        description: newItem.description,
        price: Number(newItem.price),
      image: newItem.image,
      available: newItem.available,
      category: newItem.category
      })
    });

    if (!response.ok) {
      setMessage("Не удалось добавить новую позицию.");
      setNewItem((current) => ({ ...current, saving: false }));
      return;
    }

    const createdItem = (await response.json()) as MenuItem;
    setItems((current) => [toEditableItem(createdItem), ...current]);
    setShowCreateForm(false);
    setNewItem({
      name: "",
      description: "",
      price: "",
      image: "",
      category: "starters",
      available: true,
      saving: false
    });
    setMessage(`Добавлено: ${createdItem.name}`);
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
            aria-label="Закрыть окно"
            onClick={() => setAuthOpen(false)}
          >
            X
          </button>
          <h2 id="menu-auth-title">Вход в меню</h2>
          <div className="modal-form">
            <input
              className="modal-input"
              type="text"
              placeholder="Логин"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
            <input
              className="modal-input"
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {authError ? <p className="modal-error">{authError}</p> : null}
          <div className="modal-actions">
            <button
              className="button-success"
              type="button"
              onClick={submitAuth}
            >
              Войти
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <p className="muted">Вход в редактирование меню отменён.</p>;
  }

  if (loading) {
    return <p className="muted">Загружаем меню...</p>;
  }

  return (
    <div className="orders-layout">
      {message ? <p className="status-message">{message}</p> : null}
      <div className="menu-editor__create">
        <button
          className="button-success"
          type="button"
          onClick={() => setShowCreateForm((current) => !current)}
        >
          {showCreateForm ? "Скрыть форму" : "Добавить блюдо"}
        </button>
      </div>
      <div className="orders-grid">
        {showCreateForm ? (
        <article className="order-card">
          <h3>Добавить блюдо</h3>

          <div className="menu-editor__form">
            <div className="menu-editor__top-row">
              <input
                className="modal-input"
                type="text"
                placeholder="Название блюда"
                value={newItem.name}
                onChange={(event) => updateNewItem("name", event.target.value)}
              />
              <span className="status-pill menu-editor__availability status-pill--served">
                В наличии
              </span>
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

            <textarea
              className="modal-input menu-editor__textarea"
              placeholder="Описание"
              value={newItem.description}
              onChange={(event) =>
                updateNewItem("description", event.target.value)
              }
            />

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

            <label className="menu-editor__field">
              <span>Цена</span>
              <input
                className="modal-input"
                type="number"
                min="0"
                value={newItem.price}
                onChange={(event) => updateNewItem("price", event.target.value)}
              />
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
                <span>В наличии</span>
              </label>
              <strong>{formatCurrency(Number(newItem.price) || 0)}</strong>
            </div>
          </div>

          <div className="order-actions">
            <button
              className="button-success"
              type="button"
              disabled={newItem.saving}
              onClick={() => void createItem()}
            >
              {newItem.saving ? "Добавляем..." : "Добавить"}
            </button>
          </div>
        </article>
        ) : null}

        {items.map((item) => (
          <article key={item.id} className="order-card">
            <div className="menu-editor__top-row">
              <input
                className="modal-input"
                type="text"
                placeholder="Название блюда"
                value={item.draftName}
                onChange={(event) =>
                  updateDraft(item.id, "draftName", event.target.value)
                }
              />
              <span
                className={`status-pill menu-editor__availability ${
                  item.available ? "status-pill--served" : "status-pill--cancelled"
                }`}
              >
                {item.available ? "В наличии" : "Нет в наличии"}
              </span>
            </div>

            <div className="menu-editor__form">
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
                value={item.draftDescription}
                onChange={(event) =>
                  updateDraft(item.id, "draftDescription", event.target.value)
                }
              />

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

              <label className="menu-editor__field">
                <span>Цена</span>
                <input
                  className="modal-input"
                  type="number"
                  min="0"
                  value={item.draftPrice}
                  onChange={(event) =>
                    updateDraft(item.id, "draftPrice", event.target.value)
                  }
                />
              </label>

              <div className="menu-editor__meta">
                <label className="menu-editor__toggle">
                  <input
                    type="checkbox"
                    checked={item.available}
                    onChange={() => toggleAvailability(item.id)}
                  />
                  <span>В наличии</span>
                </label>
                <strong>{formatCurrency(Number(item.draftPrice) || 0)}</strong>
              </div>
            </div>

            <div className="order-actions">
              <button
                className="button-success"
                type="button"
                disabled={item.saving}
                onClick={() => void saveItem(item.id)}
              >
                {item.saving ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
