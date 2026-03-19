"use client";

import { useEffect, useState } from "react";

import { formatCurrency } from "@/lib/menu";
import {
  ClosedTableSummary,
  MenuCategory,
  Order,
  TableOverview
} from "@/lib/types";

type TablesResponse = {
  tables: TableOverview[];
  closedSessions: ClosedTableSummary[];
};

type MenuSettingsResponse = {
  happyHourEnabled?: boolean;
  happyHourDiscountPercent?: number;
  happyHourCategories?: MenuCategory[];
  happyHourStartsFrom?: string | null;
  happyHourUntil?: string | null;
  workingHoursFrom?: string | null;
};

type SessionItemSummary = {
  key: string;
  name: string;
  volumeLabel?: string;
  quantity: number;
  total: number;
  hasHappyHourDiscount: boolean;
};

const DRINK_CATEGORIES = new Set<string>([
  "drinks",
  "non_alcoholic_drinks",
  "fluids",
  "draft",
  "bottled",
  "fuel",
  "whiskey",
  "vodka",
  "rum",
  "cognac",
  "gin",
  "tequila",
  "absent",
  "ouzo",
  "likers",
  "two_component_mixture",
  "dot4"
]);

function getSessionItemKey(item: { menuItemId: string; volumeOptionId?: string; volumeLabel?: string }) {
  return `${item.menuItemId}:${item.volumeOptionId ?? item.volumeLabel ?? "base"}`;
}

function getItemType(category: string | undefined) {
  if (!category) {
    return "dish";
  }

  return DRINK_CATEGORIES.has(category) ? "drink" : "dish";
}

function getSessionItemName(item: { name: string; volumeLabel?: string }) {
  return item.volumeLabel?.trim() ? `${item.name} · ${item.volumeLabel}` : item.name;
}

function formatHappyHourCategoriesLabel(categories: MenuCategory[]) {
  if (!categories.length) {
    return "selected categories";
  }

  return categories.map((category) => category.replace(/_/g, " ")).join(", ");
}

function isOrderItemDiscountedByHappyHour(
  item: Order["items"][number],
  createdAt: string,
  settings: {
    enabled: boolean;
    discountPercent: number;
    categories: Set<MenuCategory>;
    startsFrom: string | null;
    until: string | null;
  }
) {
  return (
    settings.discountPercent > 0 &&
    settings.discountPercent < 100 &&
    Boolean(item.category) &&
    settings.categories.has(item.category as MenuCategory) &&
    isHappyHourActiveAt(createdAt, settings)
  );
}

function groupSessionItems(
  table: TableOverview,
  settings: {
    enabled: boolean;
    discountPercent: number;
    categories: Set<MenuCategory>;
    startsFrom: string | null;
    until: string | null;
  }
): SessionItemSummary[] {
  const grouped = new Map<string, SessionItemSummary>();

  for (const order of table.orders ?? []) {
    for (const item of order.items ?? []) {
      const key = getSessionItemKey(item);
      const existing = grouped.get(key);
      const isDiscounted = isOrderItemDiscountedByHappyHour(
        item,
        order.createdAt,
        settings
      );

      if (existing) {
        existing.quantity += item.quantity;
        existing.total += item.price * item.quantity;
        existing.hasHappyHourDiscount =
          existing.hasHappyHourDiscount || isDiscounted;
        continue;
      }

      grouped.set(key, {
        key,
        name: getSessionItemName(item),
        volumeLabel: item.volumeLabel,
        quantity: item.quantity,
        total: item.price * item.quantity,
        hasHappyHourDiscount: isDiscounted
      });
    }
  }

  return [...grouped.values()];
}

function groupClosedSessionItems(
  session: ClosedTableSummary,
  settings: {
    enabled: boolean;
    discountPercent: number;
    categories: Set<MenuCategory>;
    startsFrom: string | null;
    until: string | null;
  }
): SessionItemSummary[] {
  const grouped = new Map<string, SessionItemSummary>();

  for (const order of session.orders ?? []) {
    for (const item of order.items ?? []) {
      const key = getSessionItemKey(item);
      const existing = grouped.get(key);
      const isDiscounted = isOrderItemDiscountedByHappyHour(
        item,
        order.createdAt,
        settings
      );

      if (existing) {
        existing.quantity += item.quantity;
        existing.total += item.price * item.quantity;
        existing.hasHappyHourDiscount =
          existing.hasHappyHourDiscount || isDiscounted;
        continue;
      }

      grouped.set(key, {
        key,
        name: getSessionItemName(item),
        volumeLabel: item.volumeLabel,
        quantity: item.quantity,
        total: item.price * item.quantity,
        hasHappyHourDiscount: isDiscounted
      });
    }
  }

  return [...grouped.values()];
}

function isHappyHourActiveAt(
  timestamp: string,
  settings: {
    enabled: boolean;
    startsFrom: string | null;
    until: string | null;
  }
) {
  if (!settings.enabled || !settings.startsFrom || !settings.until) {
    return false;
  }

  const orderTime = new Date(timestamp).getTime();
  const startTime = new Date(settings.startsFrom).getTime();
  const untilTime = new Date(settings.until).getTime();

  if (
    !Number.isFinite(orderTime) ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(untilTime)
  ) {
    return false;
  }

  return orderTime >= startTime && orderTime <= untilTime;
}

function parseWorkingHoursFrom(value: string | null | undefined) {
  if (!value) {
    return { hours: 0, minutes: 0 };
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return { hours: 0, minutes: 0 };
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return { hours: 0, minutes: 0 };
  }

  return { hours, minutes };
}

function getCurrentShiftStartTimestamp(workingHoursFrom: string | null | undefined) {
  const { hours, minutes } = parseWorkingHoursFrom(workingHoursFrom);
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(hours, minutes, 0, 0);

  if (now.getTime() >= startToday.getTime()) {
    return startToday.getTime();
  }

  const previousDayStart = new Date(startToday);
  previousDayStart.setDate(previousDayStart.getDate() - 1);
  return previousDayStart.getTime();
}

function getHappyHourDiscountAmountFromOrder(
  order: Order,
  settings: {
    enabled: boolean;
    discountPercent: number;
    categories: Set<MenuCategory>;
    startsFrom: string | null;
    until: string | null;
  }
) {
  if (
    settings.discountPercent <= 0 ||
    settings.discountPercent >= 100 ||
    settings.categories.size === 0 ||
    !isHappyHourActiveAt(order.createdAt, settings)
  ) {
    return 0;
  }

  const ratio = settings.discountPercent / (100 - settings.discountPercent);
  return order.items.reduce((sum, item) => {
    if (!item.category || !settings.categories.has(item.category)) {
      return sum;
    }

    const discountedLineTotal = item.price * item.quantity;
    return sum + discountedLineTotal * ratio;
  }, 0);
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
  const [serviceRequests, setServiceRequests] = useState<Order[]>([]);
  const [happyHourEnabled, setHappyHourEnabled] = useState(false);
  const [happyHourDiscountPercent, setHappyHourDiscountPercent] = useState(0);
  const [happyHourCategories, setHappyHourCategories] = useState<MenuCategory[]>([]);
  const [happyHourStartsFrom, setHappyHourStartsFrom] = useState<string | null>(null);
  const [happyHourUntil, setHappyHourUntil] = useState<string | null>(null);
  const [workingHoursFrom, setWorkingHoursFrom] = useState<string | null>(null);

  function normalizeTablesResponse(payload: unknown): TablesResponse {
    if (!payload || typeof payload !== "object") {
      return { tables: [], closedSessions: [] };
    }

    const candidate = payload as Partial<TablesResponse>;
    return {
      tables: Array.isArray(candidate.tables) ? candidate.tables : [],
      closedSessions: Array.isArray(candidate.closedSessions)
        ? candidate.closedSessions
        : []
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.visibilityState === "hidden") {
        return;
      }

      const [tablesResponse, ordersResponse, menuSettingsResponse] = await Promise.all([
        fetch("/api/tables"),
        fetch("/api/orders"),
        fetch("/api/menu-settings")
      ]);
      const payload = tablesResponse.ok ? await tablesResponse.json() : null;
      const nextData = normalizeTablesResponse(payload);
      const nextServiceRequests = ordersResponse.ok
        ? ((await ordersResponse.json()) as Order[]).filter(
            (order) =>
              order.kind === "waiter_call" &&
              order.status !== "served" &&
              order.status !== "cancelled"
          )
        : [];
      const menuSettingsPayload: MenuSettingsResponse | null =
        menuSettingsResponse.ok
          ? ((await menuSettingsResponse.json()) as MenuSettingsResponse)
          : null;
      const parsedHappyHourDiscountPercent = Number(
        menuSettingsPayload?.happyHourDiscountPercent ?? 0
      );
      const nextHappyHourEnabled = Boolean(menuSettingsPayload?.happyHourEnabled);
      const nextHappyHourDiscountPercent = Number.isFinite(
        parsedHappyHourDiscountPercent
      )
        ? Math.max(0, parsedHappyHourDiscountPercent)
        : 0;
      const nextHappyHourCategories = Array.isArray(
        menuSettingsPayload?.happyHourCategories
      )
        ? menuSettingsPayload.happyHourCategories
        : [];
      const nextHappyHourStartsFrom =
        typeof menuSettingsPayload?.happyHourStartsFrom === "string"
          ? menuSettingsPayload.happyHourStartsFrom
          : null;
      const nextHappyHourUntil =
        typeof menuSettingsPayload?.happyHourUntil === "string"
          ? menuSettingsPayload.happyHourUntil
          : null;
      const nextWorkingHoursFrom =
        typeof menuSettingsPayload?.workingHoursFrom === "string"
          ? menuSettingsPayload.workingHoursFrom
          : null;

      if (!cancelled) {
        setData(nextData);
        setServiceRequests(nextServiceRequests);
        setHappyHourEnabled(nextHappyHourEnabled);
        setHappyHourDiscountPercent(nextHappyHourDiscountPercent);
        setHappyHourCategories(nextHappyHourCategories);
        setHappyHourStartsFrom(nextHappyHourStartsFrom);
        setHappyHourUntil(nextHappyHourUntil);
        setWorkingHoursFrom(nextWorkingHoursFrom);
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
    const discountAmount = Number(
      (summary.orders ?? [])
        .reduce(
          (sum, order) => sum + getHappyHourDiscountAmountFromOrder(order, happyHourSettings),
          0
        )
        .toFixed(2)
    );
    const happyHourNote =
      discountAmount > 0
        ? ` Happy hour discount ${happyHourDiscountPercent}% on ${happyHourCategoriesLabel}.`
        : "";
    setDialogMessage(
      `Table ${summary.tableNumber} closed. Session #${summary.sessionId}: ${formatCurrency(summary.total)}.${happyHourNote}`
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

  async function resolveServiceRequest(orderId: string) {
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderId,
        status: "served"
      })
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      setDialogMessage(error.message ?? "Failed to update request status.");
      return;
    }

    setServiceRequests((current) =>
      current.filter((order) => order.id !== orderId)
    );
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

    const nextData = normalizeTablesResponse(await refreshResponse.json());
    setData(nextData);
  }

  function exportClosedOrdersForToday() {
    exportClosedOrdersForDay(new Date().toLocaleDateString("sv-SE"), true);
  }

  function exportClosedOrdersForDay(dayKey: string, isToday = false) {
    const sessions = data.closedSessions.filter((session) => {
      const sessionDay = new Date(session.closedAt).toLocaleDateString("sv-SE");
      return sessionDay === dayKey;
    });

    if (!sessions.length) {
      setDialogMessage(
        isToday
          ? "There are no closed orders for export today."
          : `There are no closed orders for ${formatDayLabel(dayKey)}.`
      );
      return;
    }

    const rows = sessions.flatMap((session) =>
      session.orders.flatMap((order) =>
        order.items.map((item) => {
          const closedAtDate = new Date(session.closedAt);
          return {
            closedDate: closedAtDate.toLocaleDateString("en-GB"),
            closedTime: closedAtDate.toLocaleTimeString("en-GB"),
            type: getItemType(item.category),
          restaurantName: session.restaurantName,
          tableNumber: session.tableNumber,
          sessionId: session.sessionId,
          orderId: order.id,
          status: order.status,
            itemName: item.name,
          quantity: item.quantity,
          itemTotal: item.price * item.quantity,
          sessionTotal: session.total
          };
        })
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
        <th>Date</th>
        <th>Time</th>
        <th>Restaurant</th>
        <th>Table</th>
        <th>Session ID</th>
        <th>Order ID</th>
        <th>Status</th>
        <th>Type</th>
        <th>Item</th>
        <th>Qty</th>
        <th>Item total</th>
        <th>Session total</th>
      </tr>
      ${rows
        .map(
          (row) => `<tr>
            <td>${escapeCell(row.closedDate)}</td>
            <td>${escapeCell(row.closedTime)}</td>
            <td>${escapeCell(row.restaurantName)}</td>
            <td>${escapeCell(row.tableNumber)}</td>
            <td>${escapeCell(row.sessionId)}</td>
            <td>${escapeCell(row.orderId)}</td>
            <td>${escapeCell(row.status)}</td>
            <td>${escapeCell(row.type)}</td>
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
    link.download = `closed-orders-${dayKey}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function formatDayLabel(dayKey: string) {
    const [year, month, day] = dayKey.split("-");

    if (!year || !month || !day) {
      return dayKey;
    }

    return `${day}.${month}`;
  }

  if (loading) {
    return <p className="muted">Loading tables...</p>;
  }

  const happyHourSettings = {
    enabled: happyHourEnabled,
    discountPercent: happyHourDiscountPercent,
    categories: new Set<MenuCategory>(happyHourCategories),
    startsFrom: happyHourStartsFrom,
    until: happyHourUntil
  };

  const happyHourCategoriesLabel = formatHappyHourCategoriesLabel(
    happyHourCategories
  );
  const sortedClosedSessions = [
    ...(Array.isArray(data.closedSessions) ? data.closedSessions : [])
  ].sort((left, right) => {
    const leftTime = new Date(left.closedAt).getTime();
    const rightTime = new Date(right.closedAt).getTime();
    const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;
    return safeRightTime - safeLeftTime;
  });
  const currentShiftStartTs = getCurrentShiftStartTimestamp(workingHoursFrom);
  const currentShiftClosedSessions = sortedClosedSessions.filter((session) => {
    const closedAtTs = new Date(session.closedAt).getTime();
    return Number.isFinite(closedAtTs) && closedAtTs >= currentShiftStartTs;
  });
  const todayDayKey = new Date().toLocaleDateString("sv-SE");
  const closedDays = [
    ...new Set(
      sortedClosedSessions.map((session) =>
        new Date(session.closedAt).toLocaleDateString("sv-SE")
      )
    )
  ].sort((left, right) => right.localeCompare(left));
  const previousClosedDays = closedDays.filter((dayKey) => dayKey !== todayDayKey);

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
        {serviceRequests.length > 0 ? (
          <section className="closed-sessions">
            <div className="section-header">
              <h2>Service requests</h2>
            </div>
            <div className="closed-grid">
              {serviceRequests.map((order) => (
                <article
                  key={order.id}
                  className="info-card order-card order-card--service"
                >
                  <h3>
                    Table {order.tableNumber} ·{" "}
                    {order.kind === "bill_request" ? "Bill request" : "Waiter call"}
                  </h3>
                  <p className="muted">
                    Order time{" "}
                    {new Date(order.updatedAt || order.createdAt).toLocaleTimeString(
                      "en-GB",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      }
                    )}
                  </p>
                  <div className="order-actions">
                    <button
                      className="button-success"
                      type="button"
                      onClick={() => void resolveServiceRequest(order.id)}
                    >
                      OK
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!Array.isArray(data.tables) || data.tables.length === 0 ? (
          <p className="muted">
            There are no active orders left in the tables view.
          </p>
        ) : (
          <div className="tables-grid">
            {data.tables.map((table) => {
              const sessionItems = groupSessionItems(table, happyHourSettings);

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
                            <span className="table-order-item__name">
                              {item.name}
                              {item.hasHappyHourDiscount
                                ? ` -${happyHourDiscountPercent}%`
                                : ""}
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
            {previousClosedDays.map((dayKey) => (
              <button
                key={dayKey}
                className="button-neutral tables-action-button"
                type="button"
                onClick={() => exportClosedOrdersForDay(dayKey)}
              >
                Download {formatDayLabel(dayKey)}
              </button>
            ))}
          </div>

          {currentShiftClosedSessions.length === 0 ? (
            <p className="muted">No closed tables yet.</p>
          ) : (
            <div className="closed-grid">
              {currentShiftClosedSessions.slice(0, 10).map((session) => {
                const sessionItems = groupClosedSessionItems(
                  session,
                  happyHourSettings
                );

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
                                  {item.hasHappyHourDiscount
                                    ? ` -${happyHourDiscountPercent}%`
                                    : ""}
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
