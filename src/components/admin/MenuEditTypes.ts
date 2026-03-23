"use client";

import { ChangeEvent } from "react";

import { MenuBadge, MenuCategory, MenuItem } from "@/lib/types";

export type EditableMenuItem = MenuItem & {
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

export type NewMenuItemDraft = {
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

export type NewItemField =
  | "nameHe"
  | "nameEn"
  | "descriptionHe"
  | "descriptionEn"
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
  | "draftDescriptionHe"
  | "draftDescriptionEn"
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

export type VolumeRowsParser = (
  value: string
) => Array<{ label: string; price: string }>;

export type VolumeRowUpdater = (
  value: string,
  rowIndex: number,
  field: "label" | "price",
  nextValue: string
) => string;

export type ExistingImageUploader = (
  itemId: string,
  event: ChangeEvent<HTMLInputElement>
) => Promise<void>;
