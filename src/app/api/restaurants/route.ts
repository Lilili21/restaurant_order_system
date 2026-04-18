import { NextRequest, NextResponse } from "next/server";

import { getRestaurantBySlug, getRestaurants } from "@/lib/restaurants";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const restaurantSlug = (request.nextUrl.searchParams.get("restaurantSlug") ?? "")
    .trim()
    .toLowerCase();

  if (restaurantSlug) {
    const restaurant = await getRestaurantBySlug(restaurantSlug);

    if (!restaurant) {
      return NextResponse.json({ message: "Restaurant not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      description: restaurant.description
    });
  }

  const restaurants = await getRestaurants();
  return NextResponse.json(
    restaurants.map((restaurant) => ({
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      description: restaurant.description
    }))
  );
}
