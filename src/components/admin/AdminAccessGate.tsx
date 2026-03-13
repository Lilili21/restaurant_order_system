"use client";

import { ReactNode, useEffect, useState } from "react";

type AdminAccessGateProps = {
  children: ReactNode;
};

export function AdminAccessGate({ children }: AdminAccessGateProps) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      const response = await fetch("/api/admin-auth?scope=admin", {
        cache: "no-store"
      });

      if (!response.ok) {
        if (!cancelled) {
          setCheckedAuth(true);
        }
        return;
      }

      const data = (await response.json()) as { authorized?: boolean };

      if (!cancelled) {
        setIsAuthorized(Boolean(data.authorized));
        setCheckedAuth(true);
      }
    }

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAuth() {
    const response = await fetch("/api/admin-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scope: "admin",
        login,
        password,
        persist: true
      })
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      setAuthError(error.message ?? "Invalid login or password.");
      return;
    }

    setIsAuthorized(true);
    setAuthError(null);
    setLogin("");
    setPassword("");
  }

  if (!checkedAuth) {
    return null;
  }

  if (!isAuthorized) {
    return (
      <div className="modal-backdrop" role="presentation">
        <div
          className="modal-card modal-card--form"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-auth-title"
        >
          <h2 id="admin-auth-title">Admin sign in</h2>
          <div className="modal-form">
            <input
              className="modal-input"
              type="text"
              placeholder="Login"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
            <input
              className="modal-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {authError ? <p className="modal-error">{authError}</p> : null}
          <div className="modal-actions">
            <button
              className="button-success"
              type="button"
              onClick={() => void submitAuth()}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
