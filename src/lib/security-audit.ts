import "server-only";

type SecuritySeverity = "info" | "warn" | "critical";

type SecurityAuditEntry = {
  at: string;
  event: string;
  severity: SecuritySeverity;
  payload: Record<string, unknown>;
};

const MAX_AUDIT_ENTRIES = 800;
const ALERT_WINDOW_MS = 5 * 60 * 1000;
const ALERT_THRESHOLD = 12;

declare global {
  // eslint-disable-next-line no-var
  var __menuSecurityAuditLog: SecurityAuditEntry[] | undefined;
  // eslint-disable-next-line no-var
  var __menuSecurityAuditCounters:
    | Map<
        string,
        {
          count: number;
          resetAt: number;
        }
      >
    | undefined;
}

function getAuditLog() {
  globalThis.__menuSecurityAuditLog ??= [];
  return globalThis.__menuSecurityAuditLog;
}

function getAuditCounters() {
  globalThis.__menuSecurityAuditCounters ??= new Map();
  return globalThis.__menuSecurityAuditCounters;
}

function toLogPayload(payload: Record<string, unknown>) {
  const nextPayload = { ...payload };

  if (typeof nextPayload.guestContactPhone === "string") {
    nextPayload.guestContactPhone = nextPayload.guestContactPhone.replace(
      /\d(?=\d{2})/g,
      "*"
    );
  }

  if (typeof nextPayload.phone === "string") {
    nextPayload.phone = nextPayload.phone.replace(/\d(?=\d{2})/g, "*");
  }

  return nextPayload;
}

export function auditSecurityEvent(
  event: string,
  payload: Record<string, unknown> = {},
  options?: {
    severity?: SecuritySeverity;
  }
) {
  const severity = options?.severity ?? "info";
  const at = new Date().toISOString();
  const safePayload = toLogPayload(payload);
  const log = getAuditLog();
  log.unshift({
    at,
    event,
    severity,
    payload: safePayload
  });

  if (log.length > MAX_AUDIT_ENTRIES) {
    log.length = MAX_AUDIT_ENTRIES;
  }

  const counters = getAuditCounters();
  const now = Date.now();

  for (const [key, entry] of counters.entries()) {
    if (entry.resetAt <= now) {
      counters.delete(key);
    }
  }

  const counterKey = `${event}:${severity}`;
  const currentCounter = counters.get(counterKey);

  if (!currentCounter || currentCounter.resetAt <= now) {
    counters.set(counterKey, {
      count: 1,
      resetAt: now + ALERT_WINDOW_MS
    });
  } else {
    currentCounter.count += 1;
    counters.set(counterKey, currentCounter);
  }

  const entry = counters.get(counterKey);
  const shouldAlert =
    severity === "critical" ||
    Boolean(entry && entry.count >= ALERT_THRESHOLD && severity !== "info");

  if (shouldAlert) {
    console.warn("[security-alert]", {
      at,
      event,
      severity,
      countInWindow: entry?.count ?? 1,
      windowMs: ALERT_WINDOW_MS,
      ...safePayload
    });
  }
}

export function getRecentSecurityAuditEvents(limit = 50) {
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  return getAuditLog().slice(0, safeLimit);
}
