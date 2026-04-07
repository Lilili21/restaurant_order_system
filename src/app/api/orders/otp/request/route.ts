import { NextRequest, NextResponse } from "next/server";

import { issueCounterOtp, normalizeDeviceId, normalizePhoneForSecurity, verifyCounterCaptcha } from "@/lib/counter-security";
import { getMenuSettings } from "@/lib/menu-settings";
import { applyRateLimit, getRequestClientId } from "@/lib/rate-limit";
import { auditSecurityEvent } from "@/lib/security-audit";

export const dynamic = "force-dynamic";

function isValidSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[a-z0-9-]+$/.test(value)
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      restaurantSlug?: string;
      phone?: string;
      captchaToken?: string;
      deviceId?: string;
    };

    if (!isValidSlug(body.restaurantSlug)) {
      throw new Error("restaurantSlug is required");
    }

    const phone = normalizePhoneForSecurity(body.phone);

    if (!phone) {
      throw new Error("Phone number is required.");
    }

    const restaurantSlug = body.restaurantSlug;
    const settings = await getMenuSettings(restaurantSlug);

    if (settings.orderMode !== "counter") {
      throw new Error("OTP request is available only in counter mode.");
    }

    if (!settings.requireOtp) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "otp_not_required"
      });
    }

    const clientId = getRequestClientId(request);
    const deviceId =
      normalizeDeviceId(body.deviceId) ??
      normalizeDeviceId(request.headers.get("x-device-id"));
    const limits = [
      applyRateLimit({
        id: `orders:otp:request:ip:${restaurantSlug}:${clientId}`,
        maxRequests: 20,
        windowMs: 60 * 1000,
        message: "Too many OTP requests. Please try again later."
      }),
      applyRateLimit({
        id: `orders:otp:request:phone:${restaurantSlug}:${phone}`,
        maxRequests: 6,
        windowMs: 10 * 60 * 1000,
        message: "Too many OTP requests for this phone. Please try later."
      }),
      deviceId
        ? applyRateLimit({
            id: `orders:otp:request:device:${restaurantSlug}:${deviceId}`,
            maxRequests: 12,
            windowMs: 10 * 60 * 1000,
            message: "Too many OTP requests from this device. Please try later."
          })
        : null
    ];
    const limited = limits.find((response) => response !== null) ?? null;

    if (limited) {
      auditSecurityEvent(
        "counter.otp.request_rate_limited",
        {
          restaurantSlug,
          phone,
          ip: clientId,
          deviceId: deviceId ?? null
        },
        { severity: "warn" }
      );
      return limited;
    }

    const captchaResult = await verifyCounterCaptcha({
      token:
        typeof body.captchaToken === "string" ? body.captchaToken : undefined,
      ip: clientId
    });

    if (!captchaResult.ok) {
      auditSecurityEvent(
        "counter.otp.request_captcha_failed",
        {
          restaurantSlug,
          phone,
          ip: clientId,
          deviceId: deviceId ?? null,
          reason: captchaResult.reason
        },
        { severity: "warn" }
      );
      return NextResponse.json(
        { message: "Captcha validation failed." },
        { status: 400 }
      );
    }

    const otp = issueCounterOtp({
      restaurantSlug,
      phone,
      ip: clientId,
      deviceId
    });

    return NextResponse.json({
      ok: true,
      expiresAt: otp.expiresAt,
      expiresInSec: otp.expiresInSec,
      debugCode: otp.debugCode
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
