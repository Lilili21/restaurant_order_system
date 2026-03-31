type ClientCacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

function getStorage(kind: "local" | "session") {
  if (typeof window === "undefined") {
    return null;
  }

  return kind === "local" ? window.localStorage : window.sessionStorage;
}

function readClientCacheValue<T>(
  kind: "local" | "session",
  key: string,
  maxAgeMs: number
) {
  const storage = getStorage(kind);

  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as ClientCacheEnvelope<T>;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.savedAt !== "number" ||
      !("value" in parsed)
    ) {
      storage.removeItem(key);
      return null;
    }

    if (Date.now() - parsed.savedAt > maxAgeMs) {
      storage.removeItem(key);
      return null;
    }

    return parsed.value;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function writeClientCacheValue<T>(
  kind: "local" | "session",
  key: string,
  value: T
) {
  const storage = getStorage(kind);

  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        value
      } satisfies ClientCacheEnvelope<T>)
    );
  } catch {
    // Ignore storage quota and serialization issues in UI cache.
  }
}

export function readSessionCache<T>(key: string, maxAgeMs: number) {
  return readClientCacheValue<T>("session", key, maxAgeMs);
}

export function writeSessionCache<T>(key: string, value: T) {
  writeClientCacheValue("session", key, value);
}

export function readLocalCache<T>(key: string, maxAgeMs: number) {
  return readClientCacheValue<T>("local", key, maxAgeMs);
}

export function writeLocalCache<T>(key: string, value: T) {
  writeClientCacheValue("local", key, value);
}
