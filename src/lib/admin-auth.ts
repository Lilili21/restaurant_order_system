import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export type AdminAuthScope = "admin" | "secondary";

const ADMIN_COOKIE_NAME = "admin_access";

function getConfiguredCredentials(scope: AdminAuthScope) {
  if (scope === "admin") {
    return {
      login: process.env.ADMIN_LOGIN ?? "admin1",
      password: process.env.ADMIN_PASSWORD ?? "admin1"
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

  const hasAccess = request.cookies.get(getCookieName(scope))?.value === "true";

  if (!hasAccess) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return null;
}
