import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import {
  deleteRestaurantMenuCategory,
  getRestaurantMenuCategories,
  saveRestaurantMenuCategories,
  upsertRestaurantMenuCategory,
  type MenuCategoryDefinition
} from "@/lib/menu-categories";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 8;

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");

  if (!restaurantSlug || !/^[a-z0-9-]+$/i.test(restaurantSlug)) {
    return NextResponse.json(
      { message: "restaurantSlug is required" },
      { status: 400 }
    );
  }

  const categories = await getRestaurantMenuCategories(restaurantSlug);
  return NextResponse.json(categories);
}

export async function PUT(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `menu-categories:put:${clientId}`,
    maxRequests: 20,
    windowMs: 60 * 1000,
    message: "Too many category updates. Please try again later."
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
      categories?: Partial<MenuCategoryDefinition>[];
    };

    if (!body.restaurantSlug || !/^[a-z0-9-]+$/i.test(body.restaurantSlug)) {
      throw new Error("restaurantSlug is required");
    }

    if (!Array.isArray(body.categories)) {
      throw new Error("categories must be an array");
    }

    const categories = await saveRestaurantMenuCategories(
      body.restaurantSlug,
      body.categories
    );
    return NextResponse.json(categories);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `menu-categories:patch:${clientId}`,
    maxRequests: 40,
    windowMs: 60 * 1000,
    message: "Too many category updates. Please try again later."
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
      category?: Partial<MenuCategoryDefinition>;
    };

    if (!body.restaurantSlug || !/^[a-z0-9-]+$/i.test(body.restaurantSlug)) {
      throw new Error("restaurantSlug is required");
    }

    if (!body.category || typeof body.category !== "object") {
      throw new Error("category is required");
    }

    const categories = await upsertRestaurantMenuCategory(
      body.restaurantSlug,
      body.category
    );
    return NextResponse.json(categories);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const clientId = getRequestClientId(request);
  const limited = applyRateLimit({
    id: `menu-categories:delete:${clientId}`,
    maxRequests: 20,
    windowMs: 60 * 1000,
    message: "Too many category deletes. Please try again later."
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
      slug?: string;
    };

    if (!body.restaurantSlug || !/^[a-z0-9-]+$/i.test(body.restaurantSlug)) {
      throw new Error("restaurantSlug is required");
    }

    if (!body.slug || typeof body.slug !== "string") {
      throw new Error("slug is required");
    }

    const categories = await deleteRestaurantMenuCategory(body.restaurantSlug, body.slug);
    return NextResponse.json(categories);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
