"use client";

import { ChangeEvent, memo } from "react";

import { MenuBadge, MenuCategory, MenuLanguage } from "@/lib/types";
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
  selectedKind: "dishes" | "drinks";
  selectedCategories: MenuCategory[];
  categoryLabels: Record<MenuCategory, string>;
  visibleCategories: Array<[MenuCategory, string]>;
  onToggleCategory: (category: MenuCategory) => void;
  onClearSelectedCategories: () => void;
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
  toggleAvailability: (itemId: string) => void;
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
  selectedKind,
  selectedCategories,
  categoryLabels,
  visibleCategories,
  onToggleCategory,
  onClearSelectedCategories,
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
