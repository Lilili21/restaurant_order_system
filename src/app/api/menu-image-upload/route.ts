import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const MENU_IMAGES_BUCKET = process.env.MENU_IMAGES_BUCKET?.trim() || "menu-images";

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif"
};

function normalizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function parseDataUrl(dataUrl: string) {
  const matched = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());

  if (!matched) {
    throw new Error("Invalid data URL.");
  }

  const mimeType = matched[1].toLowerCase();
  const base64 = matched[2];
  const extension = MIME_TO_EXTENSION[mimeType];

  if (!extension) {
    throw new Error(`Unsupported image format: ${mimeType}`);
  }

  return {
    mimeType,
    extension,
    bytes: Buffer.from(base64, "base64")
  };
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminAccess(request, "secondary");

  if (unauthorized) {
    return unauthorized;
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase is not configured for image upload." },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as {
      restaurantSlug?: string;
      itemId?: string;
      imageDataUrl?: string;
    };

    const restaurantSlug = (body.restaurantSlug ?? "").trim().toLowerCase();
    const rawItemId = (body.itemId ?? "").trim() || randomUUID();
    const imageDataUrl = (body.imageDataUrl ?? "").trim();

    if (!restaurantSlug) {
      throw new Error("restaurantSlug is required.");
    }

    if (!imageDataUrl.startsWith("data:image/")) {
      throw new Error("imageDataUrl must be an image data URL.");
    }

    const parsed = parseDataUrl(imageDataUrl);
    const version = Date.now();
    const safeSlug = normalizeSegment(restaurantSlug);
    const safeItemId = normalizeSegment(rawItemId);
    const objectPath = `restaurants/${safeSlug}/items/${safeItemId}/v${version}-md.${parsed.extension}`;

    const { error: uploadError } = await supabase.storage
      .from(MENU_IMAGES_BUCKET)
      .upload(objectPath, parsed.bytes, {
        contentType: parsed.mimeType,
        cacheControl: "31536000",
        upsert: false
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage
      .from(MENU_IMAGES_BUCKET)
      .getPublicUrl(objectPath);

    return NextResponse.json({
      imageUrl: data.publicUrl,
      objectPath
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to upload image." },
      { status: 400 }
    );
  }
}
