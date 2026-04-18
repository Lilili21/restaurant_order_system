"use client";

import { useEffect, useRef, useState } from "react";

type MenuSettingsResponse = {
  tableCount?: number;
  tableTokens?: Record<string, string>;
};

type SecondaryCredentials = {
  login: string;
  password: string;
};

type TableCountControlProps = {
  credentials: SecondaryCredentials | null;
  restaurantSlug: string;
  onOpen?: () => void;
};

export function TableCountControl({
  credentials,
  restaurantSlug,
  onOpen
}: TableCountControlProps) {
  const [tableCount, setTableCount] = useState(8);
  const [draftCount, setDraftCount] = useState(8);
  const [tableTokens, setTableTokens] = useState<Record<string, string>>({});
  const [selectedTable, setSelectedTable] = useState("1");
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const lastLoadedAtRef = useRef(0);

  const SETTINGS_CACHE_TTL_MS = 30_000;

  async function loadSettings(force = false) {
    const hasLocalData = Object.keys(tableTokens).length > 0;
    if (
      !force &&
      hasLocalData &&
      Date.now() - lastLoadedAtRef.current < SETTINGS_CACHE_TTL_MS
    ) {
      return true;
    }

    const response = await fetch(
      `/api/menu-settings?restaurantSlug=${encodeURIComponent(
        restaurantSlug
      )}&includeTableTokens=1&fields=tableCount,tableTokens`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return false;
    }

    const settings = (await response.json()) as MenuSettingsResponse;
    const nextCount = settings.tableCount ?? 8;

    setTableCount(nextCount);
    setDraftCount(nextCount);
    setTableTokens(settings.tableTokens ?? {});
    setSelectedTable((current) => {
      const next = Number.parseInt(current, 10);
      if (Number.isFinite(next) && next >= 1 && next <= nextCount) {
        return current;
      }

      return "1";
    });
    lastLoadedAtRef.current = Date.now();

    return true;
  }

  useEffect(() => {
    void loadSettings(true);
  }, [restaurantSlug]);

  async function saveTableCount() {
    setSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(credentials
          ? {
              "x-admin-secondary-login": credentials.login,
              "x-admin-secondary-password": credentials.password
            }
          : {})
      },
      body: JSON.stringify({
        restaurantSlug,
        tableCount: draftCount
      })
    });

    if (!response.ok) {
      setSaving(false);
      return false;
    }

    const settings = (await response.json()) as MenuSettingsResponse;
    const nextCount = settings.tableCount ?? draftCount;
    setTableCount(nextCount);
    setDraftCount(nextCount);
    setTableTokens(settings.tableTokens ?? {});
    setSelectedTable((current) => {
      const next = Number.parseInt(current, 10);
      if (Number.isFinite(next) && next >= 1 && next <= nextCount) {
        return current;
      }

      return "1";
    });
    lastLoadedAtRef.current = Date.now();
    setDialogOpen(false);
    setSaving(false);
    return true;
  }

  function openSelectedTable() {
    const token = tableTokens[selectedTable];

    if (!token) {
      return;
    }

    window.open(`/${restaurantSlug}/menu/${token}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      {dialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="table-count-title"
          >
            <h2 id="table-count-title">Tables QR links</h2>
            <div className="table-count-stepper">
              <button
                className="button-neutral"
                type="button"
                onClick={() => setDraftCount((current) => Math.max(1, current - 1))}
              >
                -
              </button>
              <span>{draftCount}</span>
              <button
                className="button-neutral"
                type="button"
                onClick={() => setDraftCount((current) => current + 1)}
              >
                +
              </button>
            </div>
            <label className="menu-editor__field">
              <span>Open table</span>
              <div className="table-count-open-row">
                <select
                  className="modal-input"
                  value={selectedTable}
                  onChange={(event) => setSelectedTable(event.target.value)}
                >
                  {Array.from({ length: tableCount }, (_, index) => {
                    const number = index + 1;

                    return (
                      <option key={number} value={number}>
                        Table {number}
                      </option>
                    );
                  })}
                </select>
                <button
                  className="button-neutral"
                  type="button"
                  onClick={openSelectedTable}
                  disabled={!tableTokens[selectedTable]}
                >
                  Open
                </button>
              </div>
            </label>
            <div className="modal-actions">
              <button
                className="button-danger"
                type="button"
                aria-label="Close"
                onClick={() => {
                  setDraftCount(tableCount);
                  setDialogOpen(false);
                }}
              >
                ✕
              </button>
              <button
                className="button-success"
                type="button"
                aria-label="Save"
                disabled={saving}
                onClick={() => void saveTableCount()}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        className="admin-menu-bubble admin-table-count-trigger"
        type="button"
        onClick={() => {
          onOpen?.();
          setDialogOpen(true);
          void loadSettings(false);
        }}
      >
        <span>Tables QR links</span>
      </button>
    </>
  );
}
