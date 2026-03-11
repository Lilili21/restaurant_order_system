"use client";

import { useEffect, useMemo, useState } from "react";

import { MenuList } from "@/components/menu/MenuList";
import { formatCurrency } from "@/lib/menu";
import { CartItem, MenuItem, Order, ServeMode } from "@/lib/types";

type CartProps = {
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  menu: MenuItem[];
  initialSubmittedOrders: Order[];
};

const WAITER_CALL_COOLDOWN_MS = 2 * 60 * 1000;

export function Cart({
  restaurantSlug,
  restaurantName,
  tableNumber,
  menu,
  initialSubmittedOrders
}: CartProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [showServeModeDialog, setShowServeModeDialog] = useState(false);
  const [submittedOrders, setSubmittedOrders] = useState<Order[]>(
    initialSubmittedOrders
  );
  const [waiterCallBlockedUntil, setWaiterCallBlockedUntil] = useState(0);

  const detailedItems = useMemo(() => {
    return items
      .map((cartItem) => {
        const menuItem = menu.find((item) => item.id === cartItem.menuItemId);
        return menuItem ? { cartItem, menuItem } : null;
      })
      .filter(Boolean) as { cartItem: CartItem; menuItem: MenuItem }[];
  }, [items, menu]);

  const total = detailedItems.reduce(
    (sum, item) => sum + item.menuItem.price * item.cartItem.quantity,
    0
  );

  const quantities = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.menuItemId] = item.quantity;
    return acc;
  }, {});

  const submittedOrdersTotal = submittedOrders.reduce(
    (sum, order) => sum + order.total,
    0
  );
  const waiterCallDisabled = waiterCallBlockedUntil > Date.now();

  useEffect(() => {
    let cancelled = false;

    async function syncSubmittedOrders() {
      if (document.visibilityState === "hidden") {
        return;
      }

      const response = await fetch(
        `/api/tables/${restaurantSlug}/${tableNumber}`,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        submittedOrders?: Order[];
      };

      if (!cancelled) {
        setSubmittedOrders(data.submittedOrders ?? []);
      }
    }

    const intervalId = window.setInterval(syncSubmittedOrders, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [restaurantSlug, tableNumber]);

  useEffect(() => {
    const storageKey = `waiter-call:${restaurantSlug}:${tableNumber}`;
    const savedValue = window.localStorage.getItem(storageKey);
    const savedTimestamp = savedValue ? Number(savedValue) : 0;

    if (savedTimestamp > Date.now()) {
      setWaiterCallBlockedUntil(savedTimestamp);
    }
  }, [restaurantSlug, tableNumber]);

  useEffect(() => {
    if (!waiterCallBlockedUntil || waiterCallBlockedUntil <= Date.now()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setWaiterCallBlockedUntil(0);
    }, waiterCallBlockedUntil - Date.now());

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [waiterCallBlockedUntil]);

  function addItem(menuItemId: string) {
    setItems((current) => {
      const existing = current.find((item) => item.menuItemId === menuItemId);

      if (existing) {
        return current.map((item) =>
          item.menuItemId === menuItemId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { menuItemId, quantity: 1 }];
    });
  }

  function changeQuantity(menuItemId: string, delta: number) {
    setItems((current) =>
      current
        .map((item) =>
          item.menuItemId === menuItemId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  async function submitOrder(serveMode: ServeMode) {
    setSubmitting(true);
    setMessage(null);
    setShowServeModeDialog(false);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          restaurantSlug,
          tableNumber,
          items,
          serveMode
        })
      });

      if (!response.ok) {
        throw new Error("Не удалось отправить заказ");
      }

      const order = (await response.json()) as Order;
      setItems([]);
      setSubmittedOrders((current) => {
        const existingIndex = current.findIndex((item) => item.id === order.id);

        if (existingIndex === -1) {
          return [order, ...current];
        }

        return current.map((item) => (item.id === order.id ? order : item));
      });
      setDialogMessage(
        "Поздравляем, ваш заказ отправлен. Мы готовим с любовью."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Произошла ошибка при заказе."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openServeModeDialog() {
    if (!items.length) {
      setMessage("Добавьте хотя бы одно блюдо.");
      return;
    }

    setShowServeModeDialog(true);
  }

  async function callWaiter() {
    setMessage(null);

    if (waiterCallDisabled) {
      return;
    }

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "waiter_call",
          restaurantSlug,
          tableNumber
        })
      });

      if (!response.ok) {
        throw new Error("Не удалось вызвать официанта");
      }

      const blockedUntil = Date.now() + WAITER_CALL_COOLDOWN_MS;
      const storageKey = `waiter-call:${restaurantSlug}:${tableNumber}`;
      window.localStorage.setItem(storageKey, String(blockedUntil));
      setWaiterCallBlockedUntil(blockedUntil);
      setDialogMessage("Официант вызван");
    } catch (error) {
      setDialogMessage(
        error instanceof Error ? error.message : "Произошла ошибка при вызове."
      );
    }
  }

  function formatOrderLabel(createdAt: string) {
    return `Заказ · ${new Date(createdAt).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
  }

  return (
    <>
      {dialogMessage ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Сообщение"
          >
            <p className="modal-card__message">{dialogMessage}</p>
            <button
              className="button-success modal-card__ack"
              type="button"
              onClick={() => setDialogMessage(null)}
            >
              спасибо
            </button>
          </div>
        </div>
      ) : null}

      {showServeModeDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="serve-mode-dialog-title"
          >
            <button
              className="modal-card__close"
              type="button"
              aria-label="Закрыть окно"
              onClick={() => setShowServeModeDialog(false)}
            >
              X
            </button>
            <h2 id="serve-mode-dialog-title">Как подать заказ?</h2>
            <p>Выберите удобный вариант подачи блюд.</p>
            <div className="modal-actions">
              <button
                className="button-success"
                type="button"
                onClick={() => submitOrder("all_at_once")}
              >
                Подать все сразу
              </button>
              <button
                className="button-neutral"
                type="button"
                onClick={() => submitOrder("as_ready")}
              >
                По мере готовности
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="page-shell">
        <section className="hero">
          <div>
            <p className="eyebrow">Столик {tableNumber}</p>
            <h1>{restaurantName}</h1>
          </div>
          <div className="menu-action-card">
            <button
              className="button-danger button-danger--call"
              type="button"
              onClick={callWaiter}
              disabled={waiterCallDisabled}
            >
              Вызвать официанта
            </button>
          </div>
        </section>

        <div className="content-grid">
          <MenuList
            items={menu}
            quantities={quantities}
            onAdd={addItem}
            onDecrease={(menuItemId) => changeQuantity(menuItemId, -1)}
          />

          <aside className="cart-panel">
            <div className="section-header">
              <h2>Новый заказ</h2>
            </div>

            {!detailedItems.length ? (
              <p className="muted">
                Пока пусто. Добавьте блюда из меню слева.
              </p>
            ) : (
              <div className="cart-list">
                {detailedItems.map(({ cartItem, menuItem }) => (
                  <div className="cart-row" key={menuItem.id}>
                    <div>
                      <strong>{menuItem.name}</strong>
                      <p className="muted">{formatCurrency(menuItem.price)}</p>
                    </div>
                    <div className="quantity-box">
                      <button
                        type="button"
                        onClick={() => changeQuantity(menuItem.id, -1)}
                      >
                        -
                      </button>
                      <span>{cartItem.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(menuItem.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="cart-summary">
              <span>Итого</span>
              <strong>{formatCurrency(total)}</strong>
            </div>

            <button
              className="cart-submit"
              type="button"
              onClick={openServeModeDialog}
              disabled={submitting}
            >
              {submitting ? "Отправка..." : "Отправить заказ"}
            </button>

            {message ? <p className="status-message">{message}</p> : null}

            {submittedOrders.length ? (
              <details className="submitted-orders" open={false}>
                <summary className="submitted-orders__summary">
                  <div>
                    <p className="eyebrow">Отправлено</p>
                    <h2>Текущие заказы</h2>
                  </div>
                  <span className="submitted-orders__hint">Развернуть</span>
                </summary>
                <div className="submitted-orders__content">
                  <div className="submitted-orders-total">
                    <span>Общая сумма</span>
                    <strong>{formatCurrency(submittedOrdersTotal)}</strong>
                  </div>
                  {submittedOrders.map((order) => (
                    <article key={order.id} className="submitted-order-card">
                      <div className="order-card__header">
                        <div>
                          <strong>{formatOrderLabel(order.createdAt)}</strong>
                        </div>
                        <span className="status-pill status-pill--new">Отправлен</span>
                      </div>
                      <div className="table-order-items">
                        {order.items.map((item) => (
                          <div key={item.id} className="table-order-item">
                            <span>
                              {item.quantity} x {item.name}
                            </span>
                            <strong>{formatCurrency(item.price * item.quantity)}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
