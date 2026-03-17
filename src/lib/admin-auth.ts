import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export type AdminAuthScope = "admin" | "secondary";

const ADMIN_COOKIE_NAME = "admin_access";

function getConfiguredCredentials(scope: AdminAuthScope) {
  if (scope === "admin") {
    return {
      login: process.env.ADMIN_LOGIN ?? "waiter",
      password: process.env.ADMIN_PASSWORD ?? "waiter"
    };
  }

  return {
    login: process.env.ADMIN_SECONDARY_LOGIN ?? "admin",
    password: process.env.ADMIN_SECONDARY_PASSWORD ?? "admin"
  };
}

function getCookieName(scope: AdminAuthScope) {
  return ADMIN_COOKIE_NAME;
}

export function verifyAdminCredentials(
  scope: AdminAuthScope,
  login: string,
  password: string
) {
  const configured = getConfiguredCredentials(scope);
  return login === configured.login && password === configured.password;
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

  return null;
}

export async function hasAdminAccess(scope: AdminAuthScope) {
  if (scope === "secondary") {
    return false;
  }

  const cookieStore = await cookies();
  return cookieStore.get(getCookieName(scope))?.value === "true";
}

export function setAdminAccessCookie(
  response: NextResponse,
  scope: AdminAuthScope
) {
  if (scope === "secondary") {
    return;
  }

  response.cookies.set({
    name: getCookieName(scope),
    value: "true",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
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
  if (scope === "secondary") {
    const login = request.headers.get("x-admin-secondary-login") ?? "";
    const password = request.headers.get("x-admin-secondary-password") ?? "";

    if (!verifyAdminCredentials("secondary", login, password)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return null;
  }

  if (!isSafeMethod(request.method)) {
    const originError = requireSameOrigin(request);

    if (originError) {
      return originError;
    }
  }

  const hasAccess = request.cookies.get(getCookieName(scope))?.value === "true";

  if (!hasAccess) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return null;
}
