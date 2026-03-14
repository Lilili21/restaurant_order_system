import { NextRequest, NextResponse } from "next/server";

import {
  AdminAuthScope,
  clearAdminAccessCookie,
  hasAdminAccess,
  requireSameOrigin,
  setAdminAccessCookie,
  verifyAdminCredentials
} from "@/lib/admin-auth";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";

function isScope(value: string | null): value is AdminAuthScope {
  return value === "admin" || value === "secondary";
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope");

  if (!isScope(scope)) {
    return NextResponse.json({ message: "scope is required" }, { status: 400 });
  }

  return NextResponse.json({
    authorized: await hasAdminAccess(scope)
  });
}

export async function POST(request: NextRequest) {
  try {
    const originError = requireSameOrigin(request);

    if (originError) {
      return originError;
    }

    const clientId = getRequestClientId(request);
    const limited = applyRateLimit({
      id: `admin-auth:${clientId}`,
      maxRequests: 10,
      windowMs: 10 * 60 * 1000,
      message: "Too many sign-in attempts. Please try again later."
    });

    if (limited) {
      return limited;
    }

    const body = (await request.json()) as {
      scope?: AdminAuthScope;
      login?: string;
      password?: string;
      persist?: boolean;
    };

    if (!body.scope || !isScope(body.scope)) {
      throw new Error("scope is required");
    }

    if (!verifyAdminCredentials(body.scope, body.login ?? "", body.password ?? "")) {
      return NextResponse.json(
        { message: "Invalid login or password." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });

    if (body.persist) {
      setAdminAccessCookie(response, body.scope);
    }

    return response;
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
  const originError = requireSameOrigin(request);

  if (originError) {
    return originError;
  }

  const scope = request.nextUrl.searchParams.get("scope");

  if (!isScope(scope)) {
    return NextResponse.json({ message: "scope is required" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  clearAdminAccessCookie(response, scope);
  return response;
}
