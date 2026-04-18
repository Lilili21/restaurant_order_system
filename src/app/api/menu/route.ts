import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import {
  createMenuItem,
  deleteMenuItem,
  getAllMenuItems,
  updateMenuItem
} from "@/lib/menu-store";
import { MenuBadge, MenuCategory, MenuVolumeOption } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 8;

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");
  const isValidSlug =
    typeof restaurantSlug === "string" &&
    /^[a-z0-9-]+$/.test(restaurantSlug);

  if (!isValidSlug) {
    return NextResponse.json(
      { message: "restaurantSlug is required" },
      { status: 400 }
    );
  }

  return NextResponse.json(await getAllMenuItems(restaurantSlug));
}

export async function PATCH(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `menu:patch:${clientId}`,
    maxRequests: 40,
    windowMs: 60 * 1000,
    message: "Too many menu updates. Please try again later."
  });

  if (limited) {
    return limited;
  }

  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      description?: string;
      nameHe?: string;
      nameEn?: string;
      nameRu?: string;
      descriptionHe?: string;
      descriptionEn?: string;
      descriptionRu?: string;
      price?: number;
      available?: boolean;
      showImage?: boolean;
      category?: MenuCategory;
      image?: string;
      badges?: MenuBadge[];
      volumeOptions?: MenuVolumeOption[];
    };

    if (!body.id) {
      throw new Error("id is required");
    }

    const menuItem = await updateMenuItem(body.id, {
      name: body.name,
      description: body.description,
      nameHe: body.nameHe,
      nameEn: body.nameEn,
      nameRu: body.nameRu,
      descriptionHe: body.descriptionHe,
      descriptionEn: body.descriptionEn,
      descriptionRu: body.descriptionRu,
      price: body.price,
      available: body.available,
      showImage: body.showImage,
      category: body.category,
      image: body.image,
      badges: body.badges,
      volumeOptions: body.volumeOptions
    });

    return NextResponse.json(menuItem);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `menu:post:${clientId}`,
    maxRequests: 20,
    windowMs: 60 * 1000,
    message: "Too many menu create requests. Please try again later."
  });

  if (limited) {
    return limited;
  }

  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as {
      restaurantSlug?: string;
      name?: string;
      description?: string;
      nameHe?: string;
      nameEn?: string;
      nameRu?: string;
      descriptionHe?: string;
      descriptionEn?: string;
      descriptionRu?: string;
      price?: number;
      available?: boolean;
      showImage?: boolean;
      category?: MenuCategory;
      image?: string;
      badges?: MenuBadge[];
      volumeOptions?: MenuVolumeOption[];
    };

    if (!body.restaurantSlug) {
      throw new Error("restaurantSlug is required");
    }

    if (!body.name?.trim()) {
      throw new Error("name is required");
    }

    if (typeof body.price !== "number" || !Number.isFinite(body.price)) {
      throw new Error("price is required");
    }

    if (!body.category) {
      throw new Error("category is required");
    }

    const menuItem = await createMenuItem({
      restaurantSlug: body.restaurantSlug,
      name: body.name,
      description: body.description ?? "",
      nameHe: body.nameHe ?? body.name,
      nameEn: body.nameEn ?? body.name,
      nameRu: body.nameRu ?? body.nameEn ?? body.name,
      descriptionHe: body.descriptionHe ?? body.description ?? "",
      descriptionEn: body.descriptionEn ?? body.description ?? "",
      descriptionRu:
        body.descriptionRu ?? body.descriptionEn ?? body.description ?? "",
      price: body.price,
      available: body.available ?? true,
      showImage: body.showImage ?? true,
      category: body.category,
      image: body.image ?? "",
      badges: body.badges,
      volumeOptions: body.volumeOptions
    });

    return NextResponse.json(menuItem, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `menu:delete:${clientId}`,
    maxRequests: 20,
    windowMs: 60 * 1000,
    message: "Too many menu delete requests. Please try again later."
  });

  if (limited) {
    return limited;
  }

  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as { id?: string };

    if (!body.id) {
      throw new Error("id is required");
    }

    return NextResponse.json(await deleteMenuItem(body.id));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
