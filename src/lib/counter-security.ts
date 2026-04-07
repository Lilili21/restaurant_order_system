import "server-only";

import { createHash, randomInt } from "node:crypto";

import { auditSecurityEvent } from "@/lib/security-audit";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 20 * 1000;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

type CounterOtpEntry = {
  codeHash: string;
  expiresAt: number;
  issuedAt: number;
  attempts: number;
};

type CaptchaVerificationResult = {
  ok: boolean;
  reason: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __counterOtpStore: Map<string, CounterOtpEntry> | undefined;
}

function getOtpStore() {
  globalThis.__counterOtpStore ??= new Map();
  return globalThis.__counterOtpStore;
}

function cleanupOtpStore() {
  const store = getOtpStore();
  const now = Date.now();

  for (const [key, value] of store.entries()) {
    if (value.expiresAt <= now) {
      store.delete(key);
    }
  }
}

function normalizeForHash(value: string) {
  return value.trim().toLowerCase();
}

function getOtpSecret() {
  return (
    process.env.COUNTER_OTP_SECRET ||
    process.env.ADMIN_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "menu-counter-otp-secret"
  );
}

function hashOtpCode(phone: string, code: string) {
  return createHash("sha256")
    .update(`${getOtpSecret()}:${normalizeForHash(phone)}:${code.trim()}`)
    .digest("hex");
}

function createOtpStoreKey(restaurantSlug: string, phone: string) {
  return `${restaurantSlug.trim().toLowerCase()}:${normalizeForHash(phone)}`;
}

function shouldExposeDebugOtp() {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return ["1", "true", "yes", "on"].includes(
    (process.env.DEBUG_COUNTER_OTP ?? "").toLowerCase()
  );
}

function createOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function normalizePhoneForSecurity(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/[^\d+]/g, "").trim();

  if (!normalized) {
    return undefined;
  }

  const withoutPlus = normalized.startsWith("+")
    ? normalized.slice(1)
    : normalized;

  if (withoutPlus.length < 7 || withoutPlus.length > 15) {
    return undefined;
  }

  return normalized.startsWith("+") ? normalized : `+${withoutPlus}`;
}

export function normalizeDeviceId(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 120);
}

export function issueCounterOtp(input: {
  restaurantSlug: string;
  phone: string;
  ip?: string;
  deviceId?: string;
}) {
  cleanupOtpStore();

  const phone = normalizePhoneForSecurity(input.phone);

  if (!phone) {
    throw new Error("Phone number is invalid.");
  }

  const now = Date.now();
  const store = getOtpStore();
  const key = createOtpStoreKey(input.restaurantSlug, phone);
  const existing = store.get(key);

  if (existing && now - existing.issuedAt < OTP_RESEND_COOLDOWN_MS) {
    throw new Error("OTP was just sent. Please wait a few seconds.");
  }

  const code = createOtpCode();
  store.set(key, {
    codeHash: hashOtpCode(phone, code),
    expiresAt: now + OTP_TTL_MS,
    issuedAt: now,
    attempts: 0
  });

  auditSecurityEvent(
    "counter.otp.requested",
    {
      restaurantSlug: input.restaurantSlug,
      phone,
      ip: input.ip ?? null,
      deviceId: input.deviceId ?? null
    },
    { severity: "info" }
  );

  const expiresAt = new Date(now + OTP_TTL_MS).toISOString();

  return {
    phone,
    expiresAt,
    expiresInSec: Math.floor(OTP_TTL_MS / 1000),
    debugCode: shouldExposeDebugOtp() ? code : undefined
  };
}

export function verifyCounterOtp(input: {
  restaurantSlug: string;
  phone: string;
  code: string;
  ip?: string;
  deviceId?: string;
}) {
  cleanupOtpStore();
  const phone = normalizePhoneForSecurity(input.phone);
  const code = typeof input.code === "string" ? input.code.trim() : "";

  if (!phone || !/^\d{4,8}$/.test(code)) {
    throw new Error("OTP code is invalid.");
  }

  const key = createOtpStoreKey(input.restaurantSlug, phone);
  const store = getOtpStore();
  const entry = store.get(key);

  if (!entry || entry.expiresAt <= Date.now()) {
    store.delete(key);
    throw new Error("OTP expired. Please request a new code.");
  }

  if (entry.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    store.delete(key);
    auditSecurityEvent(
      "counter.otp.blocked_too_many_attempts",
      {
        restaurantSlug: input.restaurantSlug,
        phone,
        ip: input.ip ?? null,
        deviceId: input.deviceId ?? null
      },
      { severity: "warn" }
    );
    throw new Error("Too many failed OTP attempts. Please request a new code.");
  }

  const matches = hashOtpCode(phone, code) === entry.codeHash;

  if (!matches) {
    entry.attempts += 1;
    store.set(key, entry);
    auditSecurityEvent(
      "counter.otp.verify_failed",
      {
        restaurantSlug: input.restaurantSlug,
        phone,
        ip: input.ip ?? null,
        deviceId: input.deviceId ?? null,
        attempts: entry.attempts
      },
      { severity: "warn" }
    );
    throw new Error("OTP code is incorrect.");
  }

  store.delete(key);
  auditSecurityEvent(
    "counter.otp.verified",
    {
      restaurantSlug: input.restaurantSlug,
      phone,
      ip: input.ip ?? null,
      deviceId: input.deviceId ?? null
    },
    { severity: "info" }
  );
}

function isCaptchaEnabled() {
  return ["1", "true", "yes", "on"].includes(
    (process.env.COUNTER_CAPTCHA_ENABLED ?? "").toLowerCase()
  );
}

function getCaptchaSecret() {
  return process.env.COUNTER_CAPTCHA_SECRET;
}

function getCaptchaVerifyUrl() {
  return (
    process.env.COUNTER_CAPTCHA_VERIFY_URL ??
    "https://challenges.cloudflare.com/turnstile/v0/siteverify"
  );
}

export async function verifyCounterCaptcha(input: {
  token: string | undefined;
  ip?: string;
}): Promise<CaptchaVerificationResult> {
  if (!isCaptchaEnabled()) {
    return {
      ok: true,
      reason: "captcha_disabled"
    };
  }

  const secret = getCaptchaSecret();

  if (!secret) {
    auditSecurityEvent(
      "counter.captcha.misconfigured",
      {
        ip: input.ip ?? null
      },
      { severity: "critical" }
    );
    return {
      ok: false,
      reason: "captcha_not_configured"
    };
  }

  if (!input.token || !input.token.trim()) {
    return {
      ok: false,
      reason: "captcha_missing"
    };
  }

  const formData = new URLSearchParams();
  formData.set("secret", secret);
  formData.set("response", input.token.trim());
  if (input.ip) {
    formData.set("remoteip", input.ip);
  }

  try {
    const response = await fetch(getCaptchaVerifyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString(),
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: "captcha_unavailable"
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
    };

    return {
      ok: Boolean(data.success),
      reason: data.success ? "ok" : "captcha_rejected"
    };
  } catch {
    return {
      ok: false,
      reason: "captcha_unavailable"
    };
  }
}
