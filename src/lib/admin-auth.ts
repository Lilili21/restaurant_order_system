import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export type AdminAuthScope = "admin" | "waiter" | "secondary" | "restaurant";

const ADMIN_COOKIE_NAME = "admin_access";
const WAITER_COOKIE_NAME = "waiter_access";
const RESTAURANT_COOKIE_NAME = "restaurant_access";
const ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;
const ADMIN_COOKIE_SECRET_FALLBACK =
  "dev-only-admin-cookie-secret-change-me";

function getRestaurantAccessEnvKeyPrefix(restaurantSlug: string) {
  return restaurantSlug.trim().replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
}

function getConfiguredCredentials(
  scope: AdminAuthScope,
  restaurantSlug?: string
) {
  if (scope === "admin") {
    return {
      login: process.env.ADMIN_LOGIN ?? "user",
      password: process.env.ADMIN_PASSWORD ?? "Liza&Nadya"
    };
  }

  if (scope === "waiter") {
    return {
      login: process.env.WAITER_LOGIN ?? "waiter",
      password: process.env.WAITER_PASSWORD ?? "Liza&Nadya"
    };
  }

  if (scope === "restaurant") {
    const normalizedRestaurantSlug = String(restaurantSlug ?? "").trim();
    const envKeyPrefix = getRestaurantAccessEnvKeyPrefix(normalizedRestaurantSlug);

    return {
      login:
        process.env[`RESTAURANT_ACCESS_LOGIN_${envKeyPrefix}`] ??
        process.env.RESTAURANT_ACCESS_LOGIN ??
        "user",
      password:
        process.env[`RESTAURANT_ACCESS_PASSWORD_${envKeyPrefix}`] ??
        process.env.RESTAURANT_ACCESS_PASSWORD ??
        "Liza&Nadya"
    };
  }

  return {
    login: process.env.ADMIN_SECONDARY_LOGIN ?? "admin",
    password: process.env.ADMIN_SECONDARY_PASSWORD ?? "admin"
  };
}

function getCookieName(scope: AdminAuthScope) {
  if (scope === "restaurant") {
    return RESTAURANT_COOKIE_NAME;
  }

  if (scope === "waiter") {
    return WAITER_COOKIE_NAME;
  }

  return ADMIN_COOKIE_NAME;
}

function matchCredentials(
  configured: { login: string; password: string },
  login: string,
  password: string
) {
  const loginBuffer = Buffer.from(login);
  const configuredLoginBuffer = Buffer.from(configured.login);
  const passwordBuffer = Buffer.from(password);
  const configuredPasswordBuffer = Buffer.from(configured.password);

  const loginMatches =
    loginBuffer.length === configuredLoginBuffer.length &&
    timingSafeEqual(loginBuffer, configuredLoginBuffer);
  const passwordMatches =
    passwordBuffer.length === configuredPasswordBuffer.length &&
    timingSafeEqual(passwordBuffer, configuredPasswordBuffer);

  return loginMatches && passwordMatches;
}

function getCookieSigningKey() {
  return (
    process.env.ADMIN_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ADMIN_COOKIE_SECRET_FALLBACK
  );
}

function signCookiePayload(payload: string) {
  return createHmac("sha256", getCookieSigningKey())
    .update(payload)
    .digest("base64url");
}

function createCookieValue(scope: AdminAuthScope, restaurantSlug?: string) {
  const expiresAt = Date.now() + ADMIN_COOKIE_MAX_AGE_SECONDS * 1000;
  const normalizedRestaurantSlug =
    scope === "restaurant" ? String(restaurantSlug ?? "").trim().toLowerCase() : "";
  const payload =
    scope === "restaurant"
      ? `${scope}.${normalizedRestaurantSlug}.${expiresAt}`
      : `${scope}.${expiresAt}`;
  const signature = signCookiePayload(payload);
  return `${payload}.${signature}`;
}

function verifyCookieValue(
  scope: AdminAuthScope,
  value: string | undefined,
  restaurantSlug?: string
) {
  if (!value) {
    return false;
  }

  const chunks = value.split(".");

  const expectedChunkLength = scope === "restaurant" ? 4 : 3;

  if (chunks.length !== expectedChunkLength) {
    return false;
  }

  const [cookieScope, maybeRestaurantSlug, maybeExpiresAtRaw, maybeSignature] = chunks;
  const expectedRestaurantSlug =
    scope === "restaurant" ? String(restaurantSlug ?? "").trim().toLowerCase() : "";
  const cookieRestaurantSlug = scope === "restaurant" ? maybeRestaurantSlug : "";
  const expiresAtRaw = scope === "restaurant" ? maybeExpiresAtRaw : maybeRestaurantSlug;
  const signature = scope === "restaurant" ? maybeSignature : maybeExpiresAtRaw;

  if (cookieScope !== scope) {
    return false;
  }

  if (scope === "restaurant" && cookieRestaurantSlug !== expectedRestaurantSlug) {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const payload =
    scope === "restaurant"
      ? `${cookieScope}.${cookieRestaurantSlug}.${expiresAtRaw}`
      : `${cookieScope}.${expiresAtRaw}`;
  const expectedSignature = signCookiePayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  return (
    signatureBuffer.length === expectedSignatureBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  );
}

export function verifyAdminCredentials(
  scope: AdminAuthScope,
  login: string,
  password: string,
  restaurantSlug?: string
) {
  return matchCredentials(
    getConfiguredCredentials(scope, restaurantSlug),
    login,
    password
  );
}

function isSafeMethod(method: string) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

export function requireSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const expectedHosts = new Set(
    [
      request.nextUrl.host,
      request.headers.get("x-forwarded-host"),
      request.headers.get("host")
    ].filter((value): value is string => Boolean(value))
  );

  if (origin) {
    try {
      const originHost = new URL(origin).host;

      if (!expectedHosts.has(originHost)) {
        return NextResponse.json({ message: "Forbidden origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ message: "Forbidden origin" }, { status: 403 });
    }
  }

  if (!origin && referer) {
    try {
      const refererHost = new URL(referer).host;

      if (!expectedHosts.has(refererHost)) {
        return NextResponse.json({ message: "Forbidden origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ message: "Forbidden origin" }, { status: 403 });
    }
  }

  if (!origin && !referer) {
    return NextResponse.json({ message: "Forbidden origin" }, { status: 403 });
  }

  return null;
}

export async function hasAdminAccess(scope: AdminAuthScope, restaurantSlug?: string) {
  const cookieStore = await cookies();
  const adminCookieValue = cookieStore.get(getCookieName("admin"))?.value;
  const waiterCookieValue = cookieStore.get(getCookieName("waiter"))?.value;
  const restaurantCookieValue = cookieStore.get(getCookieName("restaurant"))?.value;

  if (scope === "restaurant") {
    return verifyCookieValue("restaurant", restaurantCookieValue, restaurantSlug);
  }

  if (scope === "secondary") {
    return (
      verifyCookieValue("admin", adminCookieValue) ||
      verifyCookieValue("secondary", adminCookieValue)
    );
  }

  if (scope === "waiter") {
    return (
      verifyCookieValue("waiter", waiterCookieValue) ||
      verifyCookieValue("admin", adminCookieValue)
    );
  }

  return verifyCookieValue("admin", adminCookieValue);
}

export function setAdminAccessCookie(
  response: NextResponse,
  scope: AdminAuthScope,
  restaurantSlug?: string
) {
  if (scope === "secondary") {
    return;
  }

  response.cookies.set({
    name: getCookieName(scope),
    value: createCookieValue(scope, restaurantSlug),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS
  });
}

export function clearAdminAccessCookie(
  response: NextResponse,
  scope: AdminAuthScope
) {
  if (scope === "secondary") {
    return;
  }

  response.cookies.set({
    name: getCookieName(scope),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function requireAdminAccess(
  request: NextRequest,
  scope: AdminAuthScope
) {
  if (!isSafeMethod(request.method)) {
    const originError = requireSameOrigin(request);

    if (originError) {
      return originError;
    }
  }

  if (scope === "secondary") {
    const cookieValue = request.cookies.get(getCookieName("admin"))?.value;
    const hasCookieAccess =
      verifyCookieValue("admin", cookieValue) ||
      verifyCookieValue("secondary", cookieValue);

    if (hasCookieAccess) {
      return null;
    }

    const login = request.headers.get("x-admin-secondary-login") ?? "";
    const password = request.headers.get("x-admin-secondary-password") ?? "";

    if (!verifyAdminCredentials("secondary", login, password)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return null;
  }

  const adminCookieValue = request.cookies.get(getCookieName("admin"))?.value;
  const waiterCookieValue = request.cookies.get(getCookieName("waiter"))?.value;

  const hasAccess =
    scope === "waiter"
      ? verifyCookieValue("waiter", waiterCookieValue) ||
        verifyCookieValue("admin", adminCookieValue)
      : verifyCookieValue("admin", adminCookieValue);

  if (!hasAccess) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return null;
}
