"use client";

import { useEffect, useState } from "react";

import { formatCurrency } from "@/lib/menu";
import { ClosedTableSummary, TableOverview } from "@/lib/types";

type TablesResponse = {
  tables: TableOverview[];
  closedSessions: ClosedTableSummary[];
};

type SessionItemSummary = {
  key: string;
  name: string;
  quantity: number;
  total: number;
};

function groupSessionItems(table: TableOverview): SessionItemSummary[] {
  const grouped = new Map<string, SessionItemSummary>();

  for (const order of table.orders) {
    for (const item of order.items) {
      const key = item.menuItemId;
      const existing = grouped.get(key);

      if (existing) {
        existing.quantity += item.quantity;
        existing.total += item.price * item.quantity;
        continue;
      }

      grouped.set(key, {
        key,
        name: item.name,
        quantity: item.quantity,
        total: item.price * item.quantity
      });
    }
  }

  return [...grouped.values()];
}

function groupClosedSessionItems(session: ClosedTableSummary): SessionItemSummary[] {
  const grouped = new Map<string, SessionItemSummary>();

  for (const order of session.orders) {
    for (const item of order.items) {
      const key = item.menuItemId;
      const existing = grouped.get(key);

      if (existing) {
        existing.quantity += item.quantity;
        existing.total += item.price * item.quantity;
        continue;
      }

      grouped.set(key, {
        key,
        name: item.name,
        quantity: item.quantity,
        total: item.price * item.quantity
      });
    }
  }

  return [...grouped.values()];
}

export function TablesOverview() {
  const [data, setData] = useState<TablesResponse>({
    tables: [],
    closedSessions: []
  });
  const [loading, setLoading] = useState(true);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [moveAuthTable, setMoveAuthTable] = useState<TableOverview | null>(null);
  const [targetTableNumber, setTargetTableNumber] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.visibilityState === "hidden") {
        return;
      }

      const response = await fetch("/api/tables");
      const nextData = (await response.json()) as TablesResponse;

      if (!cancelled) {
        setData(nextData);
        setLoading(false);
      }
    }

    load();
    const intervalId = window.setInterval(load, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  async function handleCloseTable(restaurantSlug: string, tableNumber: number) {
    const response = await fetch("/api/tables", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ restaurantSlug, tableNumber })
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      setDialogMessage(error.message ?? "Failed to close the table.");
      return;
    }

    const summary = (await response.json()) as ClosedTableSummary;
    setDialogMessage(
      `Table ${summary.tableNumber} closed. Session #${summary.sessionId}: ${formatCurrency(summary.total)}.`
    );

    setData((current) => ({
      tables: current.tables.filter(
        (table) =>
          !(
            table.restaurantSlug === restaurantSlug &&
            table.tableNumber === tableNumber
          )
      ),
      closedSessions: [summary, ...current.closedSessions]
    }));
  }

  function requestMoveTable(table: TableOverview) {
    setMoveAuthTable(table);
    setTargetTableNumber("");
    setLogin("");
    setPassword("");
    setShowPassword(false);
    setAuthError(null);
  }

  function closeMoveDialog() {
    setMoveAuthTable(null);
    setTargetTableNumber("");
    setLogin("");
    setPassword("");
    setAuthError(null);
  }

  async function submitMoveTable() {
    if (!moveAuthTable) {
      return;
    }

    const nextTableNumber = Number.parseInt(targetTableNumber, 10);

    if (!Number.isFinite(nextTableNumber) || nextTableNumber < 1) {
      setAuthError("Enter a valid table number.");
      return;
    }

    const authResponse = await fetch("/api/admin-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scope: "secondary",
        login,
        password,
        persist: false
      })
    });

    if (!authResponse.ok) {
      const error = (await authResponse.json()) as { message?: string };
      setAuthError(error.message ?? "Invalid login or password.");
      return;
    }

    const response = await fetch("/api/tables", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "move",
        restaurantSlug: moveAuthTable.restaurantSlug,
        tableNumber: moveAuthTable.tableNumber,
        targetTableNumber: nextTableNumber
      })
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      setAuthError(error.message ?? "Failed to move orders to another table.");
      return;
    }

    closeMoveDialog();
    setDialogMessage(
      `Orders moved from table ${moveAuthTable.tableNumber} to table ${nextTableNumber}.`
    );

    const refreshResponse = await fetch("/api/tables");

    if (!refreshResponse.ok) {
      return;
    }

    const nextData = (await refreshResponse.json()) as TablesResponse;
    setData(nextData);
  }

  function exportClosedOrdersForToday() {
    const today = new Date().toLocaleDateString("sv-SE");
    const sessions = data.closedSessions.filter(
      (session) => new Date(session.closedAt).toLocaleDateString("sv-SE") === today
    );

    if (!sessions.length) {
      setDialogMessage("There are no closed orders for export today.");
      return;
    }

    const rows = sessions.flatMap((session) =>
      session.orders.flatMap((order) =>
        order.items.map((item) => ({
          closedAt: new Date(session.closedAt).toLocaleString("en-GB"),
          restaurantName: session.restaurantName,
          tableNumber: session.tableNumber,
          sessionId: session.sessionId,
          orderId: order.id,
          status: order.status,
          itemName: item.name,
          quantity: item.quantity,
          itemTotal: item.price * item.quantity,
          sessionTotal: session.total
        }))
      )
    );

    const escapeCell = (value: string | number) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <table border="1">
      <tr>
        <th>Closed at</th>
        <th>Restaurant</th>
        <th>Table</th>
        <th>Session ID</th>
        <th>Order ID</th>
        <th>Status</th>
        <th>Dish</th>
        <th>Qty</th>
        <th>Item total</th>
        <th>Session total</th>
      </tr>
      ${rows
        .map(
          (row) => `<tr>
            <td>${escapeCell(row.closedAt)}</td>
            <td>${escapeCell(row.restaurantName)}</td>
            <td>${escapeCell(row.tableNumber)}</td>
            <td>${escapeCell(row.sessionId)}</td>
            <td>${escapeCell(row.orderId)}</td>
            <td>${escapeCell(row.status)}</td>
            <td>${escapeCell(row.itemName)}</td>
            <td>${escapeCell(row.quantity)}</td>
            <td>${escapeCell(row.itemTotal)}</td>
            <td>${escapeCell(row.sessionTotal)}</td>
          </tr>`
        )
        .join("")}
    </table>
  </body>
</html>`;

    const blob = new Blob([html], {
      type: "application/vnd.ms-excel;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `closed-orders-${today}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <p className="muted">Loading tables...</p>;
  }

  return (
    <>
      {dialogMessage ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tables-dialog-title"
          >
            <h2 id="tables-dialog-title">Notice</h2>
            <p>{dialogMessage}</p>
            <button
              className="button-success"
              type="button"
              onClick={() => setDialogMessage(null)}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      {moveAuthTable ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-table-title"
          >
            <h2 id="move-table-title">Clients changed table</h2>
            <div className="modal-form">
              <input
                className="modal-input"
                type="number"
                min="1"
                placeholder="Move to table"
                value={targetTableNumber}
                onChange={(event) => setTargetTableNumber(event.target.value)}
              />
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
                className="button-danger"
                type="button"
                onClick={closeMoveDialog}
              >
                Cancel
              </button>
              <button
                className="button-success"
                type="button"
                onClick={() => void submitMoveTable()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="tables-layout">
        {!data.tables.length ? (
          <p className="muted">
            There are no active orders left in the tables view.
          </p>
        ) : (
          <div className="tables-grid">
            {data.tables.map((table) => {
              const sessionItems = groupSessionItems(table);

              return (
                <article
                  key={`${table.restaurantSlug}_${table.tableNumber}`}
                  className="table-card"
                >
                  <div className="order-card__header">
                    <div>
                      <h3>Table {table.tableNumber}</h3>
                    </div>
                  </div>

                  <div className="table-summary">
                    <span>Current total</span>
                    <strong>{formatCurrency(table.total)}</strong>
                  </div>

                  <div className="table-orders">
                    <div className="table-order-card">
                      <div className="table-order-items">
                        {sessionItems.map((item) => (
                          <div key={item.key} className="table-order-item">
                            <span className="table-order-item__name">{item.name}</span>
                            <span className="table-order-item__quantity">
                              {item.quantity} pcs
                            </span>
                            <strong className="table-order-item__price">
                              {formatCurrency(item.total)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="order-actions">
                    <button
                      className="button-neutral tables-action-button"
                      type="button"
                      onClick={() => requestMoveTable(table)}
                    >
                      Clients changed table
                    </button>
                    <button
                      className="button-danger tables-action-button"
                      type="button"
                      onClick={() =>
                        handleCloseTable(table.restaurantSlug, table.tableNumber)
                      }
                    >
                      Close table
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section className="closed-sessions">
          <div className="section-header">
            <h2>Closed tables</h2>
          </div>

          <div className="closed-actions">
            <button
              className="button-success tables-action-button"
              type="button"
              onClick={exportClosedOrdersForToday}
            >
              Export today to Excel
            </button>
          </div>

          {!data.closedSessions.length ? (
            <p className="muted">No closed tables yet.</p>
          ) : (
            <div className="closed-grid">
              {data.closedSessions.map((session) => {
                const sessionItems = groupClosedSessionItems(session);

                return (
                  <article
                    key={`${session.restaurantSlug}_${session.tableNumber}_${session.sessionId}`}
                    className="info-card"
                  >
                    <h2>Table {session.tableNumber}</h2>
                    <p>
                      Closed at{" "}
                      {new Date(session.closedAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      })}{" "}
                      · Total: {formatCurrency(session.total)}
                    </p>
                    <details className="closed-details">
                      <summary>View order</summary>
                      <div className="closed-details__content">
                        <div className="closed-order">
                          <div className="table-order-items">
                            {sessionItems.map((item) => (
                              <div key={item.key} className="table-order-item">
                                <span className="table-order-item__name">
                                  {item.name}
                                </span>
                                <span className="table-order-item__quantity">
                                  {item.quantity} pcs
                                </span>
                                <strong className="table-order-item__price">
                                  {formatCurrency(item.total)}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
