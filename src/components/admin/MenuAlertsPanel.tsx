"use client";

import { memo } from "react";

import { MenuCategory } from "@/lib/types";

type Props = {
  notificationsOpen: boolean;
  kitchenLoadWarningEnabled: boolean;
  kitchenLoadWarningSaving: boolean;
  toggleKitchenLoadWarning: (enabled: boolean) => Promise<void>;
  happyHourEnabled: boolean;
  happyHourSaving: boolean;
  happyHourModalOpen: boolean;
  happyHourText: string;
  happyHourCategories: MenuCategory[];
  happyHourDiscountPercent: string;
  happyHourStartsFrom: string;
  happyHourUntil: string;
  openHappyHourModal: () => void;
  saveHappyHourSettings: (
    enabled: boolean,
    text: string,
    categories: MenuCategory[],
    discountPercent: string,
    startsFrom: string,
    until: string
  ) => Promise<void>;
  setHappyHourStartsFrom: (value: string) => void;
  setHappyHourUntil: (value: string) => void;
  kitchenOpenEnabled: boolean;
  kitchenOpenSaving: boolean;
  kitchenOpenUntil: string;
  saveKitchenOpenSettings: (
    enabled: boolean,
    until: string
  ) => Promise<void>;
  setKitchenOpenUntil: (value: string) => void;
  barOpenEnabled: boolean;
  barOpenSaving: boolean;
  barOpenUntil: string;
  saveBarOpenSettings: (
    enabled: boolean,
    until: string
  ) => Promise<void>;
  setBarOpenUntil: (value: string) => void;
  happyHourDraftText: string;
  setHappyHourDraftText: (value: string) => void;
  happyHourDraftDiscountPercent: string;
  setHappyHourDraftDiscountPercent: (value: string) => void;
  happyHourDraftCategories: MenuCategory[];
  toggleHappyHourDraftCategory: (category: MenuCategory) => void;
  setHappyHourModalOpen: (open: boolean) => void;
  saveHappyHourModal: () => Promise<void>;
  dishCategories: MenuCategory[];
  allDrinkCategories: MenuCategory[];
  categoryLabels: Record<MenuCategory, string>;
};

function MenuAlertsPanelComponent({
  notificationsOpen,
  kitchenLoadWarningEnabled,
  kitchenLoadWarningSaving,
  toggleKitchenLoadWarning,
  happyHourEnabled,
  happyHourSaving,
  happyHourModalOpen,
  happyHourText,
  happyHourCategories,
  happyHourDiscountPercent,
  happyHourStartsFrom,
  happyHourUntil,
  openHappyHourModal,
  saveHappyHourSettings,
  setHappyHourStartsFrom,
  setHappyHourUntil,
  kitchenOpenEnabled,
  kitchenOpenSaving,
  kitchenOpenUntil,
  saveKitchenOpenSettings,
  setKitchenOpenUntil,
  barOpenEnabled,
  barOpenSaving,
  barOpenUntil,
  saveBarOpenSettings,
  setBarOpenUntil,
  happyHourDraftText,
  setHappyHourDraftText,
  happyHourDraftDiscountPercent,
  setHappyHourDraftDiscountPercent,
  happyHourDraftCategories,
  toggleHappyHourDraftCategory,
  setHappyHourModalOpen,
  saveHappyHourModal,
  dishCategories,
  allDrinkCategories,
  categoryLabels
}: Props) {
  return (
    <>
      {happyHourModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true">
            <h2>Happy hour</h2>
            <div className="menu-editor__form">
              <label className="menu-editor__field">
                <span>Text</span>
                <textarea
                  className="modal-input menu-notice-control__inline-textarea"
                  value={happyHourDraftText}
                  placeholder="happy hour"
                  rows={2}
                  disabled={happyHourSaving}
                  onChange={(event) => setHappyHourDraftText(event.target.value)}
                />
              </label>

              <label className="menu-editor__field">
                <span>Discount %</span>
                <input
                  className="modal-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={happyHourDraftDiscountPercent}
                  disabled={happyHourSaving}
                  onChange={(event) =>
                    setHappyHourDraftDiscountPercent(event.target.value)
                  }
                />
              </label>

              <div className="menu-editor__field">
                <span>Categories (multiple)</span>
                <div className="menu-editor__field">
                  <span>Dishes</span>
                  <div className="orders-filter__chips">
                    {dishCategories.map((category) => (
                      <button
                        key={`happy-hour-dish-${category}`}
                        type="button"
                        className={
                          happyHourDraftCategories.includes(category)
                            ? "orders-filter__chip orders-filter__chip--active"
                            : "orders-filter__chip"
                        }
                        onClick={() => toggleHappyHourDraftCategory(category)}
                        disabled={happyHourSaving}
                      >
                        {categoryLabels[category]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="menu-editor__field">
                  <span>Drinks</span>
                  <div className="orders-filter__chips">
                    {allDrinkCategories.map((category) => (
                      <button
                        key={`happy-hour-drink-${category}`}
                        type="button"
                        className={
                          happyHourDraftCategories.includes(category)
                            ? "orders-filter__chip orders-filter__chip--active"
                            : "orders-filter__chip"
                        }
                        onClick={() => toggleHappyHourDraftCategory(category)}
                        disabled={happyHourSaving}
                      >
                        {categoryLabels[category]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="button-danger"
                type="button"
                onClick={() => setHappyHourModalOpen(false)}
                disabled={happyHourSaving}
              >
                ✕
              </button>
              <button
                className="button-success"
                type="button"
                onClick={() => void saveHappyHourModal()}
                disabled={happyHourSaving}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notificationsOpen ? (
        <>
          <div className="menu-notice-control menu-notice-control--inline">
            <label className="menu-notice-control__toggle">
              <input
                type="checkbox"
                checked={kitchenLoadWarningEnabled}
                disabled={kitchenLoadWarningSaving}
                onChange={(event) =>
                  void toggleKitchenLoadWarning(event.target.checked)
                }
              />
              <span
                className={
                  kitchenLoadWarningEnabled
                    ? "menu-notice-control__text menu-notice-control__text--active"
                    : "menu-notice-control__text"
                }
              >
                Due to a high volume of orders, preparation time may be longer than usual. Thank you for your patience.
              </span>
            </label>
          </div>
          <div className="menu-notice-control menu-notice-control--inline">
            <label className="menu-notice-control__toggle">
              <input
                type="checkbox"
                checked={happyHourEnabled}
                disabled={happyHourSaving}
                onChange={(event) =>
                  void saveHappyHourSettings(
                    event.target.checked,
                    happyHourText,
                    happyHourCategories,
                    happyHourDiscountPercent,
                    happyHourStartsFrom,
                    happyHourUntil
                  )
                }
              />
              <span
                className={
                  happyHourEnabled
                    ? "menu-notice-control__text menu-notice-control__text--neutral-active"
                    : "menu-notice-control__text"
                }
              >
                Promo
              </span>
            </label>
            <button
              type="button"
              className={
                happyHourModalOpen
                  ? "admin-menu-bubble admin-menu-bubble--active"
                  : "admin-menu-bubble"
              }
              onClick={openHappyHourModal}
              disabled={happyHourSaving}
            >
              Happy hour
            </button>
            <label className="menu-settings-panel__field menu-settings-panel__field--compact">
              <span>Starts from</span>
              <div className="menu-time-input">
                <input
                  className="modal-input"
                  type="time"
                  value={happyHourStartsFrom}
                  placeholder="HH:MM"
                  disabled={happyHourSaving}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setHappyHourStartsFrom(nextValue);

                    if (happyHourEnabled) {
                      void saveHappyHourSettings(
                        true,
                        happyHourText,
                        happyHourCategories,
                        happyHourDiscountPercent,
                        nextValue,
                        happyHourUntil
                      );
                    }
                  }}
                />
              </div>
            </label>
            <label className="menu-settings-panel__field menu-settings-panel__field--compact">
              <span>Until</span>
              <div className="menu-time-input">
                <input
                  className="modal-input"
                  type="time"
                  value={happyHourUntil}
                  placeholder="HH:MM"
                  disabled={happyHourSaving}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setHappyHourUntil(nextValue);

                    if (happyHourEnabled) {
                      void saveHappyHourSettings(
                        true,
                        happyHourText,
                        happyHourCategories,
                        happyHourDiscountPercent,
                        happyHourStartsFrom,
                        nextValue
                      );
                    }
                  }}
                />
              </div>
            </label>
            {happyHourEnabled ? (
              <p className="muted">
                {happyHourText || "happy hour"} · -{happyHourDiscountPercent || "0"}% ·{" "}
                {happyHourCategories.length} categories
              </p>
            ) : null}
          </div>
          <div className="menu-notice-control menu-notice-control--inline">
            <label className="menu-notice-control__toggle">
              <input
                type="checkbox"
                checked={kitchenOpenEnabled}
                disabled={kitchenOpenSaving}
                onChange={(event) =>
                  void saveKitchenOpenSettings(
                    event.target.checked,
                    kitchenOpenUntil
                  )
                }
              />
              <span
                className={
                  kitchenOpenEnabled
                    ? "menu-notice-control__text menu-notice-control__text--neutral-active"
                    : "menu-notice-control__text"
                }
              >
                Kitchen open
              </span>
            </label>
            <label className="menu-settings-panel__field menu-settings-panel__field--compact">
              <span>Until</span>
              <div className="menu-time-input">
                <input
                  className="modal-input"
                  type="time"
                  value={kitchenOpenUntil}
                  placeholder="HH:MM"
                  disabled={kitchenOpenSaving}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setKitchenOpenUntil(nextValue);

                    if (kitchenOpenEnabled) {
                      void saveKitchenOpenSettings(true, nextValue);
                    }
                  }}
                />
              </div>
            </label>
          </div>
          <div className="menu-notice-control menu-notice-control--inline">
            <label className="menu-notice-control__toggle">
              <input
                type="checkbox"
                checked={barOpenEnabled}
                disabled={barOpenSaving}
                onChange={(event) =>
                  void saveBarOpenSettings(event.target.checked, barOpenUntil)
                }
              />
              <span
                className={
                  barOpenEnabled
                    ? "menu-notice-control__text menu-notice-control__text--neutral-active"
                    : "menu-notice-control__text"
                }
              >
                Bar open
              </span>
            </label>
            <label className="menu-settings-panel__field menu-settings-panel__field--compact">
              <span>Until</span>
              <div className="menu-time-input">
                <input
                  className="modal-input"
                  type="time"
                  value={barOpenUntil}
                  placeholder="HH:MM"
                  disabled={barOpenSaving}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setBarOpenUntil(nextValue);

                    if (barOpenEnabled) {
                      void saveBarOpenSettings(true, nextValue);
                    }
                  }}
                />
              </div>
            </label>
          </div>
        </>
      ) : null}
    </>
  );
}

export const MenuAlertsPanel = memo(MenuAlertsPanelComponent);
