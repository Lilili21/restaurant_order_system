"use client";

import { ChangeEvent } from "react";

import { MenuBadge, MenuCategory, MenuItem } from "@/lib/types";

export type EditableMenuItem = MenuItem & {
  draftNameHe: string;
  draftNameEn: string;
  draftNameRu: string;
  draftDescriptionHe: string;
  draftDescriptionEn: string;
  draftDescriptionRu: string;
  draftCategory: MenuCategory;
  draftPrice: string;
  draftVolumeOptionsText: string;
  draftImage: string;
  draftShowImage: boolean;
  draftBadges: MenuBadge[];
  saving?: boolean;
};

export type NewMenuItemDraft = {
  nameHe: string;
  nameEn: string;
  nameRu: string;
  descriptionHe: string;
  descriptionEn: string;
  descriptionRu: string;
  price: string;
  volumeOptionsText: string;
  image: string;
  showImage: boolean;
  badges: MenuBadge[];
  category: MenuCategory;
  available: boolean;
  saving: boolean;
};

export type NewItemField =
  | "nameHe"
  | "nameEn"
  | "nameRu"
  | "descriptionHe"
  | "descriptionEn"
  | "descriptionRu"
  | "price"
  | "volumeOptionsText"
  | "image"
  | "showImage"
  | "badges"
  | "category"
  | "available"
  | "saving";

export type DraftField =
  | "draftNameHe"
  | "draftNameEn"
  | "draftNameRu"
  | "draftDescriptionHe"
  | "draftDescriptionEn"
  | "draftDescriptionRu"
  | "draftCategory"
  | "draftPrice"
  | "draftVolumeOptionsText"
  | "draftImage"
  | "draftShowImage"
  | "draftBadges";

export type BadgeOptionsByKind = (
  kind: "dishes" | "drinks"
) => Array<{ value: MenuBadge; label: string }>;

export type CategoryOptionsByKind = (
  kind: "dishes" | "drinks"
) => MenuCategory[];

export type VolumeRow = {
  label: string;
  labelHe: string;
  labelEn: string;
  labelRu: string;
  price: string;
};

export type VolumeRowsParser = (
  value: string,
  kind: "dishes" | "drinks"
) => VolumeRow[];

export type VolumeRowUpdater = (
  value: string,
  kind: "dishes" | "drinks",
  rowIndex: number,
  field: keyof VolumeRow,
  nextValue: string
) => string;

export type ExistingImageUploader = (
  itemId: string,
  event: ChangeEvent<HTMLInputElement>
) => Promise<void>;
