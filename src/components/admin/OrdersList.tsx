"use client";

import { useEffect, useState } from "react";

import { formatCurrency } from "@/lib/menu";
import { MenuCategory, Order, OrderStatus } from "@/lib/types";

const WAITER_CALLS_STORAGE_KEY = "admin-waiter-calls-v2";
const NEW_HIGHLIGHT_MS = 2 * 60 * 1000;
const COOKED_HIGHLIGHT_MS = 5 * 60 * 1000;
const AUTO_COOKING_AFTER_MS = 3 * 60 * 1000;

const statusLabels = {
  new: "New",
  preparing: "Preparing",
  served: "Served",
  cancelled: "Cancelled"
} as const;

const serveModeLabels = {
  all_at_once: "Serve everything together",
  as_ready: "Serve as ready"
} as const;

const barCategories = new Set<MenuCategory>([
  "drinks",
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
  "dot4",
  "non_alcoholic_drinks"
]);

function getOrderItemDisplayName(item: { name: string; volumeLabel?: string }) {
  return item.volumeLabel?.trim() ? `${item.name} · ${item.volumeLabel}` : item.name;
}

function getWhatsAppLink(order: Order) {
  const phone = (order.guestContactPhone ?? "").replace(/[^\d+]/g, "");

  if (!phone) {
    return null;
  }

  const normalizedPhone = phone.startsWith("+") ? phone.slice(1) : phone;
  const message = `Hi ${order.guestContactName ?? ""}, your order for table ${order.tableNumber} at ${order.restaurantName} is ready.`;

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message.trim())}`;
}

function isCookedOrder(order: Order) {
  return (
    order.kind !== "waiter_call" &&
    order.kind !== "bill_request" &&
    order.items.length > 0 &&
    order.items.some((item) =>
      typeof item.note === "string" ? item.note.includes("__menu_order_cooked__") : false
    )
  );
}

function getHallKitchenIndicator(order: Order, now: number) {
  if (order.kind === "waiter_call" || order.kind === "bill_request") {
    return null;
  }

  if (isCookedOrder(order)) {
    return {
      label: "Cooked",
      className: "status-pill status-pill--kitchen-cooked"
    };
  }

  if (getOrderAgeMs(order.createdAt, now) >= AUTO_COOKING_AFTER_MS) {
    return {
      label: "Is cooking",
      className: "status-pill status-pill--kitchen-cooking"
    };
  }

  return {
    label: "New",
    className: "status-pill status-pill--kitchen-new"
  };
}

function getKitchenTimerStatus(ageMs: number) {
  const stage = getKitchenStage(ageMs);

  if (stage === "new") {
    return {
      label: "New",
      className: "order-kitchen-timer__status order-kitchen-timer__status--neutral"
    };
  }

  if (stage === "on_time") {
    return {
      label: "On time",
      className: "order-kitchen-timer__status order-kitchen-timer__status--orange"
    };
  }

  return {
    label: "Late",
    className: "order-kitchen-timer__status order-kitchen-timer__status--danger"
  };
}

function getKitchenStage(ageMs: number) {
  if (ageMs < AUTO_COOKING_AFTER_MS) {
    return "new" as const;
  }

  if (ageMs < 10 * 60 * 1000) {
    return "on_time" as const;
  }

  return "late" as const;
}

function getGroupedBarItems(
  items: Array<{ id: string; name: string; volumeLabel?: string; quantity: number }>
) {
  const groups = new Map<
    string,
    Array<{ id: string; volumeLabel?: string; quantity: number }>
  >();

  for (const item of items) {
    const current = groups.get(item.name) ?? [];
    current.push({
      id: item.id,
      volumeLabel: item.volumeLabel,
      quantity: item.quantity
    });
    groups.set(item.name, current);
  }

  return [...groups.entries()].map(([name, variants]) => ({
    name,
    variants
  }));
}

function getOrderAgeMs(createdAt: string, now: number) {
  return Math.max(0, now - new Date(createdAt).getTime());
}

function formatOrderAge(ageMs: number) {
  const totalMinutes = Math.floor(ageMs / 60000);
  const totalSeconds = Math.floor(ageMs / 1000);

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (totalMinutes > 0) {
    return `${totalMinutes} min`;
  }

  return `${Math.max(1, totalSeconds)} sec`;
}

function getOrderAgeTone(ageMs: number) {
  if (ageMs < AUTO_COOKING_AFTER_MS) {
    return "neutral";
  }

  if (ageMs < 10 * 60 * 1000) {
    return "orange";
  }

  return "danger";
}

export function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTables, setSelectedTables] = useState<number[]>([]);
  const [selectedZone, setSelectedZone] = useState<"hall" | "kitchen" | "bar">("hall");
  const [selectedKitchenStatuses, setSelectedKitchenStatuses] = useState<
    Array<"new" | "on_time" | "late">
  >(["new", "on_time", "late"]);
  const [authOrder, setAuthOrder] = useState<Order | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  function readStoredWaiterCalls() {
    const raw = window.localStorage.getItem(WAITER_CALLS_STORAGE_KEY);

    if (!raw) {
      return [] as Order[];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Order[]) : [];
    } catch {
      return [];
    }
  }

  function writeStoredWaiterCalls(nextCalls: Order[]) {
    window.localStorage.setItem(
      WAITER_CALLS_STORAGE_KEY,
      JSON.stringify(nextCalls)
    );
  }

  function mergeOrdersWithStoredWaiterCalls(nextOrders: unknown) {
    const safeNextOrders = Array.isArray(nextOrders)
      ? (nextOrders as Order[])
      : [];
    const storedCalls = readStoredWaiterCalls();
    const nextAlertCalls = safeNextOrders.filter(
      (order) => order.kind === "waiter_call" || order.kind === "bill_request"
    );
    const nextAlertIds = new Set(nextAlertCalls.map((order) => order.id));
    const mergedAlertCallsMap = new Map<string, Order>();

    [...storedCalls, ...nextAlertCalls].forEach((order) => {
      if (
        nextAlertIds.has(order.id) &&
        order.status !== "served" &&
        order.status !== "cancelled"
      ) {
        mergedAlertCallsMap.set(order.id, order);
      }
    });

    const mergedAlertCalls = [...mergedAlertCallsMap.values()];
    writeStoredWaiterCalls(mergedAlertCalls);

    const nonWaiterOrders = safeNextOrders.filter(
      (order) => order.kind !== "waiter_call" && order.kind !== "bill_request"
    );

    return [...mergedAlertCalls, ...nonWaiterOrders].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.visibilityState === "hidden") {
        return;
      }

      const response = await fetch("/api/orders");
      const payload = response.ok ? await response.json() : [];
      const data = mergeOrdersWithStoredWaiterCalls(payload);

      if (!cancelled) {
        setOrders(data);
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

  async function changeStatus(orderId: string, status: OrderStatus) {
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ orderId, status })
    });

    if (!response.ok) {
      return;
    }

    const updatedOrder = (await response.json()) as Order;
    setOrders((current) => {
      if (
        (updatedOrder.kind === "waiter_call" ||
          updatedOrder.kind === "bill_request") &&
        (updatedOrder.status === "served" || updatedOrder.status === "cancelled")
      ) {
        writeStoredWaiterCalls(
          readStoredWaiterCalls().filter((order) => order.id !== orderId)
        );
      }

      if (updatedOrder.status === "served" || updatedOrder.status === "cancelled") {
        return current.filter((order) => order.id !== orderId);
      }

      return current.map((order) => (order.id === orderId ? updatedOrder : order));
    });
  }

  async function toggleOrderItem(
    orderId: string,
    orderItemId: string,
    served: boolean
  ) {
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ orderId, orderItemId, served })
    });

    if (!response.ok) {
      return;
    }

    const updatedOrder = (await response.json()) as Order;
    setOrders((current) => {
      if (updatedOrder.status === "served" || updatedOrder.status === "cancelled") {
        return current.filter((order) => order.id !== orderId);
      }

      return current.map((order) => (order.id === orderId ? updatedOrder : order));
    });
  }

  async function toggleOrderCooked(orderId: string, cooked: boolean) {
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ orderId, cooked })
    });

    if (!response.ok) {
      return;
    }

    const updatedOrder = (await response.json()) as Order;
    setOrders((current) =>
      current.map((order) => (order.id === orderId ? updatedOrder : order))
    );
  }

  async function changeOrderItemQuantity(
    orderId: string,
    orderItemId: string,
    quantityDelta: number
  ) {
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ orderId, orderItemId, quantityDelta })
    });

    if (!response.ok) {
      return;
    }

    const updatedOrder = (await response.json()) as Order;
    setOrders((current) => {
      if (updatedOrder.status === "served" || updatedOrder.status === "cancelled") {
        return current.filter((order) => order.id !== orderId);
      }

      return current.map((order) => (order.id === orderId ? updatedOrder : order));
    });
  }

  function requestEditOrderAuth(order: Order) {
    setAuthOrder(order);
    setLogin("");
    setPassword("");
    setAuthError(null);
  }

  function openEditOrderDialog(order: Order) {
    setEditOrder(order);
    setEditedQuantities(
      Object.fromEntries(order.items.map((item) => [item.id, item.quantity]))
    );
  }

  function closeEditOrderDialog() {
    setEditOrder(null);
    setEditedQuantities({});
  }

  function changeEditedQuantity(orderItemId: string, delta: number) {
    setEditedQuantities((current) => ({
      ...current,
      [orderItemId]: Math.max(0, (current[orderItemId] ?? 0) + delta)
    }));
  }

  async function saveEditedOrder() {
    if (!editOrder) {
      return;
    }

    for (const item of editOrder.items) {
      const nextQuantity = editedQuantities[item.id] ?? item.quantity;
      const quantityDelta = nextQuantity - item.quantity;

      if (quantityDelta !== 0) {
        await changeOrderItemQuantity(editOrder.id, item.id, quantityDelta);
      }
    }

    closeEditOrderDialog();
  }

  function closeAuthDialog() {
    setAuthOrder(null);
    setLogin("");
    setPassword("");
    setShowPassword(false);
    setAuthError(null);
  }

  async function submitEditAuth() {
    const response = await fetch("/api/admin-auth", {
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

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      setAuthError(error.message ?? "Invalid login or password.");
      return;
    }

    const order = authOrder;
    closeAuthDialog();

    if (order) {
      openEditOrderDialog(order);
    }
  }

  if (loading) {
    return <p className="muted">Loading incoming orders...</p>;
  }

  const tableOptions = [...new Set(orders.map((order) => order.tableNumber))].sort(
    (left, right) => left - right
  );

  const currentTimestamp = Date.now();
  const kitchenBaseOrders = orders.filter(
    (order) =>
      (selectedTables.length === 0
        ? true
        : selectedTables.includes(order.tableNumber)) &&
      order.kind !== "waiter_call" &&
      order.kind !== "bill_request" &&
      !isCookedOrder(order) &&
      order.items.some((item) =>
        item.category ? !barCategories.has(item.category) : true
      )
  );
  const kitchenStatusCounts = {
    new: kitchenBaseOrders.filter(
      (order) =>
        getKitchenStage(getOrderAgeMs(order.createdAt, currentTimestamp)) === "new"
    ).length,
    on_time: kitchenBaseOrders.filter(
      (order) =>
        getKitchenStage(getOrderAgeMs(order.createdAt, currentTimestamp)) === "on_time"
    ).length,
    late: kitchenBaseOrders.filter(
      (order) =>
        getKitchenStage(getOrderAgeMs(order.createdAt, currentTimestamp)) === "late"
    ).length
  };
  const filteredOrders = orders.filter((order) =>
    (selectedTables.length === 0
      ? true
      : selectedTables.includes(order.tableNumber)) &&
    (selectedZone === "hall"
      ? true
      : selectedZone === "bar"
        ? order.kind !== "waiter_call" &&
          order.kind !== "bill_request" &&
          order.items.some((item) =>
            item.category ? barCategories.has(item.category) : false
          )
        : order.kind !== "waiter_call" &&
          order.kind !== "bill_request" &&
          !isCookedOrder(order) &&
          selectedKitchenStatuses.includes(
            getKitchenStage(getOrderAgeMs(order.createdAt, currentTimestamp))
          ) &&
          order.items.some((item) =>
            item.category ? !barCategories.has(item.category) : true
          ))
  ).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );

  function toggleTable(tableNumber: number) {
    setSelectedTables((current) =>
      current.includes(tableNumber)
        ? current.filter((value) => value !== tableNumber)
        : [...current, tableNumber].sort((left, right) => left - right)
    );
  }

  function toggleKitchenStatus(status: "new" | "on_time" | "late") {
    setSelectedKitchenStatuses((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status]
    );
  }

  if (!orders.length) {
    return <p className="muted">No incoming orders yet.</p>;
  }

  return (
    <>
      {editOrder ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-order-title"
          >
            <h2 id="edit-order-title">Change/cancel order</h2>
            <div className="modal-form">
              {editOrder.items.map((item) => (
                <div key={item.id} className="order-edit-row">
                  <span className="order-item-name">{item.name}</span>
                  <div className="order-item-stepper">
                    <button
                      className="button-neutral"
                      type="button"
                      onClick={() => changeEditedQuantity(item.id, -1)}
                    >
                      -
                    </button>
                    <span>{editedQuantities[item.id] ?? item.quantity}</span>
                    <button
                      className="button-neutral"
                      type="button"
                      onClick={() => changeEditedQuantity(item.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="button-danger"
                type="button"
                aria-label="Close"
                onClick={closeEditOrderDialog}
              >
                ✕
              </button>
              <button
                className="button-danger"
                type="button"
                onClick={() => {
                  const orderId = editOrder.id;
                  closeEditOrderDialog();
                  void changeStatus(orderId, "cancelled");
                }}
              >
                Cancel order
              </button>
              <button
                className="button-success"
                type="button"
                aria-label="Save"
                onClick={() => void saveEditedOrder()}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {authOrder ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-auth-title"
          >
            <h2 id="edit-auth-title">Change/cancel order</h2>
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
                className="button-danger"
                type="button"
                aria-label="Close"
                onClick={closeAuthDialog}
              >
                ✕
              </button>
              <button
                className="button-success"
                type="button"
                aria-label="Confirm"
                onClick={() => void submitEditAuth()}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="orders-layout">
      <div className="orders-filter orders-filter--stacked">
        <div className="orders-filter__row">
        <div className="orders-filter__chips">
          <button
            type="button"
            className={
              selectedZone === "hall"
                ? "orders-filter__chip orders-filter__chip--active"
                : "orders-filter__chip"
            }
            onClick={() => setSelectedZone("hall")}
          >
            <span className="orders-filter__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="orders-filter__icon-svg">
                <path
                  d="M12 3a5 5 0 0 1 5 5v2.3c0 .5.2 1 .6 1.4l1 1A2 2 0 0 1 17.2 16H6.8a2 2 0 0 1-1.4-3.3l1-1c.4-.4.6-.9.6-1.4V8a5 5 0 0 1 5-5Zm0 18a3 3 0 0 0 2.8-2H9.2A3 3 0 0 0 12 21Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            Hall
          </button>
          <button
            type="button"
            className={
              selectedZone === "kitchen"
                ? "orders-filter__chip orders-filter__chip--active"
                : "orders-filter__chip"
            }
            onClick={() => setSelectedZone("kitchen")}
          >
            <span className="orders-filter__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="orders-filter__icon-svg">
                <path
                  d="M4 4h3v8a2 2 0 0 0 4 0V4h2v8a4 4 0 0 1-8 0V4Zm12 0c2.2 0 4 1.8 4 4v12h-3V14h-2V8c0-2.2.8-4 1-4Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            Kitchen
          </button>
          <button
            type="button"
            className={
              selectedZone === "bar"
                ? "orders-filter__chip orders-filter__chip--active"
                : "orders-filter__chip"
            }
            onClick={() => setSelectedZone("bar")}
          >
            <span className="orders-filter__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="orders-filter__icon-svg">
                <path
                  d="M5 4h14a1 1 0 0 1 .8 1.6L14 13v5h2a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h2v-5L4.2 5.6A1 1 0 0 1 5 4Zm2.1 2 4.9 5.88L16.9 6H7.1Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            Bar
          </button>
        </div>
        </div>
        <div className="orders-filter__row">
        <div className="orders-filter__chips">
          <button
            type="button"
            className={
              selectedTables.length === 0
                ? "orders-filter__chip orders-filter__chip--active"
                : "orders-filter__chip"
            }
            onClick={() => setSelectedTables([])}
          >
            All tables
          </button>
          {tableOptions.map((tableNumber) => (
            <button
              key={tableNumber}
              type="button"
              className={
                selectedTables.includes(tableNumber)
                  ? "orders-filter__chip orders-filter__chip--active"
                  : "orders-filter__chip"
              }
              onClick={() => toggleTable(tableNumber)}
            >
              Table {tableNumber}
            </button>
          ))}
        </div>
        </div>
        {selectedZone === "kitchen" ? (
          <div className="orders-filter__row">
            <div className="orders-filter__chips orders-filter__chips--nested">
              <button
                type="button"
                className={
                  selectedKitchenStatuses.includes("new")
                    ? "orders-filter__chip orders-filter__chip--kitchen-light orders-filter__chip--active"
                    : "orders-filter__chip orders-filter__chip--kitchen-light"
                }
                onClick={() => toggleKitchenStatus("new")}
              >
                New • {kitchenStatusCounts.new}
              </button>
              <button
                type="button"
                className={
                  selectedKitchenStatuses.includes("on_time")
                    ? "orders-filter__chip orders-filter__chip--kitchen-neutral orders-filter__chip--active"
                    : "orders-filter__chip orders-filter__chip--kitchen-neutral"
                }
                onClick={() => toggleKitchenStatus("on_time")}
              >
                On time • {kitchenStatusCounts.on_time}
              </button>
              <button
                type="button"
                className={
                  selectedKitchenStatuses.includes("late")
                    ? "orders-filter__chip orders-filter__chip--kitchen-late orders-filter__chip--active"
                    : "orders-filter__chip orders-filter__chip--kitchen-late"
                }
                onClick={() => toggleKitchenStatus("late")}
              >
                Late • {kitchenStatusCounts.late}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {!filteredOrders.length ? (
        <p className="muted">No active orders for the selected table.</p>
      ) : (
        <div
          className={
            selectedZone === "kitchen"
              ? "orders-grid orders-grid--compact"
              : "orders-grid"
          }
        >
          {filteredOrders.map((order) => {
            const isHallView = selectedZone === "hall";
            const isKitchenView = selectedZone === "kitchen";
            const isStationView = !isHallView;
            const isBarView = selectedZone === "bar";
            const highlightTimestamp = order.updatedAt || order.createdAt;
            const serveModeLabel = order.serveMode
              ? serveModeLabels[order.serveMode]
              : null;
            const isFreshNewOrder =
              order.kind !== "waiter_call" &&
              order.kind !== "bill_request" &&
              order.status === "new" &&
              Date.now() - new Date(highlightTimestamp).getTime() < NEW_HIGHLIGHT_MS;
            const visibleItems =
              isHallView
                ? order.items
                : isBarView
                ? order.items.filter((item) =>
                    item.category ? barCategories.has(item.category) : false
                  )
                : order.items.filter((item) =>
                    item.category ? !barCategories.has(item.category) : true
                  );
            const visibleTotal = visibleItems.reduce(
              (sum, item) => sum + item.price * item.quantity,
              0
            );
            const groupedBarItems = isBarView
              ? getGroupedBarItems(
                  visibleItems.map((item) => ({
                    id: item.id,
                    name: item.name,
                    volumeLabel: item.volumeLabel,
                    quantity: item.quantity
                  }))
                )
              : [];
            const totalDrinksCount = visibleItems.reduce(
              (sum, item) => sum + item.quantity,
              0
            );
            const whatsAppLink = getWhatsAppLink(order);
            const orderAgeMs = getOrderAgeMs(order.createdAt, currentTimestamp);
            const orderAgeTone = getOrderAgeTone(orderAgeMs);
            const isTimedOrder =
              order.kind !== "waiter_call" && order.kind !== "bill_request";
            const isCooked = isCookedOrder(order);
            const hallKitchenIndicator = isHallView
              ? getHallKitchenIndicator(order, currentTimestamp)
              : null;
            const kitchenTimerStatus = isKitchenView
              ? getKitchenTimerStatus(orderAgeMs)
              : null;
            const isCookedFreshHighlight =
              isHallView &&
              isCooked &&
              !order.items.some((item) => item.served) &&
              Date.now() - new Date(order.updatedAt || order.createdAt).getTime() <
                COOKED_HIGHLIGHT_MS;

            return (
              <article
                key={order.id}
                className={[
                  "order-card",
                  order.kind === "waiter_call"
                    ? "order-card--alert"
                    : order.kind === "bill_request"
                      ? "order-card--notice"
                    : isCookedFreshHighlight
                      ? "order-card--cooked-highlight"
                    : isFreshNewOrder
                      ? "order-card--fresh-new"
                    : "",
                  isKitchenView ? "order-card--compact" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="order-card__header">
                  <div>
                    <h3>
                      Table {order.tableNumber}
                      {isHallView && order.kind === "waiter_call"
                        ? " · Waiter call"
                        : isHallView && order.kind === "bill_request"
                          ? " · Bill request"
                        : ""}
                    </h3>
                    {isBarView ? (
                      <p className="muted">Drinks {totalDrinksCount}</p>
                    ) : null}
                    {order.kind !== "waiter_call" &&
                    order.kind !== "bill_request" &&
                    isHallView &&
                    serveModeLabel ? (
                      <p className="muted">{serveModeLabel}</p>
                    ) : null}
                    {order.kind !== "waiter_call" &&
                    order.kind !== "bill_request" &&
                    isHallView &&
                    (order.guestContactName || order.guestContactPhone) ? (
                      <div className="order-guest-contact">
                        <p className="muted">
                          Guest: {order.guestContactName || "—"}
                          {order.guestContactPhone ? ` · ${order.guestContactPhone}` : ""}
                        </p>
                        {whatsAppLink ? (
                          <a
                            href={whatsAppLink}
                            target="_blank"
                            rel="noreferrer"
                            className="button-neutral order-whatsapp-link"
                          >
                            <span className="order-whatsapp-link__icon" aria-hidden="true">
                              W
                            </span>
                            <span>WhatsApp</span>
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="order-header-meta">
                    {hallKitchenIndicator ? (
                      <span className={hallKitchenIndicator.className}>
                        {hallKitchenIndicator.label}
                      </span>
                    ) : null}
                    {isTimedOrder && isKitchenView ? (
                      <div className={`order-kitchen-timer order-kitchen-timer--${orderAgeTone}`}>
                        <span className={kitchenTimerStatus?.className}>
                          {orderAgeTone === "danger" ? (
                            <span
                              className="order-kitchen-timer__bell"
                              aria-hidden="true"
                            >
                              🔔
                            </span>
                          ) : null}
                          {kitchenTimerStatus?.label}
                        </span>
                        <span className="order-kitchen-timer__value">
                          {formatOrderAge(orderAgeMs)}
                        </span>
                      </div>
                    ) : isTimedOrder ? (
                      <div className={`order-age-badge order-age-badge--${orderAgeTone}`}>
                        <span className="order-age-badge__dot" aria-hidden="true" />
                        <span className="order-age-badge__value">
                          {formatOrderAge(orderAgeMs)}
                        </span>
                      </div>
                    ) : null}
                    {isKitchenView || isBarView ? null : (
                      <div className="order-time">
                        <span className="order-time__label">Order time</span>
                        <span className="order-time__value">
                          {new Date(order.createdAt).toLocaleTimeString("en-GB")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {order.kind === "waiter_call" ? (
                  <p className="order-callout">A guest is asking for staff at the table.</p>
                ) : order.kind === "bill_request" ? (
                  <p className="order-callout">A guest is asking for the bill.</p>
                ) : isBarView ? (
                  <div className="order-items order-items--compact">
                    {groupedBarItems.map((group) => (
                      <div key={group.name} className="order-bar-group">
                        {group.variants.every((variant) => !variant.volumeLabel?.trim()) ? (
                          <div className="order-bar-group__single-line">
                            <span className="order-bar-group__title">{group.name}</span>
                            <span className="order-bar-group__variant-qty">
                              x
                              {group.variants.reduce(
                                (sum, variant) => sum + variant.quantity,
                                0
                              )}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="order-bar-group__title">{group.name}:</div>
                            <div className="order-bar-group__variants">
                              {group.variants.map((variant) => (
                                <div key={variant.id} className="order-bar-group__variant">
                                  <span className="order-bar-group__dash" aria-hidden="true">
                                    -
                                  </span>
                                  <span className="order-bar-group__variant-label">
                                    {variant.volumeLabel}
                                  </span>
                                  <span className="order-bar-group__variant-qty">
                                    x{variant.quantity}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="order-items">
                    {visibleItems.map((item) => (
                      <div key={item.id} className="order-row">
                        <div className="order-item-main">
                          {isStationView ? (
                            <div className="order-item-line">
                              <span className="order-item-name">
                                {getOrderItemDisplayName(item)}
                              </span>
                              <span className="order-item-qty">
                                {item.quantity} pcs
                              </span>
                            </div>
                          ) : (
                            <label className="order-item-check">
                              <input
                                type="checkbox"
                                checked={item.served}
                                onChange={(event) =>
                                  toggleOrderItem(order.id, item.id, event.target.checked)
                                }
                              />
                              <span className="order-item-name">
                                {getOrderItemDisplayName(item)}
                              </span>
                            </label>
                          )}
                        </div>
                        {isStationView ? null : (
                          <div className="order-item-actions">
                            <span className="order-item-qty">{item.quantity} pcs</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="order-actions">
                  {isHallView &&
                  (order.kind === "waiter_call" || order.kind === "bill_request") ? (
                    <button
                      className="button-success"
                      type="button"
                      onClick={() => changeStatus(order.id, "served")}
                    >
                      OK
                    </button>
                  ) : isKitchenView || isBarView ? (
                    <button
                      className="button-success order-action-ready"
                      type="button"
                      aria-disabled={isCooked}
                      onClick={() => {
                        if (!isCooked) {
                          void toggleOrderCooked(order.id, true);
                        }
                      }}
                    >
                      Ready
                    </button>
                  ) : isStationView ? null : (
                    <>
                      <button
                        className="button-success"
                        type="button"
                        onClick={() => changeStatus(order.id, "served")}
                      >
                        Served
                      </button>
                      <button
                        className="button-danger"
                        type="button"
                        onClick={() => requestEditOrderAuth(order)}
                      >
                        Change/cancel order
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      </div>
    </>
  );
}
