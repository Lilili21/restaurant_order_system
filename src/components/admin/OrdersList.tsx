"use client";

import { useEffect, useState } from "react";

import { formatCurrency } from "@/lib/menu";
import { Order, OrderStatus } from "@/lib/types";

const WAITER_CALLS_STORAGE_KEY = "admin-waiter-calls-v2";

const statusLabels = {
  new: "Новый",
  preparing: "Готовится",
  served: "Подан",
  cancelled: "Отменён"
} as const;

const serveModeLabels = {
  all_at_once: "Подать все сразу",
  as_ready: "По мере готовности"
} as const;

export function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTables, setSelectedTables] = useState<number[]>([]);
  const [cancelAuthOrderId, setCancelAuthOrderId] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  function readStoredWaiterCalls() {
    const raw = window.localStorage.getItem(WAITER_CALLS_STORAGE_KEY);

    if (!raw) {
      return [] as Order[];
    }

    try {
      return JSON.parse(raw) as Order[];
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

  function mergeOrdersWithStoredWaiterCalls(nextOrders: Order[]) {
    const storedCalls = readStoredWaiterCalls();
    const nextWaiterCalls = nextOrders.filter(
      (order) => order.kind === "waiter_call"
    );
    const mergedWaiterCallsMap = new Map<string, Order>();

    [...storedCalls, ...nextWaiterCalls].forEach((order) => {
      if (order.status !== "served" && order.status !== "cancelled") {
        mergedWaiterCallsMap.set(order.id, order);
      }
    });

    const mergedWaiterCalls = [...mergedWaiterCallsMap.values()];
    writeStoredWaiterCalls(mergedWaiterCalls);

    const nonWaiterOrders = nextOrders.filter(
      (order) => order.kind !== "waiter_call"
    );

    return [...mergedWaiterCalls, ...nonWaiterOrders].sort((left, right) =>
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
      const data = mergeOrdersWithStoredWaiterCalls(
        (await response.json()) as Order[]
      );

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
        updatedOrder.kind === "waiter_call" &&
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

  function requestCancel(orderId: string) {
    setCancelAuthOrderId(orderId);
    setLogin("");
    setPassword("");
    setAuthError(null);
  }

  function closeCancelAuthDialog() {
    setCancelAuthOrderId(null);
    setLogin("");
    setPassword("");
    setAuthError(null);
  }

  async function submitCancelAuth() {
    if (login === "admin" && password === "admin") {
      const orderId = cancelAuthOrderId;
      closeCancelAuthDialog();

      if (orderId) {
        await changeStatus(orderId, "cancelled");
      }

      return;
    }

    setAuthError("Неверный логин или пароль.");
  }

  if (loading) {
    return <p className="muted">Загружаем входящие заказы...</p>;
  }

  const tableOptions = [...new Set(orders.map((order) => order.tableNumber))].sort(
    (left, right) => left - right
  );

  const filteredOrders = orders.filter((order) =>
    selectedTables.length === 0
      ? true
      : selectedTables.includes(order.tableNumber)
  );

  function toggleTable(tableNumber: number) {
    setSelectedTables((current) =>
      current.includes(tableNumber)
        ? current.filter((value) => value !== tableNumber)
        : [...current, tableNumber].sort((left, right) => left - right)
    );
  }

  if (!orders.length) {
    return <p className="muted">Новых заказов пока нет.</p>;
  }

  return (
    <>
      {cancelAuthOrderId ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-auth-title"
          >
            <h2 id="cancel-auth-title">Подтвердите отмену</h2>
            <div className="modal-form">
              <input
                className="modal-input"
                type="text"
                placeholder="Логин"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
              />
              <input
                className="modal-input"
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {authError ? <p className="modal-error">{authError}</p> : null}
            <div className="modal-actions">
              <button
                className="button-danger"
                type="button"
                aria-label="Закрыть"
                onClick={closeCancelAuthDialog}
              >
                ✕
              </button>
              <button
                className="button-success"
                type="button"
                aria-label="Подтвердить"
                onClick={() => void submitCancelAuth()}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="orders-layout">
      <div className="orders-filter">
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
            Все столы
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
              Стол {tableNumber}
            </button>
          ))}
        </div>
      </div>

      {!filteredOrders.length ? (
        <p className="muted">По выбранному столику активных заказов нет.</p>
      ) : (
        <div className="orders-grid">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className={
                order.kind === "waiter_call"
                  ? "order-card order-card--alert"
                  : "order-card"
              }
            >
              <div className="order-card__header">
                <div>
                  <p className="eyebrow">{order.restaurantName}</p>
                  <h3>
                    Столик {order.tableNumber}
                    {order.kind === "waiter_call" ? " · Вызов официанта" : ""}
                  </h3>
                  {order.kind === "waiter_call" ? null : (
                    <p className="muted">
                      Сессия ID #{order.sessionId}
                      {order.serveMode
                        ? ` · ${serveModeLabels[order.serveMode]}`
                        : ""}
                    </p>
                  )}
                </div>
                <span className={`status-pill status-pill--${order.status}`}>
                  {statusLabels[order.status]}
                </span>
              </div>

              {order.kind === "waiter_call" ? (
                <p className="order-callout">Гость просит подойти к столику.</p>
              ) : (
                <div className="order-items">
                  {order.items.map((item) => (
                    <div key={item.id} className="order-row">
                      <div className="order-item-main">
                        <label className="order-item-check">
                          <input
                            type="checkbox"
                            checked={item.served}
                            onChange={(event) =>
                              toggleOrderItem(order.id, item.id, event.target.checked)
                            }
                          />
                          <span>
                            {item.quantity} x {item.name}
                          </span>
                        </label>
                        <strong>{formatCurrency(item.price * item.quantity)}</strong>
                      </div>
                      <div className="order-item-actions">
                        <div className="order-item-stepper">
                          <button
                            className="button-neutral"
                            type="button"
                            onClick={() =>
                              changeOrderItemQuantity(order.id, item.id, -1)
                            }
                          >
                            -
                          </button>
                          <span>{item.quantity}</span>
                          <button
                            className="button-neutral"
                            type="button"
                            onClick={() =>
                              changeOrderItemQuantity(order.id, item.id, 1)
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="order-card__footer">
                <span>{new Date(order.createdAt).toLocaleTimeString("ru-RU")}</span>
                <strong>
                  {order.kind === "waiter_call"
                    ? "Приоритет"
                    : formatCurrency(order.total)}
                </strong>
              </div>

              <div className="order-actions">
                {order.kind === "waiter_call" ? (
                  <button
                    className="button-success"
                    type="button"
                    onClick={() => changeStatus(order.id, "served")}
                  >
                    OK
                  </button>
                ) : (
                  <>
                    <button
                      className="button-neutral"
                      type="button"
                      onClick={() => changeStatus(order.id, "preparing")}
                    >
                      Готовится
                    </button>
                    <button
                      className="button-success"
                      type="button"
                      onClick={() => changeStatus(order.id, "served")}
                    >
                      Подан
                    </button>
                    <button
                      className="button-danger"
                      type="button"
                      onClick={() => requestCancel(order.id)}
                    >
                      Отменить
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      </div>
    </>
  );
}
