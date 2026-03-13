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
  const [selectedZone, setSelectedZone] = useState<"hall" | "kitchen" | "bar">("hall");
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
      setAuthError(error.message ?? "Неверный логин или пароль.");
      return;
    }

    const orderId = cancelAuthOrderId;
    closeCancelAuthDialog();

    if (orderId) {
      await changeStatus(orderId, "cancelled");
    }
  }

  if (loading) {
    return <p className="muted">Загружаем входящие заказы...</p>;
  }

  const tableOptions = [...new Set(orders.map((order) => order.tableNumber))].sort(
    (left, right) => left - right
  );

  const filteredOrders = orders.filter((order) =>
    (selectedTables.length === 0
      ? true
      : selectedTables.includes(order.tableNumber)) &&
    (selectedZone === "hall"
      ? true
      : selectedZone === "bar"
        ? order.kind !== "waiter_call" &&
          order.items.some((item) => item.category === "drinks")
        : order.kind !== "waiter_call" &&
          order.items.some((item) => item.category !== "drinks"))
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
            Зал
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
            Кухня
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
            Бар
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
      </div>

      {!filteredOrders.length ? (
        <p className="muted">По выбранному столику активных заказов нет.</p>
      ) : (
        <div className="orders-grid">
          {filteredOrders.map((order) => {
            const isHallView = selectedZone === "hall";
            const isStationView = !isHallView;
            const isBarView = selectedZone === "bar";
            const visibleItems =
              isHallView
                ? order.items
                : isBarView
                ? order.items.filter((item) => item.category === "drinks")
                : order.items.filter((item) => item.category !== "drinks");
            const visibleTotal = visibleItems.reduce(
              (sum, item) => sum + item.price * item.quantity,
              0
            );

            return (
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
                    <h3>
                      Столик {order.tableNumber}
                      {isHallView && order.kind === "waiter_call"
                        ? " · Вызов официанта"
                        : ""}
                    </h3>
                    {order.kind === "waiter_call" ? null : (
                      <p className="muted">
                        Сессия ID #{order.sessionId}
                        {isHallView && order.serveMode
                          ? ` · ${serveModeLabels[order.serveMode]}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="order-header-meta">
                    {order.kind === "waiter_call" ? null : isStationView ? null : (
                      <span className={`status-pill status-pill--${order.status}`}>
                        {statusLabels[order.status]}
                      </span>
                    )}
                    <span className="muted">
                      {new Date(order.createdAt).toLocaleTimeString("ru-RU")}
                    </span>
                  </div>
                </div>

                {order.kind === "waiter_call" ? (
                  <p className="order-callout">Гость просит подойти к столику.</p>
                ) : (
                  <div className="order-items">
                    {visibleItems.map((item) => (
                      <div key={item.id} className="order-row">
                        <div className="order-item-main">
                          {isStationView ? (
                            <span>
                              {item.quantity} x {item.name}
                            </span>
                          ) : (
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
                          )}
                          {isStationView ? null : (
                            <strong>{formatCurrency(item.price * item.quantity)}</strong>
                          )}
                        </div>
                        {isStationView ? null : (
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
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="order-card__footer">
                  {isStationView ? null : (
                    <strong>
                      {order.kind === "waiter_call"
                        ? "Приоритет"
                        : formatCurrency(visibleTotal)}
                    </strong>
                  )}
                </div>

                <div className="order-actions">
                  {isHallView && order.kind === "waiter_call" ? (
                    <button
                      className="button-success"
                      type="button"
                      onClick={() => changeStatus(order.id, "served")}
                    >
                      OK
                    </button>
                  ) : isStationView ? null : (
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
            );
          })}
        </div>
      )}
      </div>
    </>
  );
}
