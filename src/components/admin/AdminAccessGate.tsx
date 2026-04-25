"use client";

import { ReactNode, useEffect, useState } from "react";

type AdminAccessGateProps = {
  children: ReactNode;
  scope?: "admin" | "waiter" | "restaurant";
  title?: string;
  restaurantSlug?: string;
};

export function AdminAccessGate({
  children,
  scope = "admin",
  title,
  restaurantSlug
}: AdminAccessGateProps) {
  const resolvedTitle =
    title ??
    (scope === "waiter"
      ? "Waiter sign in"
      : scope === "restaurant"
        ? "User sign in"
        : "User sign in");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      const params = new URLSearchParams({ scope });

      if (scope === "restaurant" && restaurantSlug) {
        params.set("restaurantSlug", restaurantSlug);
      }

      const response = await fetch(`/api/admin-auth?${params.toString()}`, {
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
  }, [scope, restaurantSlug]);

  async function submitAuth() {
    const response = await fetch("/api/admin-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scope,
        restaurantSlug,
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
    setShowPassword(false);
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
          <h2 id="admin-auth-title">{resolvedTitle}</h2>
          <div className="modal-form">
            <input
              className="modal-input"
              type="text"
              placeholder="Login"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
            <div className="modal-password-field">
              <input
                className="modal-input modal-input--password"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="modal-password-toggle"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {showPassword ? (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.9 5.2A10.9 10.9 0 0112 5c5 0 8.7 4.5 9.8 7-0.5 1.2-1.6 3-3.3 4.5" />
                      <path d="M6.2 6.2C4.4 7.5 3.3 9.4 2.2 12 3.3 14.5 7 19 12 19c1.5 0 2.8-.3 4-.8" />
                    </>
                  ) : (
                    <>
                      <path d="M2.2 12C3.3 9.5 7 5 12 5s8.7 4.5 9.8 7C20.7 14.5 17 19 12 19S3.3 14.5 2.2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
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
