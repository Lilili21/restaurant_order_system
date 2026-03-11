import { NextRequest, NextResponse } from "next/server";

import { createMenuItem, getAllMenuItems, updateMenuItem } from "@/lib/menu-store";
import { MenuCategory } from "@/lib/types";

export async function GET(request: NextRequest) {
  const restaurantSlug = request.nextUrl.searchParams.get("restaurantSlug");
  return NextResponse.json(getAllMenuItems(restaurantSlug ?? undefined));
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      description?: string;
      price?: number;
      available?: boolean;
      category?: MenuCategory;
      image?: string;
    };

    if (!body.id) {
      throw new Error("id is required");
    }

    const menuItem = updateMenuItem(body.id, {
      name: body.name,
      description: body.description,
      price: body.price,
      available: body.available,
      category: body.category,
      image: body.image
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
  try {
    const body = (await request.json()) as {
      restaurantSlug?: string;
      name?: string;
      description?: string;
      price?: number;
      available?: boolean;
      category?: MenuCategory;
      image?: string;
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

    const menuItem = createMenuItem({
      restaurantSlug: body.restaurantSlug,
      name: body.name,
      description: body.description ?? "",
      price: body.price,
      available: body.available ?? true,
      category: body.category,
      image: body.image
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
