function normalizeDisplayOrderNumber(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function extractTailSource(displayOrderNumber: string) {
  const parts = displayOrderNumber.split("-").filter(Boolean);
  return (parts.length ? parts[parts.length - 1] : "") || displayOrderNumber;
}

function extractShortTail(displayOrderNumber: string) {
  const tailSource = extractTailSource(displayOrderNumber);
  const tailDigits = tailSource.replace(/\D/g, "");

  if (tailDigits.length >= 4) {
    return tailDigits.slice(-4);
  }

  if (tailSource.length >= 4) {
    return tailSource.slice(-4).toUpperCase();
  }

  return tailDigits || tailSource;
}

export function getGuestShortOrderNumber(displayOrderNumber: string | null | undefined) {
  const raw = normalizeDisplayOrderNumber(displayOrderNumber);

  if (!raw) {
    return "";
  }

  return extractShortTail(raw);
}

export function getStaffShortOrderNumber(
  displayOrderNumber: string | null | undefined,
  fallbackId: string
) {
  const raw = normalizeDisplayOrderNumber(displayOrderNumber);

  if (!raw) {
    return fallbackId;
  }

  return extractShortTail(raw) || fallbackId;
}

