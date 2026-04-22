"use client";

import { ChangeEvent } from "react";

import { MenuBadge, MenuCategory, MenuLanguage } from "@/lib/types";
import {
  BadgeOptionsByKind,
  CategoryOptionsByKind,
  DraftField,
  EditableMenuItem,
  ExistingImageUploader,
  VolumeRowsParser,
  VolumeRowUpdater
} from "@/components/admin/MenuEditTypes";

type Props = {
  item: EditableMenuItem;
  enableDishAddons: boolean;
  categoryLabels: Record<MenuCategory, string>;
  getItemKind: (category: MenuCategory) => "dishes" | "drinks";
  getCategoryOptions: CategoryOptionsByKind;
  getBadgeOptionsForKind: BadgeOptionsByKind;
  parseVolumeRows: VolumeRowsParser;
  addVolumeRow: (value: string) => string;
  removeVolumeRow: (value: string) => string;
  updateVolumeRow: VolumeRowUpdater;
  getItemLanguage: (itemId: string) => MenuLanguage;
  setItemLanguage: (itemId: string, language: MenuLanguage) => void;
  expandedDescriptions: Record<string, boolean>;
  toggleItemDescription: (itemId: string) => void;
  updateDraft: (
    itemId: string,
    field: DraftField,
    value: string | boolean | MenuBadge[] | MenuCategory
  ) => void;
  setItemsCategoryDraft: (itemId: string, nextCategory: MenuCategory) => void;
  toggleAvailability: (itemId: string) => Promise<void>;
  uploadExistingImage: ExistingImageUploader;
  clearExistingImage: (itemId: string) => void;
  toggleItemBadge: (itemId: string, badge: MenuBadge) => void;
  removeItem: (itemId: string) => Promise<void>;
  saveItem: (itemId: string) => Promise<void>;
};

export function MenuItemEditCard({
  item,
  enableDishAddons,
  categoryLabels,
  getItemKind,
  getCategoryOptions,
  getBadgeOptionsForKind,
  parseVolumeRows,
  addVolumeRow,
  removeVolumeRow,
  updateVolumeRow,
  getItemLanguage,
  setItemLanguage,
  expandedDescriptions,
  toggleItemDescription,
  updateDraft,
  setItemsCategoryDraft,
  toggleAvailability,
  uploadExistingImage,
  clearExistingImage,
  toggleItemBadge,
  removeItem,
  saveItem
}: Props) {
  const itemKind = getItemKind(item.draftCategory);
  const showVolumeEditor = itemKind === "drinks" || (enableDishAddons && itemKind === "dishes");
  const itemCategoryOptions = getCategoryOptions(itemKind);
  const itemBadgeOptions = getBadgeOptionsForKind(itemKind);
  const itemLanguage = getItemLanguage(item.id);

  return (
    <article className="order-card">
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
                itemLanguage === "he"
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
                itemLanguage === "en"
                  ? "menu-editor__language-chip menu-editor__language-chip--active"
                  : "menu-editor__language-chip"
              }
              onClick={() => setItemLanguage(item.id, "en")}
            >
              EN
            </button>
            <button
              type="button"
              className={
                itemLanguage === "ru"
                  ? "menu-editor__language-chip menu-editor__language-chip--active"
                  : "menu-editor__language-chip"
              }
              onClick={() => setItemLanguage(item.id, "ru")}
            >
              RU
            </button>
          </div>
          <input
            className="modal-input"
            type="text"
            placeholder={
              itemLanguage === "he"
                ? "שם המנה"
                : itemLanguage === "ru"
                  ? "Название блюда"
                  : "Dish name"
            }
            value={
              itemLanguage === "he"
                ? item.draftNameHe
                : itemLanguage === "ru"
                  ? item.draftNameRu
                  : item.draftNameEn
            }
            dir={itemLanguage === "he" ? "rtl" : "ltr"}
            onChange={(event) =>
              updateDraft(
                item.id,
                itemLanguage === "he"
                  ? "draftNameHe"
                  : itemLanguage === "ru"
                    ? "draftNameRu"
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
            disabled={item.saving}
            onChange={() => {
              void toggleAvailability(item.id);
            }}
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
            setItemsCategoryDraft(item.id, event.target.value as MenuCategory)
          }
        >
          {itemCategoryOptions.map((value) => (
            <option key={value} value={value}>
              {categoryLabels[value] ?? value}
            </option>
          ))}
        </select>

        <div className="menu-editor__description-block">
          <button
            className="menu-editor__description-toggle"
            type="button"
            onClick={() => toggleItemDescription(item.id)}
          >
            {expandedDescriptions[item.id] ? "Hide description" : "Show description"}
          </button>
          {expandedDescriptions[item.id] ? (
            <textarea
              className="modal-input menu-editor__textarea"
              placeholder={
                itemLanguage === "he"
                  ? "תיאור"
                  : itemLanguage === "ru"
                    ? "Описание"
                    : "Description"
              }
              value={
                itemLanguage === "he"
                  ? item.draftDescriptionHe
                  : itemLanguage === "ru"
                    ? item.draftDescriptionRu
                    : item.draftDescriptionEn
              }
              dir={itemLanguage === "he" ? "rtl" : "ltr"}
              onChange={(event) =>
                updateDraft(
                  item.id,
                  itemLanguage === "he"
                    ? "draftDescriptionHe"
                    : itemLanguage === "ru"
                      ? "draftDescriptionRu"
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
                  {itemKind === "drinks"
                    ? "Volumes and prices"
                    : itemLanguage === "he"
                      ? "תוספות ומחירים"
                      : itemLanguage === "ru"
                        ? "Добавки и цены"
                        : "Add extras and prices"}
                </span>
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
                      placeholder={
                        itemKind === "drinks"
                          ? "Volume"
                          : itemLanguage === "he"
                            ? "תוספת"
                            : itemLanguage === "ru"
                              ? "Добавка"
                              : "Add-on"
                      }
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
    </article>
  );
}
