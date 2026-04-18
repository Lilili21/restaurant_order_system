import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const MENU_IMAGES_BUCKET = (process.env.MENU_IMAGES_BUCKET || "menu-images").trim();
const APPLY = process.argv.includes("--apply");
const TARGET_RESTAURANT = (
  process.argv.find((arg) => arg.startsWith("--restaurant="))?.split("=")[1] || ""
).trim().toLowerCase();
const LIMIT = Number.parseInt(
  process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || "0",
  10
);

function loadEnvLocal() {
  const envLocalPath = path.join(process.cwd(), ".env.local");

  if (!existsSync(envLocalPath)) {
    return;
  }

  const content = readFileSync(envLocalPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function fail(message) {
  console.error(`\n[image-migration] ${message}\n`);
  process.exit(1);
}

function normalizeSegment(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function isAlreadyStorageUrl(value) {
  return value.includes(`/storage/v1/object/public/${MENU_IMAGES_BUCKET}/`);
}

function parseDataUrl(dataUrl) {
  const matched = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());

  if (!matched) {
    return null;
  }

  const mimeType = matched[1].toLowerCase();
  const base64 = matched[2];
  const extension =
    mimeType === "image/jpeg" || mimeType === "image/jpg"
      ? "jpg"
      : mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : mimeType === "image/avif"
            ? "avif"
            : mimeType === "image/gif"
              ? "gif"
              : null;

  if (!extension) {
    return null;
  }

  return {
    mimeType,
    extension,
    bytes: Buffer.from(base64, "base64")
  };
}

function inferExtensionFromUrl(urlString) {
  const lowered = urlString.toLowerCase();
  if (lowered.includes(".jpg") || lowered.includes(".jpeg")) return "jpg";
  if (lowered.includes(".png")) return "png";
  if (lowered.includes(".webp")) return "webp";
  if (lowered.includes(".avif")) return "avif";
  if (lowered.includes(".gif")) return "gif";
  return "jpg";
}

function mimeFromExtension(extension) {
  if (extension === "jpg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}

async function getImageBytes(imageValue) {
  const trimmed = imageValue.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image/")) {
    return parseDataUrl(trimmed);
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const response = await fetch(trimmed, {
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while downloading image.`);
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const arrayBuffer = await response.arrayBuffer();
    const extension =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : contentType.includes("avif")
            ? "avif"
            : contentType.includes("gif")
              ? "gif"
              : contentType.includes("jpeg") || contentType.includes("jpg")
                ? "jpg"
                : inferExtensionFromUrl(trimmed);

    return {
      mimeType: mimeFromExtension(extension),
      extension,
      bytes: Buffer.from(arrayBuffer)
    };
  }

  if (trimmed.startsWith("/")) {
    const localPath = path.join(process.cwd(), "public", trimmed.replace(/^\/+/, ""));

    if (!existsSync(localPath)) {
      throw new Error(`Local file not found: ${trimmed}`);
    }

    const bytes = readFileSync(localPath);
    const extension = inferExtensionFromUrl(trimmed);

    return {
      mimeType: mimeFromExtension(extension),
      extension,
      bytes
    };
  }

  return null;
}

loadEnvLocal();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  fail("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
}

if (!serviceRoleKey) {
  fail("Missing SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const { data: restaurantsData, error: restaurantsError } = await supabase
  .from("restaurants")
  .select("id, slug");

if (restaurantsError) {
  fail(`Failed to fetch restaurants: ${restaurantsError.message}`);
}

const restaurantSlugById = new Map(
  (restaurantsData || []).map((row) => [row.id, row.slug])
);

let menuItemsQuery = supabase
  .from("menu_items")
  .select("id, restaurant_id, image")
  .not("image", "is", null);

if (TARGET_RESTAURANT) {
  const restaurantId = (restaurantsData || []).find(
    (row) => row.slug === TARGET_RESTAURANT
  )?.id;

  if (!restaurantId) {
    fail(`Restaurant not found for slug: ${TARGET_RESTAURANT}`);
  }

  menuItemsQuery = menuItemsQuery.eq("restaurant_id", restaurantId);
}

if (Number.isFinite(LIMIT) && LIMIT > 0) {
  menuItemsQuery = menuItemsQuery.limit(LIMIT);
}

const { data: menuItems, error: menuItemsError } = await menuItemsQuery;

if (menuItemsError) {
  fail(`Failed to fetch menu items: ${menuItemsError.message}`);
}

const candidates = (menuItems || []).filter((row) => {
  const image = (row.image || "").trim();
  return image && !isAlreadyStorageUrl(image);
});

if (!candidates.length) {
  console.log("[image-migration] Nothing to migrate.");
  process.exit(0);
}

console.log(
  `[image-migration] Found ${candidates.length} image(s) to migrate into bucket "${MENU_IMAGES_BUCKET}".`
);

if (!APPLY) {
  console.log("[image-migration] Dry run mode. Add --apply to execute updates.");
  process.exit(0);
}

let migrated = 0;
let failed = 0;

for (const row of candidates) {
  const image = (row.image || "").trim();
  const restaurantSlug = restaurantSlugById.get(row.restaurant_id);

  if (!restaurantSlug) {
    failed += 1;
    console.log(`- skip ${row.id}: restaurant slug not found`);
    continue;
  }

  try {
    const parsed = await getImageBytes(image);

    if (!parsed) {
      failed += 1;
      console.log(`- skip ${row.id}: unsupported image format "${image.slice(0, 40)}..."`);
      continue;
    }

    const objectPath = `restaurants/${normalizeSegment(restaurantSlug)}/items/${normalizeSegment(row.id)}/migrated-${Date.now()}.${parsed.extension}`;

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

    const { data: publicUrlData } = supabase.storage
      .from(MENU_IMAGES_BUCKET)
      .getPublicUrl(objectPath);
    const nextImageUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("menu_items")
      .update({ image: nextImageUrl })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    migrated += 1;
    console.log(`+ migrated ${row.id}`);
  } catch (error) {
    failed += 1;
    console.log(`- failed ${row.id}: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

console.log(
  `[image-migration] Done. migrated=${migrated}, failed=${failed}, total=${candidates.length}`
);
