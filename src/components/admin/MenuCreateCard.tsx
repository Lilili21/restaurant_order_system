"use client";

import { ChangeEvent } from "react";

import { MenuBadge, MenuCategory, MenuLanguage } from "@/lib/types";
import {
  BadgeOptionsByKind,
  CategoryOptionsByKind,
  NewItemField,
  NewMenuItemDraft,
  VolumeRowsParser,
  VolumeRowUpdater
} from "@/components/admin/MenuEditTypes";

type Props = {
  selectedKind: "dishes" | "drinks";
  enableDishAddons: boolean;
  categoryLabels: Record<MenuCategory, string>;
  newItemLanguage: MenuLanguage;
  onSetNewItemLanguage: (language: MenuLanguage) => void;
  newDescriptionExpanded: boolean;
  onToggleNewDescription: () => void;
  newItem: NewMenuItemDraft;
  updateNewItem: (
    field: NewItemField,
    value: string | boolean | MenuBadge[] | MenuCategory
  ) => void;
  clearNewImage: () => void;
  uploadNewImage: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  toggleNewBadge: (badge: MenuBadge) => void;
  createItem: () => Promise<void>;
  getCategoryOptions: CategoryOptionsByKind;
  getBadgeOptionsForKind: BadgeOptionsByKind;
  parseVolumeRows: VolumeRowsParser;
  addVolumeRow: (value: string, kind: "dishes" | "drinks") => string;
  removeVolumeRow: (value: string, kind: "dishes" | "drinks") => string;
  updateVolumeRow: VolumeRowUpdater;
};

export function MenuCreateCard({
  selectedKind,
  enableDishAddons,
  categoryLabels,
  newItemLanguage,
  onSetNewItemLanguage,
  newDescriptionExpanded,
  onToggleNewDescription,
  newItem,
  updateNewItem,
  clearNewImage,
  uploadNewImage,
  toggleNewBadge,
  createItem,
  getCategoryOptions,
  getBadgeOptionsForKind,
  parseVolumeRows,
  addVolumeRow,
  removeVolumeRow,
  updateVolumeRow
}: Props) {
  const showVolumeEditor = selectedKind === "drinks" || (enableDishAddons && selectedKind === "dishes");

  return (
    <article className="order-card">
      <h3>Add new</h3>

      <div className="menu-editor__form">
        <div className="menu-editor__top-row">
          <div className="menu-editor__language-block">
            <div
              className="menu-editor__language-toggle"
              role="tablist"
              aria-label="Dish language"
            >
              <button
                type="button"
                className={
                  newItemLanguage === "he"
                    ? "menu-editor__language-chip menu-editor__language-chip--active"
                    : "menu-editor__language-chip"
                }
                onClick={() => onSetNewItemLanguage("he")}
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
                onClick={() => onSetNewItemLanguage("en")}
              >
                EN
              </button>
              <button
                type="button"
                className={
                  newItemLanguage === "ru"
                    ? "menu-editor__language-chip menu-editor__language-chip--active"
                    : "menu-editor__language-chip"
                }
                onClick={() => onSetNewItemLanguage("ru")}
              >
                RU
              </button>
            </div>
            <input
              className="modal-input"
              type="text"
              placeholder={
                newItemLanguage === "he"
                  ? "שם המנה"
                  : newItemLanguage === "ru"
                    ? "Название блюда"
                    : "Dish name"
              }
              value={
                newItemLanguage === "he"
                  ? newItem.nameHe
                  : newItemLanguage === "ru"
                    ? newItem.nameRu
                    : newItem.nameEn
              }
              onChange={(event) =>
                updateNewItem(
                  newItemLanguage === "he"
                    ? "nameHe"
                    : newItemLanguage === "ru"
                      ? "nameRu"
                      : "nameEn",
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
              onChange={(event) => updateNewItem("available", event.target.checked)}
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
              {categoryLabels[value] ?? value}
              </option>
            ))}
        </select>

        <div className="menu-editor__description-block">
          <button
            className="menu-editor__description-toggle"
            type="button"
            onClick={onToggleNewDescription}
          >
            {newDescriptionExpanded ? "Hide description" : "Show description"}
          </button>
          {newDescriptionExpanded ? (
            <textarea
              className="modal-input menu-editor__textarea"
              placeholder={
                newItemLanguage === "he"
                  ? "תיאור"
                  : newItemLanguage === "ru"
                    ? "Описание"
                    : "Description"
              }
              value={
                newItemLanguage === "he"
                  ? newItem.descriptionHe
                  : newItemLanguage === "ru"
                    ? newItem.descriptionRu
                    : newItem.descriptionEn
              }
              dir={newItemLanguage === "he" ? "rtl" : "ltr"}
              onChange={(event) =>
                updateNewItem(
                  newItemLanguage === "he"
                    ? "descriptionHe"
                    : newItemLanguage === "ru"
                      ? "descriptionRu"
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
            onChange={(event) => updateNewItem("showImage", event.target.checked)}
          />
          <span>Image</span>
        </label>

        {newItem.showImage ? (
          <div className="menu-editor__upload">
            <label className="button-neutral menu-editor__upload-icon">
              <svg className="menu-editor__upload-svg" viewBox="0 0 24 24" aria-hidden="true">
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
                onChange={(event) => void uploadNewImage(event)}
              />
            </label>
            <div className="menu-editor__upload-state" />
            <button
              className="button-neutral menu-editor__upload-icon"
              type="button"
              onClick={clearNewImage}
              disabled={!newItem.image}
            >
              <svg className="menu-editor__upload-svg" viewBox="0 0 24 24" aria-hidden="true">
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

        {showVolumeEditor ? (
          <div className="menu-editor__volume-options">
            <div className="menu-editor__field">
              <span className="menu-editor__volume-label">
                <span>
                  {selectedKind === "drinks"
                    ? "Volumes and prices"
                    : newItemLanguage === "he"
                      ? "סוגים ומחירים"
                      : newItemLanguage === "ru"
                        ? "Типы и цены"
                        : "Types and prices"}
                </span>
                <span className="menu-editor__volume-actions">
                  <button
                    className="menu-editor__volume-add"
                    type="button"
                    onClick={() =>
                      updateNewItem(
                        "volumeOptionsText",
                        removeVolumeRow(newItem.volumeOptionsText, selectedKind)
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
                        addVolumeRow(newItem.volumeOptionsText, selectedKind)
                      )
                    }
                  >
                    +
                  </button>
                </span>
              </span>
              <div className="menu-editor__volume-grid">
                {(parseVolumeRows(newItem.volumeOptionsText, selectedKind).length
                  ? parseVolumeRows(newItem.volumeOptionsText, selectedKind)
                  : [{ label: "", labelHe: "", labelEn: "", labelRu: "", price: "" }]
                ).map((row, index) => (
                  <div key={`new-volume-${index}`} className="menu-editor__volume-row">
                    {selectedKind === "drinks" ? (
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
                              selectedKind,
                              index,
                              "label",
                              event.target.value
                            )
                          )
                        }
                      />
                    ) : (
                      <div className="menu-editor__volume-option-fields">
                        <input
                          className="modal-input"
                          type="text"
                          placeholder="סוג בעברית (HE)"
                          dir="rtl"
                          value={row.labelHe}
                          onChange={(event) =>
                            updateNewItem(
                              "volumeOptionsText",
                              updateVolumeRow(
                                newItem.volumeOptionsText,
                                selectedKind,
                                index,
                                "labelHe",
                                event.target.value
                              )
                            )
                          }
                        />
                        <input
                          className="modal-input"
                          type="text"
                          placeholder="Type in English (EN)"
                          value={row.labelEn}
                          onChange={(event) =>
                            updateNewItem(
                              "volumeOptionsText",
                              updateVolumeRow(
                                newItem.volumeOptionsText,
                                selectedKind,
                                index,
                                "labelEn",
                                event.target.value
                              )
                            )
                          }
                        />
                        <input
                          className="modal-input"
                          type="text"
                          placeholder="Тип на русском (RU)"
                          value={row.labelRu}
                          onChange={(event) =>
                            updateNewItem(
                              "volumeOptionsText",
                              updateVolumeRow(
                                newItem.volumeOptionsText,
                                selectedKind,
                                index,
                                "labelRu",
                                event.target.value
                              )
                            )
                          }
                        />
                      </div>
                    )}
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
                              selectedKind,
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
                    event.target.value
                      .replace(",", ".")
                      .replace(/[^\d.]/g, "")
                      .replace(/(\..*)\./g, "$1")
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
  );
}
