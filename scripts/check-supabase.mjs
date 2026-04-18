import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envLocalPath = path.join(process.cwd(), ".env.local");

if (existsSync(envLocalPath)) {
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message) {
  console.error(`\n[Supabase check] ${message}\n`);
  process.exit(1);
}

if (!url) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
}

if (!anonKey) {
  fail("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

console.log("\n[Supabase check] Starting connection checks...");
console.log(`[Supabase check] URL: ${url}`);

const anon = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const { data: anonData, error: anonError } = await anon
  .from("restaurants")
  .select("id, slug")
  .abortSignal(AbortSignal.timeout(10_000))
  .limit(1);

if (anonError) {
  fail(`Anon key check failed: ${anonError.message}`);
}

console.log(
  `[Supabase check] Anon key OK. restaurants rows fetched: ${Array.isArray(anonData) ? anonData.length : 0}`
);

if (!serviceKey) {
  console.log(
    "[Supabase check] SUPABASE_SERVICE_ROLE_KEY is missing. Skipping service-role check."
  );
  process.exit(0);
}

const service = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const { data: serviceData, error: serviceError } = await service
  .from("restaurants")
  .select("id, slug")
  .abortSignal(AbortSignal.timeout(10_000))
  .limit(1);

if (serviceError) {
  fail(`Service role check failed: ${serviceError.message}`);
}

console.log(
  `[Supabase check] Service role OK. restaurants rows fetched: ${
    Array.isArray(serviceData) ? serviceData.length : 0
  }`
);
console.log("[Supabase check] All checks passed.\n");
