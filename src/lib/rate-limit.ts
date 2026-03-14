import "server-only";

import { NextRequest, NextResponse } from "next/server";

type RateLimitRule = {
  id: string;
  maxRequests: number;
  windowMs: number;
  message: string;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __menuAppRateLimitStore: Map<string, RateLimitEntry> | undefined;
}

function getRateLimitStore() {
  globalThis.__menuAppRateLimitStore ??= new Map<string, RateLimitEntry>();
  return globalThis.__menuAppRateLimitStore;
}

export function getRequestClientId(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  return (
    forwardedFor?.split(",")[0]?.trim() ||
    realIp?.trim() ||
    "unknown-client"
  );
}

export function applyRateLimit(rule: RateLimitRule) {
  const store = getRateLimitStore();
  const now = Date.now();

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }

  const existing = store.get(rule.id);

  if (!existing || existing.resetAt <= now) {
    store.set(rule.id, {
      count: 1,
      resetAt: now + rule.windowMs
    });

    return null;
  }

  if (existing.count >= rule.maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000)
    );
    const response = NextResponse.json(
      { message: rule.message },
      { status: 429 }
    );

    response.headers.set("Retry-After", String(retryAfterSeconds));
    return response;
  }

  existing.count += 1;
  store.set(rule.id, existing);
  return null;
}
