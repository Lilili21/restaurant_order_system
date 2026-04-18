"use client";

import { useEffect, useState } from "react";

type MenuSettingsResponse = {
  workingHoursRules?: Array<{
    id?: string;
    days?: number[];
    from?: string | null;
    until?: string | null;
  }>;
  workingHoursFrom?: string | null;
  workingHoursUntil?: string | null;
  orderMode?: "tables" | "counter";
  contactRequirement?: "none" | "name_or_phone" | "phone_only";
  requireOtp?: boolean;
  orderNumberPrefix?: string;
  showGuestOrderHistory?: boolean;
};

type SecondaryCredentials = {
  login: string;
  password: string;
};

type WorkingHoursControlProps = {
  credentials: SecondaryCredentials | null;
  restaurantSlug: string;
};

type WorkingHoursRuleDraft = {
  id: string;
  days: number[];
  from: string;
  until: string;
};

const DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" }
] as const;

function createRuleId() {
  return `hours-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function WorkingHoursControl({
  credentials,
  restaurantSlug
}: WorkingHoursControlProps) {
  const [workingHoursRules, setWorkingHoursRules] = useState<WorkingHoursRuleDraft[]>([]);
  const [workingHoursFrom, setWorkingHoursFrom] = useState("");
  const [workingHoursUntil, setWorkingHoursUntil] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftUntil, setDraftUntil] = useState("");
  const [draftRules, setDraftRules] = useState<WorkingHoursRuleDraft[]>([]);
  const [orderMode, setOrderMode] = useState<"tables" | "counter">("tables");
  const [contactRequirement, setContactRequirement] = useState<
    "none" | "name_or_phone" | "phone_only"
  >("none");
  const [requireOtp, setRequireOtp] = useState(false);
  const [orderNumberPrefix, setOrderNumberPrefix] = useState("ORD");
  const [showGuestOrderHistory, setShowGuestOrderHistory] = useState(false);
  const [draftOrderMode, setDraftOrderMode] = useState<"tables" | "counter">(
    "tables"
  );
  const [draftContactRequirement, setDraftContactRequirement] = useState<
    "none" | "name_or_phone" | "phone_only"
  >("none");
  const [draftRequireOtp, setDraftRequireOtp] = useState(false);
  const [draftOrderNumberPrefix, setDraftOrderNumberPrefix] = useState("ORD");
  const [draftShowGuestOrderHistory, setDraftShowGuestOrderHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const response = await fetch(
        `/api/menu-settings?restaurantSlug=${restaurantSlug}&fields=workingHoursRules,workingHoursFrom,workingHoursUntil,orderMode,contactRequirement,requireOtp,orderNumberPrefix,showGuestOrderHistory`,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        return;
      }

      const settings = (await response.json()) as MenuSettingsResponse;
      const nextFrom = settings.workingHoursFrom ?? "";
      const nextUntil = settings.workingHoursUntil ?? "";
      const nextOrderMode =
        settings.orderMode === "counter" ? "counter" : "tables";
      const nextContactRequirement =
        settings.contactRequirement === "name_or_phone" ||
        settings.contactRequirement === "phone_only"
          ? settings.contactRequirement
          : "none";
      const nextRequireOtp = Boolean(settings.requireOtp);
      const nextOrderNumberPrefix =
        typeof settings.orderNumberPrefix === "string" &&
        settings.orderNumberPrefix.trim()
          ? settings.orderNumberPrefix.trim().slice(0, 12).toUpperCase()
          : "ORD";
      const nextShowGuestOrderHistory = Boolean(settings.showGuestOrderHistory);
      const normalizedRules =
        Array.isArray(settings.workingHoursRules) &&
        settings.workingHoursRules.length > 0
          ? settings.workingHoursRules
              .map((rule) => {
                const days = Array.isArray(rule.days)
                  ? rule.days.filter(
                      (day): day is number =>
                        Number.isInteger(day) && day >= 0 && day <= 6
                    )
                  : [];

                if (days.length === 0) {
                  return null;
                }

                return {
                  id:
                    typeof rule.id === "string" && rule.id.trim()
                      ? rule.id
                      : createRuleId(),
                  days,
                  from:
                    typeof rule.from === "string" && rule.from.trim()
                      ? rule.from
                      : "",
                  until:
                    typeof rule.until === "string" && rule.until.trim()
                      ? rule.until
                      : ""
                };
              })
              .filter(Boolean) as WorkingHoursRuleDraft[]
          : nextFrom || nextUntil
            ? [
                {
                  id: createRuleId(),
                  days: [1, 2, 3, 4, 5, 6, 0],
                  from: nextFrom,
                  until: nextUntil
                }
              ]
            : [];

      if (!cancelled) {
        setWorkingHoursRules(normalizedRules);
        setWorkingHoursFrom(nextFrom);
        setWorkingHoursUntil(nextUntil);
        setDraftFrom(nextFrom);
        setDraftUntil(nextUntil);
        setDraftRules(normalizedRules);
        setOrderMode(nextOrderMode);
        setContactRequirement(nextContactRequirement);
        setRequireOtp(nextRequireOtp);
        setOrderNumberPrefix(nextOrderNumberPrefix);
        setShowGuestOrderHistory(nextShowGuestOrderHistory);
        setDraftOrderMode(nextOrderMode);
        setDraftContactRequirement(nextContactRequirement);
        setDraftRequireOtp(nextRequireOtp);
        setDraftOrderNumberPrefix(nextOrderNumberPrefix);
        setDraftShowGuestOrderHistory(nextShowGuestOrderHistory);
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [restaurantSlug]);

  async function saveWorkingHours() {
    setSaving(true);
    const normalizedRules = draftRules
      .map((rule) => ({
        ...rule,
        days: [...new Set(rule.days)].sort((left, right) => left - right),
        from: rule.from.trim(),
        until: rule.until.trim()
      }))
      .filter((rule) => rule.days.length > 0 && rule.from && rule.until);
    const fallbackRule = normalizedRules[0];

    const response = await fetch("/api/menu-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(credentials
          ? {
              "x-admin-secondary-login": credentials.login,
              "x-admin-secondary-password": credentials.password
            }
          : {})
      },
      body: JSON.stringify({
        restaurantSlug,
        workingHoursRules: normalizedRules,
        workingHoursFrom: (fallbackRule?.from ?? draftFrom) || null,
        workingHoursUntil: (fallbackRule?.until ?? draftUntil) || null,
        orderMode: draftOrderMode,
        contactRequirement: draftContactRequirement,
        requireOtp: draftRequireOtp,
        orderNumberPrefix: draftOrderNumberPrefix,
        showGuestOrderHistory: draftShowGuestOrderHistory
      })
    });

    if (!response.ok) {
      setSaving(false);
      return;
    }

    const settings = (await response.json()) as MenuSettingsResponse;
    const nextFrom = settings.workingHoursFrom ?? "";
    const nextUntil = settings.workingHoursUntil ?? "";
    const nextOrderMode = settings.orderMode === "counter" ? "counter" : "tables";
    const nextContactRequirement =
      settings.contactRequirement === "name_or_phone" ||
      settings.contactRequirement === "phone_only"
        ? settings.contactRequirement
        : "none";
    const nextRequireOtp = Boolean(settings.requireOtp);
    const nextOrderNumberPrefix =
      typeof settings.orderNumberPrefix === "string" &&
      settings.orderNumberPrefix.trim()
        ? settings.orderNumberPrefix.trim().slice(0, 12).toUpperCase()
        : "ORD";
    const nextShowGuestOrderHistory = Boolean(settings.showGuestOrderHistory);
    const nextRules = Array.isArray(settings.workingHoursRules)
      ? settings.workingHoursRules
          .map((rule) => {
            const days = Array.isArray(rule.days)
              ? rule.days.filter(
                  (day): day is number =>
                    Number.isInteger(day) && day >= 0 && day <= 6
                )
              : [];

            if (days.length === 0) {
              return null;
            }

            return {
              id:
                typeof rule.id === "string" && rule.id.trim()
                  ? rule.id
                  : createRuleId(),
              days,
              from:
                typeof rule.from === "string" && rule.from.trim()
                  ? rule.from
                  : "",
              until:
                typeof rule.until === "string" && rule.until.trim()
                  ? rule.until
                  : ""
            };
          })
          .filter(Boolean) as WorkingHoursRuleDraft[]
      : [];

    setWorkingHoursRules(nextRules);
    setWorkingHoursFrom(nextFrom);
    setWorkingHoursUntil(nextUntil);
    setDraftFrom(nextFrom);
    setDraftUntil(nextUntil);
    setDraftRules(nextRules);
    setOrderMode(nextOrderMode);
    setContactRequirement(nextContactRequirement);
    setRequireOtp(nextRequireOtp);
    setOrderNumberPrefix(nextOrderNumberPrefix);
    setShowGuestOrderHistory(nextShowGuestOrderHistory);
    setDraftOrderMode(nextOrderMode);
    setDraftContactRequirement(nextContactRequirement);
    setDraftRequireOtp(nextRequireOtp);
    setDraftOrderNumberPrefix(nextOrderNumberPrefix);
    setDraftShowGuestOrderHistory(nextShowGuestOrderHistory);
    setSaving(false);
    setDialogOpen(false);
  }

  return (
    <>
      {dialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card--form modal-card--hours"
            role="dialog"
            aria-modal="true"
            aria-labelledby="working-hours-title"
          >
            <h2 id="working-hours-title">Hours</h2>
            <div className="menu-editor__field">
              {draftRules.map((rule, index) => (
                <div key={rule.id} className="hours-rule-card">
                  <div className="hours-rule-days">
                    {DAY_OPTIONS.map((day) => (
                      <button
                        key={`${rule.id}-${day.value}`}
                        className={
                          rule.days.includes(day.value)
                            ? "orders-filter__chip orders-filter__chip--active"
                            : "orders-filter__chip"
                        }
                        type="button"
                        onClick={() =>
                          setDraftRules((current) =>
                            current.map((currentRule) =>
                              currentRule.id !== rule.id
                                ? currentRule
                                : {
                                    ...currentRule,
                                    days: currentRule.days.includes(day.value)
                                      ? currentRule.days.filter(
                                          (value) => value !== day.value
                                        )
                                      : [...currentRule.days, day.value]
                                  }
                            )
                          )
                        }
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  <div className="hours-rule-time-row">
                    <label className="menu-editor__field menu-settings-panel__field--compact">
                      <span>From</span>
                      <div className="menu-time-input">
                        <input
                          className="modal-input"
                          type="time"
                          value={rule.from}
                          placeholder="HH:MM"
                          onChange={(event) =>
                            setDraftRules((current) =>
                              current.map((currentRule) =>
                                currentRule.id === rule.id
                                  ? { ...currentRule, from: event.target.value }
                                  : currentRule
                              )
                            )
                          }
                        />
                      </div>
                    </label>
                    <label className="menu-editor__field menu-settings-panel__field--compact">
                      <span>Until</span>
                      <div className="menu-time-input">
                        <input
                          className="modal-input"
                          type="time"
                          value={rule.until}
                          placeholder="HH:MM"
                          onChange={(event) =>
                            setDraftRules((current) =>
                              current.map((currentRule) =>
                                currentRule.id === rule.id
                                  ? { ...currentRule, until: event.target.value }
                                  : currentRule
                              )
                            )
                          }
                        />
                      </div>
                    </label>
                    <button
                      className="hours-rule-remove"
                      type="button"
                      onClick={() =>
                        setDraftRules((current) =>
                          current.filter((currentRule) => currentRule.id !== rule.id)
                        )
                      }
                      aria-label="Remove schedule row"
                      disabled={saving || draftRules.length <= 1}
                    >
                      ✕
                    </button>
                  </div>
                  {index < draftRules.length - 1 ? <hr className="divider-line" /> : null}
                </div>
              ))}
              <div className="hours-quick-actions">
                <button
                  className="hours-quick-button"
                  type="button"
                  onClick={() =>
                    setDraftRules((current) => [
                      ...current,
                      { id: createRuleId(), days: [1, 2, 3, 4, 5], from: "", until: "" }
                    ])
                  }
                  disabled={saving}
                >
                  + Mon-Fri
                </button>
                <button
                  className="hours-quick-button"
                  type="button"
                  onClick={() =>
                    setDraftRules((current) => [
                      ...current,
                      { id: createRuleId(), days: [6, 0], from: "", until: "" }
                    ])
                  }
                  disabled={saving}
                >
                  + Sat-Sun
                </button>
                <button
                  className="hours-quick-button"
                  type="button"
                  onClick={() =>
                    setDraftRules((current) => [
                      ...current,
                      { id: createRuleId(), days: [1, 2, 3, 4, 5, 6, 0], from: "", until: "" }
                    ])
                  }
                  disabled={saving}
                >
                  + Custom range
                </button>
              </div>
            </div>
            <div className="menu-editor__field">
              <h3>Order flow</h3>
              <label className="menu-editor__field menu-settings-panel__field--compact">
                <span>Contact requirement</span>
                <select
                  className="modal-input"
                  value={draftContactRequirement}
                  onChange={(event) => {
                    const nextValue =
                      event.target.value === "phone_only" ||
                      event.target.value === "name_or_phone"
                        ? event.target.value
                        : "none";
                    setDraftContactRequirement(nextValue);
                  }}
                >
                  <option value="none">None</option>
                  <option value="name_or_phone">Name or phone</option>
                  <option value="phone_only">Phone only</option>
                </select>
              </label>
              <label className="menu-editor__field menu-settings-panel__field--compact">
                <span>Order number prefix</span>
                <input
                  className="modal-input"
                  type="text"
                  value={draftOrderNumberPrefix}
                  maxLength={12}
                  onChange={(event) =>
                    setDraftOrderNumberPrefix(event.target.value.toUpperCase())
                  }
                />
              </label>
              <label className="modal-card__status-toggle">
                <input
                  type="checkbox"
                  checked={draftRequireOtp}
                  onChange={(event) => setDraftRequireOtp(event.target.checked)}
                />
                <span>Require OTP for counter orders</span>
              </label>
              <label className="modal-card__status-toggle">
                <input
                  type="checkbox"
                  checked={draftShowGuestOrderHistory}
                  onChange={(event) =>
                    setDraftShowGuestOrderHistory(event.target.checked)
                  }
                />
                <span>Enable guest order history</span>
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="button-danger"
                type="button"
                aria-label="Close"
                onClick={() => {
                  setDraftRules(workingHoursRules);
                  setDraftFrom(workingHoursFrom);
                  setDraftUntil(workingHoursUntil);
                  setDraftOrderMode(orderMode);
                  setDraftContactRequirement(contactRequirement);
                  setDraftRequireOtp(requireOtp);
                  setDraftOrderNumberPrefix(orderNumberPrefix);
                  setDraftShowGuestOrderHistory(showGuestOrderHistory);
                  setDialogOpen(false);
                }}
              >
                ✕
              </button>
              <button
                className="button-success"
                type="button"
                aria-label="Save"
                disabled={saving}
                onClick={() => void saveWorkingHours()}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        className="admin-menu-bubble"
        type="button"
        onClick={() => {
          setDraftRules(workingHoursRules);
          setDraftFrom(workingHoursFrom);
          setDraftUntil(workingHoursUntil);
          setDraftOrderMode(orderMode);
          setDraftContactRequirement(contactRequirement);
          setDraftRequireOtp(requireOtp);
          setDraftOrderNumberPrefix(orderNumberPrefix);
          setDraftShowGuestOrderHistory(showGuestOrderHistory);
          setDialogOpen(true);
        }}
      >
        Hours
      </button>
    </>
  );
}
