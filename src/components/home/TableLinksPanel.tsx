"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TableLinksPanelProps = {
  restaurantSlug: string;
};

type MenuSettingsResponse = {
  tableCount?: number;
  tableTokens?: Record<string, string>;
};

type SecondaryCredentials = {
  login: string;
  password: string;
};

export function TableLinksPanel({
  restaurantSlug
}: TableLinksPanelProps) {
  const [tableCountInput, setTableCountInput] = useState("8");
  const [savedTableCount, setSavedTableCount] = useState(8);
  const [tableCountSaving, setTableCountSaving] = useState(false);
  const [tableTokens, setTableTokens] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

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
        const nextTableCount = settings.tableCount ?? 8;
        setTableCountInput(String(nextTableCount));
        setSavedTableCount(nextTableCount);
        setTableTokens(settings.tableTokens ?? {});
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveTableCount(credentials?: SecondaryCredentials) {
    const nextTableCount = Number.parseInt(tableCountInput, 10);

    if (!Number.isFinite(nextTableCount) || nextTableCount < 1) {
      setMessage("Enter a valid number of tables.");
      return;
    }

    setTableCountSaving(true);
    setMessage(null);

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secondary-login": credentials?.login ?? "",
        "x-admin-secondary-password": credentials?.password ?? ""
      },
      body: JSON.stringify({
        tableCount: nextTableCount
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
      setAuthOpen(true);
      setAuthError(null);
      setTableCountSaving(false);
      return false;
    }

    setMessage("Failed to save the table count.");
    setTableCountSaving(false);
    return false;
  }

  const settings = (await response.json()) as MenuSettingsResponse;
  const appliedTableCount = settings.tableCount ?? nextTableCount;
  setTableCountInput(String(appliedTableCount));
  setSavedTableCount(appliedTableCount);
  setTableTokens(settings.tableTokens ?? {});
  setTableCountSaving(false);
  setMessage("Table count updated.");
  return true;
  }

  async function submitAuth() {
    setAuthError(null);
    const credentials = { login, password };

    const response = await fetch("/api/admin-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scope: "secondary",
        login: credentials.login,
        password: credentials.password,
        persist: false
      })
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      setAuthError(error.message ?? "Invalid login or password.");
      return;
    }

    const saved = await saveTableCount(credentials);

    if (saved) {
      setAuthOpen(false);
      setAuthError(null);
      setLogin("");
      setPassword("");
    }
  }

  const visibleCount = savedTableCount > 0 ? savedTableCount : 0;

  return (
    <>
      {authOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="table-links-auth-title"
          >
            <button
              className="modal-card__close"
              type="button"
              aria-label="Close dialog"
              onClick={() => {
                setAuthOpen(false);
                setAuthError(null);
              }}
            >
              X
            </button>
            <h2 id="table-links-auth-title">Sign in to change tables</h2>
            <div className="modal-form">
              <input
                className="modal-input"
                type="text"
                placeholder="Login"
                value={login}
                onChange={(event) => {
                  setLogin(event.target.value);
                  setAuthError(null);
                }}
              />
              <input
                className="modal-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setAuthError(null);
                }}
              />
            </div>
            {authError ? <p className="modal-error">{authError}</p> : null}
            <div className="modal-actions">
              <button
                className="button-success"
                type="button"
                onClick={() => void submitAuth()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="table-links-panel">
        <div className="table-links-panel__header">
          <div className="table-links-panel__field">
            <span>Set the number of active tables</span>
            <input
              className="modal-input"
              type="number"
              min="1"
              max="100"
              inputMode="numeric"
              value={tableCountInput}
              onChange={(event) => setTableCountInput(event.target.value)}
            />
          </div>
          <button
            className="button-success"
            type="button"
            disabled={tableCountSaving}
            onClick={() => void saveTableCount()}
          >
            {tableCountSaving ? "Saving..." : "Save"}
          </button>
        </div>

        {message ? <p className="status-message">{message}</p> : null}

        <div className="table-links-panel__list">
          {Array.from({ length: visibleCount }, (_, index) => {
            const tableNumber = index + 1;
            const token = tableTokens[String(tableNumber)];

            if (!token) {
              return null;
            }

            return (
              <Link
                key={tableNumber}
                href={`/menu/${restaurantSlug}/${token}`}
                className="table-links-panel__link"
              >
                Table {tableNumber}
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
