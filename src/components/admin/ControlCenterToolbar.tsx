"use client";

import { memo } from "react";

import { TableCountControl } from "@/components/admin/TableCountControl";
import { WorkingHoursControl } from "@/components/admin/WorkingHoursControl";

type SecondaryCredentials = {
  login: string;
  password: string;
};

type Props = {
  dashboardOpen: boolean;
  onToggleDashboard: () => void;
  waiterRedirecting: boolean;
  onOpenLiveOrders: () => void;
  menuButtonsOpen: boolean;
  onToggleMenu: () => void;
  settingsButtonsOpen: boolean;
  onToggleSettings: () => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
  menuOpen: boolean;
  onToggleEdit: () => void;
  secondaryCredentials: SecondaryCredentials | null;
  restaurantSlug: string;
  notificationsOpen: boolean;
  onToggleNotifications: () => void;
  recommendationsOpen: boolean;
  onToggleRecommendations: () => void;
  settingsRecommendationsOpen: boolean;
  onToggleSettingsRecommendations: () => void;
  selectedKind: "dishes" | "drinks";
  onSelectDishes: () => void;
  onSelectDrinks: () => void;
};

function ControlCenterToolbarComponent({
  dashboardOpen,
  onToggleDashboard,
  waiterRedirecting,
  onOpenLiveOrders,
  menuButtonsOpen,
  onToggleMenu,
  settingsButtonsOpen,
  onToggleSettings,
  previewOpen,
  onTogglePreview,
  menuOpen,
  onToggleEdit,
  secondaryCredentials,
  restaurantSlug,
  notificationsOpen,
  onToggleNotifications,
  recommendationsOpen,
  onToggleRecommendations,
  settingsRecommendationsOpen,
  onToggleSettingsRecommendations,
  selectedKind,
  onSelectDishes,
  onSelectDrinks
}: Props) {
  return (
    <div className="menu-editor__toolbar">
      <div className="menu-editor__toolbar-row">
        <button
          className={
            dashboardOpen
              ? "admin-menu-bubble admin-menu-bubble--active admin-menu-bubble--dashboard"
              : "admin-menu-bubble admin-menu-bubble--dashboard"
          }
          type="button"
          onClick={onToggleDashboard}
        >
          Dashboard
        </button>
        <button
          className="admin-menu-bubble admin-menu-bubble--live-orders"
          type="button"
          disabled={waiterRedirecting}
          onClick={onOpenLiveOrders}
        >
          Live Orders
        </button>
        <div
          className={
            menuButtonsOpen
              ? "menu-editor__toolbar-group menu-editor__toolbar-group--open"
              : "menu-editor__toolbar-group"
          }
        >
          <button
            className={
              menuButtonsOpen
                ? "admin-menu-bubble admin-menu-bubble--active admin-menu-bubble--group admin-menu-bubble--group-open"
                : "admin-menu-bubble admin-menu-bubble--group"
            }
            type="button"
            onClick={onToggleMenu}
            aria-expanded={menuButtonsOpen}
          >
            <span>Menu</span>
            <span
              className={
                menuButtonsOpen
                  ? "admin-menu-bubble__chevron admin-menu-bubble__chevron--open"
                  : "admin-menu-bubble__chevron"
              }
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
          {menuButtonsOpen ? (
            <div className="menu-editor__toolbar-subrow">
              <button
                className={
                  recommendationsOpen
                    ? "admin-menu-bubble admin-menu-bubble--active"
                    : "admin-menu-bubble"
                }
                type="button"
                onClick={onToggleRecommendations}
              >
                Advices
              </button>
              <button
                className={
                  previewOpen
                    ? "admin-menu-bubble admin-menu-bubble--active"
                    : "admin-menu-bubble"
                }
                type="button"
                onClick={onTogglePreview}
              >
                Preview (customer view)
              </button>
              <button
                className={
                  menuOpen
                    ? "admin-menu-bubble admin-menu-bubble--active"
                    : "admin-menu-bubble"
                }
                type="button"
                onClick={onToggleEdit}
              >
                Edit
              </button>
            </div>
          ) : null}
        </div>
        <div
          className={
            settingsButtonsOpen
              ? "menu-editor__toolbar-group menu-editor__toolbar-group--open"
              : "menu-editor__toolbar-group"
          }
        >
          <button
            className={
              settingsButtonsOpen
                ? "admin-menu-bubble admin-menu-bubble--active admin-menu-bubble--group admin-menu-bubble--group-open"
                : "admin-menu-bubble admin-menu-bubble--group"
            }
            type="button"
            onClick={onToggleSettings}
            aria-expanded={settingsButtonsOpen}
          >
            <span>Settings</span>
            <span
              className={
                settingsButtonsOpen
                  ? "admin-menu-bubble__chevron admin-menu-bubble__chevron--open"
                  : "admin-menu-bubble__chevron"
              }
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
          {settingsButtonsOpen ? (
            <div className="menu-editor__toolbar-subrow">
              {secondaryCredentials ? (
                <TableCountControl
                  credentials={secondaryCredentials}
                  restaurantSlug={restaurantSlug}
                />
              ) : null}
              {secondaryCredentials ? (
                <WorkingHoursControl credentials={secondaryCredentials} />
              ) : null}
              <button
                className={
                  notificationsOpen
                    ? "admin-menu-bubble admin-menu-bubble--active"
                    : "admin-menu-bubble"
                }
                type="button"
                onClick={onToggleNotifications}
              >
                Notifications
              </button>
              <button
                className={
                  settingsRecommendationsOpen
                    ? "admin-menu-bubble admin-menu-bubble--active"
                    : "admin-menu-bubble"
                }
                type="button"
                onClick={onToggleSettingsRecommendations}
              >
                Recommendations
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {menuOpen ? (
        <div className="menu-editor__toolbar-row">
          <div className="admin-switch menu-editor__kind-switch">
            <button
              type="button"
              className={
                selectedKind === "dishes"
                  ? "admin-switch__item menu-editor__kind-button menu-editor__kind-button--dishes admin-switch__item--active"
                  : "admin-switch__item menu-editor__kind-button menu-editor__kind-button--dishes"
              }
              onClick={onSelectDishes}
            >
              Dishes
            </button>
            <button
              type="button"
              className={
                selectedKind === "drinks"
                  ? "admin-switch__item menu-editor__kind-button menu-editor__kind-button--drinks admin-switch__item--active"
                  : "admin-switch__item menu-editor__kind-button menu-editor__kind-button--drinks"
              }
              onClick={onSelectDrinks}
            >
              Drinks
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const ControlCenterToolbar = memo(ControlCenterToolbarComponent);
