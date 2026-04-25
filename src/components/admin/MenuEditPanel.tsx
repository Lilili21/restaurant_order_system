"use client";

import { ChangeEvent, memo } from "react";

import { MenuBadge, MenuCategory, MenuLanguage } from "@/lib/types";
import type { MenuCategoryKind } from "@/lib/menu-categories";
import { MenuCreateCard } from "@/components/admin/MenuCreateCard";
import { MenuItemEditCard } from "@/components/admin/MenuItemEditCard";
import {
  DraftField,
  EditableMenuItem,
  NewItemField,
  NewMenuItemDraft
} from "@/components/admin/MenuEditTypes";

type Props = {
  menuOpen: boolean;
  showCreateForm: boolean;
  onToggleCreateForm: () => void;
  categoryManagerOpen: boolean;
  onToggleCategoryManager: () => void;
  toppingsManagerOpen: boolean;
  onToggleToppingsManager: () => void;
  selectedKind: "dishes" | "drinks";
  enableDishAddons: boolean;
  selectedCategories: MenuCategory[];
  categoryLabels: Record<MenuCategory, string>;
  visibleCategories: Array<[MenuCategory, string]>;
  onToggleCategory: (category: MenuCategory) => void;
  onEditCategoryFromChip: (category: MenuCategory) => void;
  onClearSelectedCategories: () => void;
  editableCategories: Array<{
    slug: string;
    label: string;
    labelHe?: string;
    labelEn?: string;
    labelRu?: string;
    kind: "dishes" | "drinks";
    active: boolean;
  }>;
  editableCategorySlugs: string[];
  categoriesSaving: boolean;
  categoriesMessage: string | null;
  newCategoryLabelHe: string;
  newCategoryLabelEn: string;
  newCategoryLabelRu: string;
  newCategoryKind: Exclude<MenuCategoryKind, "addons">;
  onNewCategoryLabelHeChange: (value: string) => void;
  onNewCategoryLabelEnChange: (value: string) => void;
  onNewCategoryLabelRuChange: (value: string) => void;
  onNewCategoryKindChange: (value: Exclude<MenuCategoryKind, "addons">) => void;
  onAddCategory: () => Promise<void>;
  onSaveCategory: () => Promise<void>;
  onDeleteEditedCategory: () => Promise<void>;
  editingCategorySlug: string | null;
  toppingsSaving: boolean;
  toppingsMessage: string | null;
  editingToppingSlug: string | null;
  newToppingLabelEn: string;
  onNewToppingLabelEnChange: (value: string) => void;
  toppingCategoryOptions: Array<[MenuCategory, string]>;
  selectedToppingCategories: MenuCategory[];
  onToggleToppingCategory: (category: MenuCategory) => void;
  onSaveTopping: () => Promise<void>;
  onDeleteEditedTopping: () => Promise<void>;
  onToggleCategoryActive: (slug: string) => Promise<void>;
  onDeleteCategory: (slug: string) => Promise<void>;
  filteredItems: EditableMenuItem[];
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
  getCategoryOptions: (kind: "dishes" | "drinks") => MenuCategory[];
  getBadgeOptionsForKind: (
    kind: "dishes" | "drinks"
  ) => Array<{ value: MenuBadge; label: string }>;
  parseVolumeRows: (value: string) => Array<{ label: string; price: string }>;
  addVolumeRow: (value: string) => string;
  removeVolumeRow: (value: string) => string;
  updateVolumeRow: (
    value: string,
    rowIndex: number,
    field: "label" | "price",
    nextValue: string
  ) => string;
  getItemKind: (category: MenuCategory) => "dishes" | "drinks";
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
  uploadExistingImage: (
    itemId: string,
    event: ChangeEvent<HTMLInputElement>
  ) => Promise<void>;
  clearExistingImage: (itemId: string) => void;
  toggleItemBadge: (itemId: string, badge: MenuBadge) => void;
  removeItem: (itemId: string) => Promise<void>;
  saveItem: (itemId: string) => Promise<void>;
};

function MenuEditPanelComponent({
  menuOpen,
  showCreateForm,
  onToggleCreateForm,
  categoryManagerOpen,
  onToggleCategoryManager,
  toppingsManagerOpen,
  onToggleToppingsManager,
  selectedKind,
  enableDishAddons,
  selectedCategories,
  categoryLabels,
  visibleCategories,
  onToggleCategory,
  onEditCategoryFromChip,
  onClearSelectedCategories,
  editableCategories,
  editableCategorySlugs,
  categoriesSaving,
  categoriesMessage,
  newCategoryLabelHe,
  newCategoryLabelEn,
  newCategoryLabelRu,
  newCategoryKind,
  onNewCategoryLabelHeChange,
  onNewCategoryLabelEnChange,
  onNewCategoryLabelRuChange,
  onNewCategoryKindChange,
  onAddCategory,
  onSaveCategory,
  onDeleteEditedCategory,
  editingCategorySlug,
  toppingsSaving,
  toppingsMessage,
  editingToppingSlug,
  newToppingLabelEn,
  onNewToppingLabelEnChange,
  toppingCategoryOptions,
  selectedToppingCategories,
  onToggleToppingCategory,
  onSaveTopping,
  onDeleteEditedTopping,
  onToggleCategoryActive,
  onDeleteCategory,
  filteredItems,
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
  updateVolumeRow,
  getItemKind,
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
  if (!menuOpen) {
    return null;
  }

  return (
    <>
      {categoryManagerOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form category-manager-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Categories manager"
          >
            <button
              type="button"
              className="modal-card__close"
              aria-label="Close"
              onClick={onToggleCategoryManager}
            >
              ×
            </button>
            <h2>Categories manager</h2>
            <div className="category-manager-modal__form">
              <input
                className="modal-input"
                value={newCategoryLabelHe}
                onChange={(event) => onNewCategoryLabelHeChange(event.target.value)}
                placeholder="תווית בעברית (HE)"
              />
              <input
                className="modal-input"
                value={newCategoryLabelEn}
                onChange={(event) => onNewCategoryLabelEnChange(event.target.value)}
                placeholder="English label (EN)"
              />
              <input
                className="modal-input"
                value={newCategoryLabelRu}
                onChange={(event) => onNewCategoryLabelRuChange(event.target.value)}
                placeholder="Ярлык на русском (RU)"
              />
              <select
                className="modal-input"
                value={newCategoryKind}
                onChange={(event) =>
                  onNewCategoryKindChange(
                    event.target.value as Exclude<MenuCategoryKind, "addons">
                  )
                }
              >
                <option value="dishes">Dishes</option>
                <option value="drinks">Drinks</option>
              </select>
              {editingCategorySlug ? (
                <div className="modal-actions category-manager-modal__actions">
                  <button
                    type="button"
                    className="button-success category-manager-modal__submit"
                    onClick={() => void onSaveCategory()}
                    disabled={categoriesSaving}
                  >
                    {categoriesSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => void onDeleteEditedCategory()}
                    disabled={categoriesSaving}
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="button-success category-manager-modal__submit"
                  onClick={() => void onAddCategory()}
                  disabled={categoriesSaving}
                >
                  {categoriesSaving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
            {categoriesMessage ? (
              <p className="category-manager-modal__message">{categoriesMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {toppingsManagerOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form category-manager-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Toppings manager"
          >
            <button
              type="button"
              className="modal-card__close"
              aria-label="Close"
              onClick={onToggleToppingsManager}
            >
              ×
            </button>
            <h2>Add toppings</h2>
            <div className="category-manager-modal__form">
              <input
                className="modal-input"
                value={newToppingLabelEn}
                onChange={(event) => onNewToppingLabelEnChange(event.target.value)}
                placeholder="English name (e.g. Sour cream)"
              />
              <details className="category-manager-modal__dropdown">
                <summary className="category-manager-modal__dropdown-summary">
                  Categories ({selectedToppingCategories.length} selected)
                </summary>
                <div className="category-manager-modal__dropdown-list">
                  {toppingCategoryOptions.map(([category, label]) => (
                    <label
                      key={category}
                      className="category-manager-modal__dropdown-item"
                    >
                      <input
                        type="checkbox"
                        checked={selectedToppingCategories.includes(category)}
                        onChange={() => onToggleToppingCategory(category)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </details>
              {editingToppingSlug ? (
                <div className="modal-actions category-manager-modal__actions">
                  <button
                    type="button"
                    className="button-success category-manager-modal__submit"
                    onClick={() => void onSaveTopping()}
                    disabled={toppingsSaving}
                  >
                    {toppingsSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => void onDeleteEditedTopping()}
                    disabled={toppingsSaving}
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="button-success category-manager-modal__submit"
                  onClick={() => void onSaveTopping()}
                  disabled={toppingsSaving}
                >
                  {toppingsSaving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
            {toppingsMessage ? (
              <p className="category-manager-modal__message">{toppingsMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="menu-editor__create">
        <button className="button-success" type="button" onClick={onToggleCreateForm}>
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
            onClick={onClearSelectedCategories}
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
                onClick={() => onToggleCategory(value)}
                onDoubleClick={() => {
                  if (editableCategorySlugs.includes(String(value))) {
                    onEditCategoryFromChip(value);
                  }
                }}
                title="Double click to edit category"
              >
                {label}
              </button>
            ))}
        </div>
      </div>
      <div className="orders-grid">
        {showCreateForm ? (
          <MenuCreateCard
            selectedKind={selectedKind}
            enableDishAddons={enableDishAddons}
            categoryLabels={categoryLabels}
            newItemLanguage={newItemLanguage}
            onSetNewItemLanguage={onSetNewItemLanguage}
            newDescriptionExpanded={newDescriptionExpanded}
            onToggleNewDescription={onToggleNewDescription}
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
          />
        ) : null}

        {filteredItems.map((item) => (
          <MenuItemEditCard
            key={item.id}
            item={item}
            enableDishAddons={enableDishAddons}
            categoryLabels={categoryLabels}
            getItemKind={getItemKind}
            getCategoryOptions={getCategoryOptions}
            getBadgeOptionsForKind={getBadgeOptionsForKind}
            parseVolumeRows={parseVolumeRows}
            addVolumeRow={addVolumeRow}
            removeVolumeRow={removeVolumeRow}
            updateVolumeRow={updateVolumeRow}
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
        ))}
      </div>
    </>
  );
}

export const MenuEditPanel = memo(MenuEditPanelComponent);
