"use client";

import { memo, useRef } from "react";

import type {
  EditableBusinessLunch,
  EditableRecommendationRule,
  EditablePromotion
} from "@/components/admin/MenuPromotionTypes";
import { MenuCategory } from "@/lib/types";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSelectedDays(days: number[]) {
  if (!days.length) {
    return "no days";
  }

  return days
    .slice()
    .sort((left, right) => left - right)
    .map((day) => dayLabels[day] ?? day)
    .join(", ");
}

function formatPromotionCategorySummary(
  categories: MenuCategory[],
  categoryLabels: Record<MenuCategory, string>
) {
  if (!categories.length) {
    return "no categories";
  }

  if (categories.length <= 2) {
    return categories.map((category) => categoryLabels[category]).join(", ");
  }

  return `${categories.length} cats`;
}

type Props = {
  notificationsOpen: boolean;
  recommendationsOpen: boolean;
  settingsRecommendationsOpen: boolean;
  recommendationRules: EditableRecommendationRule[];
  recommendationRulesSaving: boolean;
  recommendationRulesMessage: string | null;
  recommendationItemOptions: Array<{
    id: string;
    label: string;
  }>;
  recommendationSmartSuggestions: Record<
    string,
    Array<{
      id: string;
      label: string;
      suggestedType: "item" | "category";
      suggestedItemId: string;
      suggestedCategory: MenuCategory | "";
    }>
  >;
  updateRecommendationRule: (
    ruleId: string,
    field:
      | "triggerItemId"
      | "suggestedType"
      | "suggestedItemId"
      | "suggestedCategory"
      | "enabled",
    value: string | boolean
  ) => void;
  addRecommendationRule: () => void;
  deleteRecommendationRule: (ruleId: string) => void;
  applyRecommendationSmartSuggestion: (
    ruleId: string,
    suggestion: {
      id: string;
      label: string;
      suggestedType: "item" | "category";
      suggestedItemId: string;
      suggestedCategory: MenuCategory | "";
    }
  ) => void;
  recommendations: Array<{
    id: string;
    title: string;
    summary: string;
    action: string;
    focusItems: string[];
    focusItemIds: string[];
    quickActionLabel: string;
  }>;
  onRunRecommendation: (recommendationId: string) => void;
  kitchenLoadWarningEnabled: boolean;
  kitchenLoadWarningSaving: boolean;
  toggleKitchenLoadWarning: (enabled: boolean) => Promise<void>;
  businessLunches: EditableBusinessLunch[];
  businessLunchSaving: boolean;
  businessLunchModalOpen: boolean;
  businessLunchDraft: EditableBusinessLunch | null;
  businessLunchMessage: string | null;
  openNewBusinessLunchModal: () => void;
  openEditBusinessLunchModal: (businessLunchId: string) => void;
  updateBusinessLunchDraft: (
    field: keyof EditableBusinessLunch,
    value: string | boolean | MenuCategory[] | number[]
  ) => void;
  toggleBusinessLunchDraftCategory: (category: MenuCategory) => void;
  toggleBusinessLunchDraftDay: (day: number) => void;
  setBusinessLunchModalOpen: (open: boolean) => void;
  saveBusinessLunchModal: () => Promise<void>;
  toggleBusinessLunchEnabled: (
    businessLunchId: string,
    enabled: boolean
  ) => Promise<void>;
  deleteBusinessLunch: (businessLunchId: string) => Promise<void>;
  promotions: EditablePromotion[];
  promotionSaving: boolean;
  promotionModalOpen: boolean;
  promotionDraft: EditablePromotion | null;
  promotionMessage: string | null;
  openNewPromotionModal: () => void;
  openEditPromotionModal: (promotionId: string) => void;
  updatePromotionDraft: (
    field: keyof EditablePromotion,
    value: string | boolean | MenuCategory[] | number[]
  ) => void;
  togglePromotionDraftCategory: (category: MenuCategory) => void;
  togglePromotionDraftDay: (day: number) => void;
  setPromotionModalOpen: (open: boolean) => void;
  savePromotionModal: () => Promise<void>;
  togglePromotionEnabled: (promotionId: string, enabled: boolean) => Promise<void>;
  deletePromotion: (promotionId: string) => Promise<void>;
  kitchenOpenEnabled: boolean;
  kitchenOpenSaving: boolean;
  kitchenOpenUntil: string;
  saveKitchenOpenSettings: (enabled: boolean, until: string) => Promise<void>;
  setKitchenOpenUntil: (value: string) => void;
  barOpenEnabled: boolean;
  barOpenSaving: boolean;
  barOpenUntil: string;
  saveBarOpenSettings: (enabled: boolean, until: string) => Promise<void>;
  setBarOpenUntil: (value: string) => void;
  dishCategories: MenuCategory[];
  allDrinkCategories: MenuCategory[];
  categoryLabels: Record<MenuCategory, string>;
};

function MenuAlertsPanelComponent({
  notificationsOpen,
  recommendationsOpen,
  settingsRecommendationsOpen,
  recommendationRules,
  recommendationRulesSaving,
  recommendationRulesMessage,
  recommendationItemOptions,
  recommendationSmartSuggestions,
  updateRecommendationRule,
  addRecommendationRule,
  deleteRecommendationRule,
  applyRecommendationSmartSuggestion,
  recommendations,
  onRunRecommendation,
  kitchenLoadWarningEnabled,
  kitchenLoadWarningSaving,
  toggleKitchenLoadWarning,
  businessLunches,
  businessLunchSaving,
  businessLunchModalOpen,
  businessLunchDraft,
  businessLunchMessage,
  openNewBusinessLunchModal,
  openEditBusinessLunchModal,
  updateBusinessLunchDraft,
  toggleBusinessLunchDraftCategory,
  toggleBusinessLunchDraftDay,
  setBusinessLunchModalOpen,
  saveBusinessLunchModal,
  toggleBusinessLunchEnabled,
  deleteBusinessLunch,
  promotions,
  promotionSaving,
  promotionModalOpen,
  promotionDraft,
  promotionMessage,
  openNewPromotionModal,
  openEditPromotionModal,
  updatePromotionDraft,
  togglePromotionDraftCategory,
  togglePromotionDraftDay,
  setPromotionModalOpen,
  savePromotionModal,
  togglePromotionEnabled,
  deletePromotion,
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
  dishCategories,
  allDrinkCategories,
  categoryLabels
}: Props) {
  const kitchenOpenUntilInputRef = useRef<HTMLInputElement | null>(null);
  const barOpenUntilInputRef = useRef<HTMLInputElement | null>(null);
  const recommendationItemLabelById = Object.fromEntries(
    recommendationItemOptions.map((item) => [item.id, item.label])
  ) as Record<string, string>;

  return (
    <>
      {businessLunchModalOpen && businessLunchDraft ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form modal-card--promo"
            role="dialog"
            aria-modal="true"
          >
            <h2>Business Lunch</h2>
            {businessLunchMessage ? (
              <p className="menu-notice-control__promo-message">
                {businessLunchMessage}
              </p>
            ) : null}
            <div className="menu-editor__form menu-notice-control__promo-form">
              <div className="menu-notice-control__promo-column">
                <label className="menu-editor__field">
                  <span>Text</span>
                  <textarea
                    className="modal-input menu-notice-control__inline-textarea"
                    value={businessLunchDraft.text}
                    placeholder="business lunch"
                    rows={2}
                    disabled={businessLunchSaving}
                    onChange={(event) =>
                      updateBusinessLunchDraft("text", event.target.value)
                    }
                  />
                </label>

                <div className="menu-editor__field">
                  <span>Days</span>
                  <div className="orders-filter__chips menu-notice-control__day-chips">
                    {dayLabels.map((label, day) => (
                      <button
                        key={`business-lunch-day-${businessLunchDraft.id}-${day}`}
                        type="button"
                        className={
                          businessLunchDraft.days.includes(day)
                            ? "orders-filter__chip orders-filter__chip--active menu-notice-control__day-chip"
                            : "orders-filter__chip menu-notice-control__day-chip"
                        }
                        onClick={() => toggleBusinessLunchDraftDay(day)}
                        disabled={businessLunchSaving}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="menu-notice-control menu-notice-control--inline menu-notice-control__promo-times">
                  <label className="menu-settings-panel__field menu-settings-panel__field--compact">
                    <span>Starts from</span>
                    <div className="menu-time-input">
                      <input
                        className="modal-input"
                        type="time"
                        value={businessLunchDraft.startsFrom}
                        placeholder="HH:MM"
                        disabled={businessLunchSaving}
                        onChange={(event) =>
                          updateBusinessLunchDraft("startsFrom", event.target.value)
                        }
                      />
                    </div>
                  </label>
                  <label className="menu-settings-panel__field menu-settings-panel__field--compact">
                    <span>Until</span>
                    <div className="menu-time-input">
                      <input
                        className="modal-input"
                        type="time"
                        value={businessLunchDraft.until}
                        placeholder="HH:MM"
                        disabled={businessLunchSaving}
                        onChange={(event) =>
                          updateBusinessLunchDraft("until", event.target.value)
                        }
                      />
                    </div>
                  </label>
                </div>
              </div>

              <div className="menu-notice-control__promo-column">
                <div className="menu-editor__field">
                  <span>Categories (multiple)</span>
                  <div className="menu-editor__field">
                    <span>Dishes</span>
                    <div className="orders-filter__chips">
                      {dishCategories.map((category) => (
                        <button
                          key={`business-lunch-dish-${businessLunchDraft.id}-${category}`}
                          type="button"
                          className={
                            businessLunchDraft.categories.includes(category)
                              ? "orders-filter__chip orders-filter__chip--active"
                              : "orders-filter__chip"
                          }
                          onClick={() => toggleBusinessLunchDraftCategory(category)}
                          disabled={businessLunchSaving}
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
                          key={`business-lunch-drink-${businessLunchDraft.id}-${category}`}
                          type="button"
                          className={
                            businessLunchDraft.categories.includes(category)
                              ? "orders-filter__chip orders-filter__chip--active"
                              : "orders-filter__chip"
                          }
                          onClick={() => toggleBusinessLunchDraftCategory(category)}
                          disabled={businessLunchSaving}
                        >
                          {categoryLabels[category]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="button-danger"
                type="button"
                onClick={() => setBusinessLunchModalOpen(false)}
                disabled={businessLunchSaving}
              >
                ✕
              </button>
              <button
                className="button-success"
                type="button"
                onClick={() => void saveBusinessLunchModal()}
                disabled={businessLunchSaving}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {promotionModalOpen && promotionDraft ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form modal-card--promo"
            role="dialog"
            aria-modal="true"
          >
            <h2>Promo</h2>
            {promotionMessage ? (
              <p className="menu-notice-control__promo-message">{promotionMessage}</p>
            ) : null}
            <div className="menu-editor__form menu-notice-control__promo-form">
              <div className="menu-notice-control__promo-column">
                <label className="menu-editor__field">
                  <span>Text</span>
                  <textarea
                    className="modal-input menu-notice-control__inline-textarea"
                    value={promotionDraft.text}
                    placeholder="happy hour"
                    rows={2}
                    disabled={promotionSaving}
                    onChange={(event) =>
                      updatePromotionDraft("text", event.target.value)
                    }
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
                    value={promotionDraft.discountPercent}
                    disabled={promotionSaving}
                    onChange={(event) =>
                      updatePromotionDraft("discountPercent", event.target.value)
                    }
                  />
                </label>

                <div className="menu-editor__field">
                  <span>Days</span>
                  <div className="orders-filter__chips menu-notice-control__day-chips">
                    {dayLabels.map((label, day) => (
                      <button
                        key={`promotion-day-${promotionDraft.id}-${day}`}
                        type="button"
                        className={
                          promotionDraft.days.includes(day)
                            ? "orders-filter__chip orders-filter__chip--active menu-notice-control__day-chip"
                            : "orders-filter__chip menu-notice-control__day-chip"
                        }
                        onClick={() => togglePromotionDraftDay(day)}
                        disabled={promotionSaving}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="menu-notice-control menu-notice-control--inline menu-notice-control__promo-times">
                  <label className="menu-settings-panel__field menu-settings-panel__field--compact">
                    <span>Starts from</span>
                    <div className="menu-time-input">
                      <input
                        className="modal-input"
                        type="time"
                        value={promotionDraft.startsFrom}
                        placeholder="HH:MM"
                        disabled={promotionSaving}
                        onChange={(event) =>
                          updatePromotionDraft("startsFrom", event.target.value)
                        }
                      />
                    </div>
                  </label>
                  <label className="menu-settings-panel__field menu-settings-panel__field--compact">
                    <span>Until</span>
                    <div className="menu-time-input">
                      <input
                        className="modal-input"
                        type="time"
                        value={promotionDraft.until}
                        placeholder="HH:MM"
                        disabled={promotionSaving}
                        onChange={(event) =>
                          updatePromotionDraft("until", event.target.value)
                        }
                      />
                    </div>
                  </label>
                </div>
              </div>

              <div className="menu-notice-control__promo-column">
                <div className="menu-editor__field">
                  <span>Categories (multiple)</span>
                  <div className="menu-editor__field">
                    <span>Dishes</span>
                    <div className="orders-filter__chips">
                      {dishCategories.map((category) => (
                        <button
                          key={`promotion-dish-${promotionDraft.id}-${category}`}
                          type="button"
                          className={
                            promotionDraft.categories.includes(category)
                              ? "orders-filter__chip orders-filter__chip--active"
                              : "orders-filter__chip"
                          }
                          onClick={() => togglePromotionDraftCategory(category)}
                          disabled={promotionSaving}
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
                          key={`promotion-drink-${promotionDraft.id}-${category}`}
                          type="button"
                          className={
                            promotionDraft.categories.includes(category)
                              ? "orders-filter__chip orders-filter__chip--active"
                              : "orders-filter__chip"
                          }
                          onClick={() => togglePromotionDraftCategory(category)}
                          disabled={promotionSaving}
                        >
                          {categoryLabels[category]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="button-danger"
                type="button"
                onClick={() => setPromotionModalOpen(false)}
                disabled={promotionSaving}
              >
                ✕
              </button>
              <button
                className="button-success"
                type="button"
                onClick={() => void savePromotionModal()}
                disabled={promotionSaving}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {recommendationsOpen ? (
        <div className="menu-notice-control">
          <div className="menu-notice-control__promo-list">
            {recommendations.map((recommendation) => (
              <div
                key={recommendation.id}
                className="menu-notice-control__promo-row recommendation-row"
              >
                <div className="recommendation-row__main">
                  <div>
                    <p className="menu-notice-control__promo-title">
                      {recommendation.title}
                    </p>
                    <p className="menu-notice-control__summary">
                      {recommendation.summary}
                    </p>
                  </div>
                  <p className="menu-notice-control__promo-message">Suggested action</p>
                  <p className="menu-notice-control__summary">
                    {recommendation.action}
                  </p>
                </div>
                <div className="recommendation-row__side">
                  <p className="menu-notice-control__promo-message">Focus items</p>
                  {recommendation.focusItems.length ? (
                    <div className="orders-filter__chips recommendation-row__chips">
                      {recommendation.focusItems.map((item) => (
                        <span key={item} className="orders-filter__chip">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="menu-notice-control__summary">
                      Applies at menu level.
                    </p>
                  )}
                  <button
                    className="admin-menu-bubble recommendation-row__action"
                    type="button"
                    onClick={() => onRunRecommendation(recommendation.id)}
                  >
                    {recommendation.quickActionLabel}
                  </button>
                </div>
              </div>
            ))}
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
              <div className="menu-time-input menu-time-input--with-confirm">
                <input
                  className="modal-input"
                  type="time"
                  ref={kitchenOpenUntilInputRef}
                  value={kitchenOpenUntil}
                  placeholder="HH:MM"
                  disabled={kitchenOpenSaving}
                  onChange={(event) => {
                    setKitchenOpenUntil(event.target.value);
                  }}
                />
                <button
                  type="button"
                  className="menu-time-input__confirm"
                  disabled={kitchenOpenSaving || !kitchenOpenEnabled}
                  aria-label="Apply kitchen open time"
                  onClick={() =>
                    void saveKitchenOpenSettings(
                      kitchenOpenEnabled,
                      kitchenOpenUntilInputRef.current?.value ?? kitchenOpenUntil
                    )
                  }
                >
                  ✓
                </button>
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
              <div className="menu-time-input menu-time-input--with-confirm">
                <input
                  className="modal-input"
                  type="time"
                  ref={barOpenUntilInputRef}
                  value={barOpenUntil}
                  placeholder="HH:MM"
                  disabled={barOpenSaving}
                  onChange={(event) => {
                    setBarOpenUntil(event.target.value);
                  }}
                />
                <button
                  type="button"
                  className="menu-time-input__confirm"
                  disabled={barOpenSaving || !barOpenEnabled}
                  aria-label="Apply bar open time"
                  onClick={() =>
                    void saveBarOpenSettings(
                      barOpenEnabled,
                      barOpenUntilInputRef.current?.value ?? barOpenUntil
                    )
                  }
                >
                  ✓
                </button>
              </div>
            </label>
          </div>

          <div className="menu-notice-control menu-notice-control--inline">
            <div className="menu-notice-control__promo-list">
              <div className="menu-notice-control__promo-title">Business Lunch</div>
              {businessLunchMessage ? (
                <p className="menu-notice-control__promo-message">
                  {businessLunchMessage}
                </p>
              ) : null}
              {businessLunches.map((businessLunch) => (
                <div
                  key={businessLunch.id}
                  className="menu-notice-control__promo-row"
                >
                  <label className="menu-notice-control__toggle">
                    <input
                      type="checkbox"
                      checked={businessLunch.enabled}
                      disabled={businessLunchSaving}
                      onChange={(event) =>
                        void toggleBusinessLunchEnabled(
                          businessLunch.id,
                          event.target.checked
                        )
                      }
                    />
                    <span
                      className={
                        businessLunch.enabled
                          ? "menu-notice-control__text menu-notice-control__text--neutral-active"
                          : "menu-notice-control__text"
                      }
                    >
                      Business Lunch
                    </span>
                  </label>
                  <button
                    type="button"
                    className="admin-menu-bubble admin-menu-bubble--business-lunch"
                    onClick={() => openEditBusinessLunchModal(businessLunch.id)}
                    disabled={businessLunchSaving}
                  >
                    {businessLunch.text || "Business Lunch"}
                  </button>
                  <span className="menu-notice-control__summary">
                    {businessLunch.startsFrom || "--:--"} -{" "}
                    {businessLunch.until || "--:--"} ·{" "}
                    {formatSelectedDays(businessLunch.days)} ·{" "}
                    {formatPromotionCategorySummary(
                      businessLunch.categories,
                      categoryLabels
                    )}
                  </span>
                  <button
                    className="button-danger button-danger--small"
                    type="button"
                    onClick={() => void deleteBusinessLunch(businessLunch.id)}
                    disabled={businessLunchSaving}
                  >
                    Delete
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button-neutral"
                onClick={openNewBusinessLunchModal}
                disabled={businessLunchSaving}
              >
                Add business lunch
              </button>
            </div>
          </div>

          <div className="menu-notice-control menu-notice-control--inline">
            <div className="menu-notice-control__promo-list">
              <div className="menu-notice-control__promo-title">Promo</div>
              {promotionMessage ? (
                <p className="menu-notice-control__promo-message">
                  {promotionMessage}
                </p>
              ) : null}
              {promotions.map((promotion) => (
                <div
                  key={promotion.id}
                  className="menu-notice-control__promo-row"
                >
                  <label className="menu-notice-control__toggle">
                    <input
                      type="checkbox"
                      checked={promotion.enabled}
                      disabled={promotionSaving}
                      onChange={(event) =>
                        void togglePromotionEnabled(
                          promotion.id,
                          event.target.checked
                        )
                      }
                    />
                    <span
                      className={
                        promotion.enabled
                          ? "menu-notice-control__text menu-notice-control__text--neutral-active"
                          : "menu-notice-control__text"
                      }
                    >
                      Promo
                    </span>
                  </label>
                  <button
                    type="button"
                    className="admin-menu-bubble"
                    onClick={() => openEditPromotionModal(promotion.id)}
                    disabled={promotionSaving}
                  >
                    {promotion.text || "Happy hour"}
                  </button>
                  <span className="menu-notice-control__summary">
                    {promotion.startsFrom || "--:--"} - {promotion.until || "--:--"} ·
                    {" "}-{promotion.discountPercent || "0"}% ·{" "}
                    {formatSelectedDays(promotion.days)} ·{" "}
                    {formatPromotionCategorySummary(
                      promotion.categories,
                      categoryLabels
                    )}
                  </span>
                  <button
                    className="button-danger button-danger--small"
                    type="button"
                    onClick={() => void deletePromotion(promotion.id)}
                    disabled={promotionSaving}
                  >
                    Delete
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button-neutral"
                onClick={openNewPromotionModal}
                disabled={promotionSaving || promotions.length >= 5}
              >
                {promotions.length >= 5 ? "Max 5 promos" : "Add promo"}
              </button>
            </div>
          </div>

        </>
      ) : null}

      {settingsRecommendationsOpen ? (
        <div className="menu-notice-control menu-notice-control--inline">
          <div className="menu-notice-control__promo-list">
            <div className="menu-notice-control__promo-title">Recommendations</div>
            {recommendationRulesMessage ? (
              <p className="menu-notice-control__promo-message">
                {recommendationRulesMessage}
              </p>
            ) : (
              <>
                <p className="menu-notice-control__summary">
                  Build guest-facing upsells that feel smart: after one item is added, suggest the most natural next step.
                </p>
                <p className="menu-notice-control__summary">
                  Up to 3 recommendations per trigger item.
                </p>
              </>
            )}
            {recommendationRules.map((recommendation) => (
              <div
                key={recommendation.id}
                className="menu-notice-control__promo-row menu-notice-control__promo-row--recommendation"
              >
                <label className="menu-notice-control__toggle">
                  <input
                    type="checkbox"
                    checked={recommendation.enabled}
                    disabled={recommendationRulesSaving}
                    onChange={(event) =>
                      updateRecommendationRule(
                        recommendation.id,
                        "enabled",
                        event.target.checked
                      )
                    }
                  />
                  <span
                    className={
                      recommendation.enabled
                        ? "menu-notice-control__text menu-notice-control__text--neutral-active"
                        : "menu-notice-control__text"
                    }
                  >
                    Recommendation
                  </span>
                </label>
                <label className="menu-settings-panel__field menu-settings-panel__field--compact">
                  <span>If guest adds</span>
                  <select
                    className="modal-input"
                    value={recommendation.triggerItemId}
                    disabled={recommendationRulesSaving}
                    onChange={(event) =>
                      updateRecommendationRule(
                        recommendation.id,
                        "triggerItemId",
                        event.target.value
                      )
                    }
                  >
                    <option value="">Select item</option>
                    {recommendationItemOptions.map((item) => (
                      <option key={`trigger-${recommendation.id}-${item.id}`} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="menu-settings-panel__field menu-settings-panel__field--compact">
                  <span>Suggest</span>
                  <select
                    className="modal-input"
                    value={recommendation.suggestedType}
                    disabled={recommendationRulesSaving}
                    onChange={(event) =>
                      updateRecommendationRule(
                        recommendation.id,
                        "suggestedType",
                        event.target.value
                      )
                    }
                  >
                    <option value="item">Item</option>
                    <option value="category">Category</option>
                  </select>
                </label>
                <label className="menu-settings-panel__field menu-settings-panel__field--compact">
                  <span>
                    {recommendation.suggestedType === "category"
                      ? "Suggested category"
                      : "Suggested item"}
                  </span>
                  {recommendation.suggestedType === "category" ? (
                    <select
                      className="modal-input"
                      value={recommendation.suggestedCategory}
                      disabled={recommendationRulesSaving}
                      onChange={(event) =>
                        updateRecommendationRule(
                          recommendation.id,
                          "suggestedCategory",
                          event.target.value
                        )
                      }
                    >
                      <option value="">Select category</option>
                      {[...dishCategories, ...allDrinkCategories].map((category) => (
                        <option
                          key={`suggested-category-${recommendation.id}-${category}`}
                          value={category}
                        >
                          {categoryLabels[category]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="modal-input"
                      value={recommendation.suggestedItemId}
                      disabled={recommendationRulesSaving}
                      onChange={(event) =>
                        updateRecommendationRule(
                          recommendation.id,
                          "suggestedItemId",
                          event.target.value
                        )
                      }
                    >
                      <option value="">Select item</option>
                      {recommendationItemOptions.map((item) => (
                        <option
                          key={`suggested-${recommendation.id}-${item.id}`}
                          value={item.id}
                        >
                          {item.label}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <button
                  className="button-danger button-danger--small"
                  type="button"
                  onClick={() => deleteRecommendationRule(recommendation.id)}
                  disabled={recommendationRulesSaving}
                >
                  Delete
                </button>
                <p className="menu-notice-control__summary recommendation-builder__preview">
                  {recommendation.triggerItemId
                    ? `When guest adds ${
                        recommendationItemLabelById[recommendation.triggerItemId] ?? "item"
                      }, suggest ${
                        recommendation.suggestedType === "category"
                          ? recommendation.suggestedCategory
                            ? categoryLabels[recommendation.suggestedCategory]
                            : "a category"
                          : recommendationItemLabelById[
                              recommendation.suggestedItemId
                            ] ?? "another item"
                      }.`
                    : "Pick a trigger item to unlock smart upsell ideas."}
                </p>
                {recommendationSmartSuggestions[recommendation.id]?.length ? (
                  <div className="recommendation-builder__assistant">
                    <p className="menu-notice-control__promo-message">
                      AI suggestions
                    </p>
                    <div className="orders-filter__chips recommendation-builder__chips">
                      {recommendationSmartSuggestions[recommendation.id].map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          className="orders-filter__chip"
                          disabled={recommendationRulesSaving}
                          onClick={() =>
                            applyRecommendationSmartSuggestion(
                              recommendation.id,
                              suggestion
                            )
                          }
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="button-neutral"
              onClick={addRecommendationRule}
              disabled={recommendationRulesSaving}
            >
              Add recommendation
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export const MenuAlertsPanel = memo(MenuAlertsPanelComponent);
