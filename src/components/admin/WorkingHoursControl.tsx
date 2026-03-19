"use client";

import { useEffect, useState } from "react";

type MenuSettingsResponse = {
  workingHoursFrom?: string | null;
  workingHoursUntil?: string | null;
};

type SecondaryCredentials = {
  login: string;
  password: string;
};

type WorkingHoursControlProps = {
  credentials: SecondaryCredentials;
};

export function WorkingHoursControl({ credentials }: WorkingHoursControlProps) {
  const [workingHoursFrom, setWorkingHoursFrom] = useState("");
  const [workingHoursUntil, setWorkingHoursUntil] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftUntil, setDraftUntil] = useState("");
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
      const nextFrom = settings.workingHoursFrom ?? "";
      const nextUntil = settings.workingHoursUntil ?? "";

      if (!cancelled) {
        setWorkingHoursFrom(nextFrom);
        setWorkingHoursUntil(nextUntil);
        setDraftFrom(nextFrom);
        setDraftUntil(nextUntil);
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveWorkingHours() {
    setSaving(true);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": credentials.login,
        "x-admin-secondary-password": credentials.password
      },
      body: JSON.stringify({
        workingHoursFrom: draftFrom || null,
        workingHoursUntil: draftUntil || null
      })
    });

    if (!response.ok) {
      setSaving(false);
      return;
    }

    const settings = (await response.json()) as MenuSettingsResponse;
    const nextFrom = settings.workingHoursFrom ?? "";
    const nextUntil = settings.workingHoursUntil ?? "";
    setWorkingHoursFrom(nextFrom);
    setWorkingHoursUntil(nextUntil);
    setDraftFrom(nextFrom);
    setDraftUntil(nextUntil);
    setSaving(false);
    setDialogOpen(false);
  }

  return (
    <>
      {dialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="working-hours-title"
          >
            <h2 id="working-hours-title">Working hours</h2>
            <label className="menu-editor__field menu-settings-panel__field--compact">
              <span>From</span>
              <div className="menu-time-input">
                <input
                  className="modal-input"
                  type="time"
                  value={draftFrom}
                  placeholder="HH:MM"
                  onChange={(event) => setDraftFrom(event.target.value)}
                />
              </div>
            </label>
            <label className="menu-editor__field menu-settings-panel__field--compact">
              <span>Until</span>
              <div className="menu-time-input">
                <input
                  className="modal-input"
                  type="time"
                  value={draftUntil}
                  placeholder="HH:MM"
                  onChange={(event) => setDraftUntil(event.target.value)}
                />
              </div>
            </label>
            <div className="modal-actions">
              <button
                className="button-danger"
                type="button"
                aria-label="Close"
                onClick={() => {
                  setDraftFrom(workingHoursFrom);
                  setDraftUntil(workingHoursUntil);
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
                onClick={() => void saveWorkingHours()}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        className="admin-menu-bubble"
        type="button"
        onClick={() => {
          setDraftFrom(workingHoursFrom);
          setDraftUntil(workingHoursUntil);
          setDialogOpen(true);
        }}
      >
        Working hours
      </button>
    </>
  );
}

