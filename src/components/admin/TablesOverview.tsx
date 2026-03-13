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
                      <p className="eyebrow">{table.restaurantName}</p>
                      <h3>Table {table.tableNumber}</h3>
                    </div>
                    <span className="session-badge">ID #{table.currentSessionId}</span>
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
            <p className="eyebrow">History</p>
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
              {data.closedSessions.map((session) => (
                <article
                  key={`${session.restaurantSlug}_${session.tableNumber}_${session.sessionId}`}
                  className="info-card"
                >
                  <p className="eyebrow">{session.restaurantName}</p>
                  <h2>
                    Table {session.tableNumber} · ID #{session.sessionId}
                  </h2>
                  <p>
                    Orders: {session.orderCount} · Total: {formatCurrency(session.total)}
                  </p>
                  <details className="closed-details">
                    <summary>View orders</summary>
                    <div className="closed-details__content">
                      {session.orders.map((order) => (
                        <div key={order.id} className="closed-order">
                          <p className="muted">
                            Status: {order.status} ·{" "}
                            {new Date(order.createdAt).toLocaleTimeString("en-GB")}
                          </p>
                          <div className="table-order-items">
                            {order.items.map((item) => (
                              <div key={item.id} className="table-order-item">
                                <span className="table-order-item__name">
                                  {item.name}
                                </span>
                                <span className="table-order-item__quantity">
                                  {item.quantity} pcs
                                </span>
                                <strong className="table-order-item__price">
                                  {formatCurrency(item.price * item.quantity)}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
