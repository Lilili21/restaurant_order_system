"use client";

import { useEffect, useState } from "react";

type MenuSettingsResponse = {
  tableCount?: number;
};

type SecondaryCredentials = {
  login: string;
  password: string;
};

type TableCountControlProps = {
  credentials: SecondaryCredentials;
};

export function TableCountControl({ credentials }: TableCountControlProps) {
  const [tableCount, setTableCount] = useState(8);
  const [draftCount, setDraftCount] = useState(8);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const response = await fetch("/api/menu-settings", {
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const settings = (await response.json()) as MenuSettingsResponse;

      if (!cancelled) {
        const nextCount = settings.tableCount ?? 8;
        setTableCount(nextCount);
        setDraftCount(nextCount);
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveTableCount() {
    setSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": credentials.login,
        "x-admin-secondary-password": credentials.password
      },
      body: JSON.stringify({
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
    setSaving(false);
    setDialogOpen(false);
    return true;
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
            <h2 id="table-count-title">change tables number</h2>
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
          setDraftCount(tableCount);
          setDialogOpen(true);
        }}
      >
        <span>
          Change the number
          <br />
          of tables
        </span>
      </button>
    </>
  );
}
