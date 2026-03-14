"use client";

import { useEffect, useMemo, useState } from "react";

import { MenuList } from "@/components/menu/MenuList";
import { formatCurrency } from "@/lib/menu";
import { CartItem, MenuItem, MenuLanguage, Order, ServeMode } from "@/lib/types";

type CartProps = {
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  tableToken: string;
  menu: MenuItem[];
  showKitchenLoadWarning: boolean;
  initialSubmittedOrders: Order[];
};

const WAITER_CALL_COOLDOWN_MS = 2 * 60 * 1000;

const uiText = {
  he: {
    table: "שולחן",
    callWaiter: "קרא למלצר",
    reviewOrderTitle: "בדקו את ההזמנה שלכם",
    reviewOrderText: "נא לעבור על ההזמנה לפני השליחה.",
    reviewOrderOk: "אישור",
    reviewOrderChange: "עריכה",
    serveModeTitle: "איך להגיש את ההזמנה?",
    serveModeText: "בחרו את אופן ההגשה המתאים לכם.",
    serveAll: "להגיש הכול יחד",
    serveAsReady: "להגיש לפי המוכן",
    newOrder: "הזמנה חדשה",
    emptyCart: "הסל עדיין ריק. הוסיפו מנות מהתפריט.",
    total: "סה\"כ",
    submit: "שלח הזמנה",
    submitting: "שולח...",
    currentOrders: "הזמנות נוכחיות",
    totalOrders: "סכום כולל",
    thankYou: "תודה",
    orderSent: "ההזמנה שלכם נשלחה. אנחנו מכינים באהבה.",
    waiterCalled: "המלצר הוזמן",
    kitchenLoadWarning:
      "ייתכן שזמן הכנת ההזמנה יהיה ארוך מהרגיל עקב עומס במטבח.",
    addDish: "הוסיפו לפחות מנה אחת.",
    submitError: "לא ניתן היה לשלוח את ההזמנה",
    waiterError: "לא ניתן היה לקרוא למלצר",
    close: "סגור חלון"
  },
  en: {
    table: "Table",
    callWaiter: "Call waiter",
    reviewOrderTitle: "Check your order",
    reviewOrderText: "Please review your order before sending it.",
    reviewOrderOk: "OK",
    reviewOrderChange: "Change",
    serveModeTitle: "How should we serve your order?",
    serveModeText: "Choose the serving option that works best for you.",
    serveAll: "Serve everything together",
    serveAsReady: "Serve as ready",
    newOrder: "New order",
    emptyCart: "It is empty for now. Add dishes from the menu.",
    total: "Total",
    submit: "Send order",
    submitting: "Sending...",
    currentOrders: "Current orders",
    totalOrders: "Total amount",
    thankYou: "Thanks",
    orderSent: "Your order has been sent. We are cooking with love.",
    waiterCalled: "Waiter has been called",
    kitchenLoadWarning:
      "Order preparation may take longer than usual right now due to a busy kitchen.",
    addDish: "Add at least one dish.",
    submitError: "Failed to send the order",
    waiterError: "Failed to call the waiter",
    close: "Close dialog"
  }
} as const;

export function Cart({
  restaurantSlug,
  restaurantName,
  tableNumber,
  tableToken,
  menu,
  showKitchenLoadWarning,
  initialSubmittedOrders
}: CartProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showServeModeDialog, setShowServeModeDialog] = useState(false);
  const [language, setLanguage] = useState<MenuLanguage>("he");
  const [submittedOrdersOpen, setSubmittedOrdersOpen] = useState(false);
  const [submittedOrders, setSubmittedOrders] = useState<Order[]>(
    initialSubmittedOrders
  );
  const [currentSessionId, setCurrentSessionId] = useState(
    initialSubmittedOrders[0]?.sessionId ?? 1
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
  const text = uiText[language];

  function getMenuItemDisplayName(menuItemId: string) {
    const menuItem = menu.find((item) => item.id === menuItemId);

    if (!menuItem) {
      return "";
    }

    return language === "he"
      ? menuItem.nameHe || menuItem.name
      : menuItem.nameEn || menuItem.nameHe || menuItem.name;
  }

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(
      `menu-language:${restaurantSlug}:${tableToken}`
    );

    if (savedLanguage === "he" || savedLanguage === "en") {
      setLanguage(savedLanguage);
    }
  }, [restaurantSlug, tableToken]);

  function setNextLanguage(nextLanguage: MenuLanguage) {
    setLanguage(nextLanguage);
    window.localStorage.setItem(
      `menu-language:${restaurantSlug}:${tableToken}`,
      nextLanguage
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function syncSubmittedOrders() {
      if (document.visibilityState === "hidden") {
        return;
      }

      const response = await fetch(
        `/api/tables/${restaurantSlug}/${tableToken}`,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        currentSessionId?: number;
        submittedOrders?: Order[];
      };

      if (!cancelled) {
        const nextSessionId = data.currentSessionId ?? currentSessionId;
        const nextOrders = data.submittedOrders ?? [];

        setCurrentSessionId(nextSessionId);
        setSubmittedOrders((current) => {
          if (nextSessionId !== currentSessionId) {
            return nextOrders;
          }

          if (nextOrders.length === 0) {
            return current;
          }

          const mergedById = new Map<string, Order>();

          [...current, ...nextOrders].forEach((order) => {
            if (order.sessionId === nextSessionId) {
              mergedById.set(order.id, order);
            }
          });

          return [...mergedById.values()].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt)
          );
        });
      }
    }

    void syncSubmittedOrders();
    const intervalId = window.setInterval(syncSubmittedOrders, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [restaurantSlug, tableToken, currentSessionId]);

  useEffect(() => {
    const storageKey = `waiter-call:${restaurantSlug}:${tableToken}`;
    const savedValue = window.localStorage.getItem(storageKey);
    const savedTimestamp = savedValue ? Number(savedValue) : 0;

    if (savedTimestamp > Date.now()) {
      setWaiterCallBlockedUntil(savedTimestamp);
    }
  }, [restaurantSlug, tableToken]);

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
    setShowReviewDialog(false);

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
        throw new Error(text.submitError);
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
      setDialogMessage(text.orderSent);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : text.submitError
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openServeModeDialog() {
    if (!items.length) {
      setMessage(text.addDish);
      return;
    }

    setShowReviewDialog(true);
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
        throw new Error(text.waiterError);
      }

      const blockedUntil = Date.now() + WAITER_CALL_COOLDOWN_MS;
      const storageKey = `waiter-call:${restaurantSlug}:${tableToken}`;
      window.localStorage.setItem(storageKey, String(blockedUntil));
      setWaiterCallBlockedUntil(blockedUntil);
      setDialogMessage(text.waiterCalled);
    } catch (error) {
      setDialogMessage(
        error instanceof Error ? error.message : text.waiterError
      );
    }
  }

  function formatOrderLabel(timestamp: string) {
    const locale = language === "he" ? "he-IL" : "en-US";
    const prefix = language === "he" ? "הזמנה" : "Order";

    return `${prefix} · ${new Date(timestamp).toLocaleTimeString(locale, {
      hour12: false,
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
            aria-label={
              language === "he"
                ? "הודעה"
                : language === "en"
                  ? "Message"
                  : "Message"
            }
          >
            <p className="modal-card__message">{dialogMessage}</p>
            <button
              className="button-success modal-card__ack"
              type="button"
              onClick={() => setDialogMessage(null)}
            >
              {text.thankYou}
            </button>
          </div>
        </div>
      ) : null}

      {showReviewDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--review"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-order-dialog-title"
          >
            <h2 id="review-order-dialog-title">{text.reviewOrderTitle}</h2>
            <p>{text.reviewOrderText}</p>
            <div className="table-order-items">
              {detailedItems.map(({ cartItem, menuItem }) => (
                <div key={menuItem.id} className="table-order-item">
                  <span>
                    {getMenuItemDisplayName(menuItem.id)} x {cartItem.quantity}
                  </span>
                  <strong>
                    {formatCurrency(menuItem.price * cartItem.quantity)}
                  </strong>
                </div>
              ))}
            </div>
            <div className="cart-summary">
              <span>{text.total}</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
            <div className="modal-actions">
              <button
                className="button-success"
                type="button"
                onClick={() => {
                  setShowReviewDialog(false);
                  setShowServeModeDialog(true);
                }}
              >
                {text.reviewOrderOk}
              </button>
              <button
                className="button-neutral"
                type="button"
                onClick={() => setShowReviewDialog(false)}
              >
                {text.reviewOrderChange}
              </button>
            </div>
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
              aria-label={text.close}
              onClick={() => {
                setShowServeModeDialog(false);
                setShowReviewDialog(false);
              }}
            >
              X
            </button>
            <h2 id="serve-mode-dialog-title">{text.serveModeTitle}</h2>
            <p>{text.serveModeText}</p>
            <div className="modal-actions">
              <button
                className="button-success"
                type="button"
                onClick={() => submitOrder("all_at_once")}
              >
                {text.serveAll}
              </button>
              <button
                className="button-neutral"
                type="button"
                onClick={() => submitOrder("as_ready")}
              >
                {text.serveAsReady}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="page-shell">
        <section className="hero">
          <div>
            <p className="eyebrow">
              {text.table} {tableNumber}
            </p>
            <h1>{restaurantName}</h1>
            {showKitchenLoadWarning ? (
              <p className="menu-kitchen-warning">{text.kitchenLoadWarning}</p>
            ) : null}
          </div>
          <div className="menu-action-card menu-action-card--stacked">
            <div className="language-toggle" role="group" aria-label="Language">
              <button
                className={
                  language === "he"
                    ? "language-toggle__button language-toggle__button--active"
                    : "language-toggle__button"
                }
                type="button"
                onClick={() => setNextLanguage("he")}
              >
                HE
              </button>
              <button
                className={
                  language === "en"
                    ? "language-toggle__button language-toggle__button--active"
                    : "language-toggle__button"
                }
                type="button"
                onClick={() => setNextLanguage("en")}
              >
                EN
              </button>
            </div>
            <button
              className="button-danger button-danger--call"
              type="button"
              onClick={callWaiter}
              disabled={waiterCallDisabled}
            >
              {text.callWaiter}
            </button>
          </div>
        </section>

        <div className="content-grid">
          <MenuList
            items={menu}
            language={language}
            quantities={quantities}
            onAdd={addItem}
            onDecrease={(menuItemId) => changeQuantity(menuItemId, -1)}
          />

          <aside className="cart-panel">
            <div className="section-header">
              <h2>{text.newOrder}</h2>
            </div>

            {!detailedItems.length ? (
              <p className="muted">{text.emptyCart}</p>
            ) : (
              <div className="cart-list">
                {detailedItems.map(({ cartItem, menuItem }) => (
                  <div className="cart-row" key={menuItem.id}>
                    <div>
                      <strong>{getMenuItemDisplayName(menuItem.id)}</strong>
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
              <span>{text.total}</span>
              <strong>{formatCurrency(total)}</strong>
            </div>

            <button
              className="cart-submit"
              type="button"
              onClick={openServeModeDialog}
              disabled={submitting}
            >
              {submitting ? text.submitting : text.submit}
            </button>

            {message ? <p className="status-message">{message}</p> : null}

            {submittedOrders.length ? (
              <details
                className="submitted-orders"
                open={submittedOrdersOpen}
                onToggle={(event) =>
                  setSubmittedOrdersOpen(event.currentTarget.open)
                }
              >
                <summary className="submitted-orders__summary">
                  <div>
                    <h2>{text.currentOrders}</h2>
                  </div>
                </summary>
                <div className="submitted-orders__content">
                  <div className="submitted-orders-total">
                    <span>{text.totalOrders}</span>
                    <strong>{formatCurrency(submittedOrdersTotal)}</strong>
                  </div>
                  {submittedOrders.map((order) => (
                    <article key={order.id} className="submitted-order-card">
                      <div className="order-card__header">
                        <div>
                          <strong>
                            {formatOrderLabel(order.updatedAt || order.createdAt)}
                          </strong>
                        </div>
                      </div>
                      <div className="table-order-items">
                        {order.items.map((item) => (
                          <div key={item.id} className="table-order-item">
                            <span>
                              {item.quantity} x{" "}
                              {getMenuItemDisplayName(item.menuItemId) || item.name}
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
