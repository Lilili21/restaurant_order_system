"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import { MenuList } from "@/components/menu/MenuList";
import type { MenuFilter } from "@/components/menu/MenuList";
import { formatCurrency } from "@/lib/menu";
import type {
  BusinessLunchSettings,
  PromotionSettings,
  RecommendationRuleSettings
} from "@/lib/menu-settings";
import {
  CartItem,
  MenuCategory,
  MenuItem,
  MenuLanguage,
  Order,
  ServeMode
} from "@/lib/types";

type CartProps = {
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  tableToken: string;
  orderingEnabled?: boolean;
  menu: MenuItem[];
  showKitchenLoadWarning: boolean;
  promotions?: PromotionSettings[];
  businessLunches?: BusinessLunchSettings[];
  recommendations?: RecommendationRuleSettings[];
  showKitchenOpen: boolean;
  kitchenOpenUntil: string | null;
  showBarOpen: boolean;
  barOpenUntil: string | null;
  initialSubmittedOrders: Order[];
};

type FlyingOrderItem = {
  id: number;
  icon: string;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
};

const categoryFlightIcons: Record<MenuCategory, string> = {
  starters: "🥗",
  mains: "🍝",
  drinks: "🥤",
  fluids: "🍹",
  draft: "🍺",
  bottled: "🍾",
  fuel: "⛽",
  whiskey: "🥃",
  vodka: "🍸",
  rum: "🥃",
  cognac: "🥃",
  gin: "🍸",
  tequila: "🍸",
  absent: "🍸",
  ouzo: "🍸",
  likers: "🍷",
  two_component_mixture: "🧪",
  dot4: "🛢",
  non_alcoholic_drinks: "🥤",
  desserts: "🍰"
};

const drinkCategories = new Set<MenuCategory>([
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

const SERVICE_REQUEST_COOLDOWN_MS = 5 * 60 * 1000;
const ORDER_SUBMIT_THROTTLE_MS = 3 * 1000;
const MAX_CART_RECOMMENDATIONS_PER_TRIGGER_ITEM = 3;

const uiText = {
  he: {
    restaurantHeader: "Olive Bistro",
    table: "שולחן",
    tableOrderingHint: "📍 אתם מזמינים משולחן מספר",
    callWaiter: "קרא למלצר",
    requestBill: "הביאו חשבון",
    serviceHelp: "עזרה / שאלה",
    welcomeTitle: "ברוכים הבאים",
    welcomeText: "בחרו מנות מהתפריט ושלחו את ההזמנה ישירות מהשולחן שלכם.",
    welcomeOk: "אישור",
    reviewOrderTitle: "בדקו את ההזמנה שלכם",
    reviewOrderText: "נא לעבור על ההזמנה לפני השליחה.",
    reviewOrderOk: "אישור",
    reviewOrderChange: "עריכה",
    dessertPromptTitle: "רגע לפני השליחה",
    dessertPromptText: "שמתי לב שאין בהזמנה קינוח. תרצו להוסיף משהו מתוק לפני שנמשיך?",
    drinksPromptTitle: "רגע לפני השליחה",
    drinksPromptText: "שמתי לב שאין בהזמנה שתייה. תרצו להוסיף משהו לשתות לפני שנמשיך?",
    dessertDrinksPromptTitle: "רגע לפני השליחה",
    dessertDrinksPromptText:
      "שמתי לב שאין בהזמנה גם שתייה וגם קינוח. תרצו להוסיף משהו לשתות או משהו מתוק לפני שנמשיך?",
    dessertPromptLater: "אחר כך",
    dessertPromptNow: "עכשיו",
    serveModeTitle: "איך להגיש את ההזמנה?",
    serveModeText: "בחרו את אופן ההגשה המתאים לכם.",
    serveAll: "להגיש הכול יחד",
    serveAsReady: "להגיש לפי המוכן",
    newOrder: "ההזמנה שלי",
    emptyCart: "ההזמנה שלכם עדיין ריקה. הוסיפו משהו טעים מהתפריט.",
    recommendationTitle: "אולי תוסיפו גם",
    recommendationPrefix: "בחרתם",
    recommendationJoiner: ". תוסיפו גם",
    recommendationAdd: "הוספה",
    recommendationView: "צפו",
    total: "סה\"כ",
    happyHourDiscount: "הנחת Happy hour",
    submit: "שלח הזמנה",
    submitting: "שולח...",
    currentOrders: "הזמנות נוכחיות",
    thankYou: "תודה",
    orderSent: "ההזמנה שלכם נשלחה. אנחנו מכינים באהבה.",
    waiterCalled: "המלצר הוזמן",
    billRequested: "המלצר יביא את החשבון לשולחן שלכם בקרוב.\nתודה שסעדתם אצלנו!",
    waiterServiceNote: "המלצר יהיה אצלכם בקרוב.",
    waiterAlreadyCalled: "המלצר כבר בדרך לשולחן שלכם.",
    kitchenOpen: "המטבח נסגר בעוד",
    kitchenClosed: "המטבח סגור",
    kitchenClosedNote: "כרגע ניתן להזמין רק משקאות.",
    barOpen: "הבר נסגר בעוד",
    barClosed: "הבר סגור",
    barClosedNote: "כרגע ניתן להזמין רק מנות מטבח.",
    kitchenClosedAction: "לצערנו המטבח סגור",
    kitchenClosedOrderCheck:
      "המטבח סגור. בדקו את ההזמנה והשאירו רק משקאות, ואז אשרו שוב.",
    barClosedOrderCheck:
      "הבר סגור. בדקו את ההזמנה והשאירו רק מנות מטבח, ואז אשרו שוב.",
    waiterAvailable: "המלצר עדיין זמין עבורכם אם תצטרכו עזרה.",
    kitchenLoadWarning:
      "עקב עומס בהזמנות, זמן ההכנה עשוי להיות ארוך מהרגיל. תודה על הסבלנות.",
    happyHour: "Happy hour",
    businessLunchNow: "Business lunch available now",
    happyHourStartsFrom: "מתחיל ב־",
    happyHourUntil: "עד",
    addDish: "הוסיפו לפחות מנה אחת.",
    submitCooldown: "ההזמנה הזו כבר נשלחה.",
    submitRetrySafe:
      "לא הצלחנו לאשר שההזמנה התקבלה. הסל נשמר, ואפשר לנסות שוב בבטחה בלי ליצור כפילות.",
    submitLoadingNote: "שולחים… נא לא לסגור את הדף.",
    submitError: "לא ניתן היה לשלוח את ההזמנה",
    waiterError: "לא ניתן היה לקרוא למלצר",
    billError: "לא ניתן היה לבקש חשבון",
    close: "סגור חלון",
    jumpToOrder: "ההזמנה שלי",
    quickInfo: [
      "📍 סניפים נוספים",
      "⭐ השאירו ביקורת",
      "📲 עקבו אחרינו"
    ]
  },
  en: {
    restaurantHeader: "Olive Bistro",
    table: "Table",
    tableOrderingHint: "📍 You are ordering from table",
    callWaiter: "Call waiter",
    requestBill: "Bring bill",
    serviceHelp: "Help / question",
    welcomeTitle: "Welcome",
    welcomeText:
      "Choose your dishes and send the order straight to the kitchen from your table.",
    welcomeOk: "OK",
    reviewOrderTitle: "Check your order",
    reviewOrderText: "Please review your order before sending it.",
    reviewOrderOk: "OK",
    reviewOrderChange: "Change",
    dessertPromptTitle: "One more thing",
    dessertPromptText: "Add dessert?",
    drinksPromptTitle: "One more thing",
    drinksPromptText: "Add drinks?",
    dessertDrinksPromptTitle: "One more thing",
    dessertDrinksPromptText: "Add a drink or dessert?",
    dessertPromptLater: "Later",
    dessertPromptNow: "Yes",
    serveModeTitle: "How should we serve your order?",
    serveModeText: "Choose the serving option that works best for you.",
    serveAll: "Serve everything together",
    serveAsReady: "Serve as ready",
    newOrder: "My order",
    emptyCart: "Your order is empty. Add something tasty from the menu.",
    recommendationTitle: "You may also like",
    recommendationPrefix: "You chose",
    recommendationJoiner: ". Add",
    recommendationAdd: "Add",
    recommendationView: "View",
    total: "Total",
    happyHourDiscount: "Happy hour discount",
    submit: "Place order",
    submitting: "Sending...",
    currentOrders: "Current orders",
    thankYou: "Thanks",
    orderSent: "Your order has been sent. We are cooking with love.",
    waiterCalled: "Waiter has been called",
    billRequested: "A waiter will bring your bill shortly.\nThank you for dining with us!",
    waiterServiceNote: "Waiter is on the way.",
    waiterAlreadyCalled: "A waiter will be at your table shortly.",
    kitchenOpen: "Kitchen closed in",
    kitchenClosed: "Kitchen closed",
    kitchenClosedNote: "Only drinks are available to order right now.",
    barOpen: "Bar closed in",
    barClosed: "Bar closed",
    barClosedNote: "Only kitchen dishes are available to order right now.",
    kitchenClosedAction: "Unfortunately, the kitchen is closed",
    kitchenClosedOrderCheck:
      "The kitchen is closed. Check your order and keep drinks only, then confirm again.",
    barClosedOrderCheck:
      "The bar is closed. Check your order and keep dishes only, then confirm again.",
    waiterAvailable: "A waiter is still available if you need any assistance.",
    kitchenLoadWarning:
      "Due to a high volume of orders, preparation time may be longer than usual. Thank you for your patience.",
    happyHour: "Happy hour",
    businessLunchNow: "Business lunch available now",
    happyHourStartsFrom: "starts from",
    happyHourUntil: "until",
    addDish: "Add at least one dish.",
    submitCooldown: "This order was already sent.",
    submitRetrySafe:
      "We could not confirm that the order was received. Your cart is still here, and you can safely try again without creating a duplicate.",
    submitLoadingNote: "Sending… Please do not close the page.",
    submitError: "Failed to send the order",
    waiterError: "Failed to call the waiter",
    billError: "Failed to request the bill",
    close: "Close dialog",
    jumpToOrder: "My order",
    quickInfo: [
      "📍 Other locations",
      "⭐ Leave a review",
      "📲 Follow us"
    ]
  }
} as const;

export function Cart({
  restaurantSlug,
  restaurantName,
  tableNumber,
  tableToken,
  orderingEnabled = true,
  menu,
  showKitchenLoadWarning,
  promotions = [],
  businessLunches = [],
  recommendations = [],
  showKitchenOpen,
  kitchenOpenUntil,
  showBarOpen,
  barOpenUntil,
  initialSubmittedOrders
}: CartProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(true);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [upsellPrompt, setUpsellPrompt] = useState<
    null | "dessert" | "drinks" | "dessert_drinks"
  >(null);
  const [selectedMenuFilter, setSelectedMenuFilter] = useState<MenuFilter | null>(
    null
  );
  const [language, setLanguage] = useState<MenuLanguage>("he");
  const [submittedOrdersOpen, setSubmittedOrdersOpen] = useState(false);
  const [submittedOrders, setSubmittedOrders] = useState<Order[]>(
    initialSubmittedOrders
  );
  const [currentSessionId, setCurrentSessionId] = useState(
    initialSubmittedOrders[0]?.sessionId ?? 1
  );
  const [hasActiveServiceRequest, setHasActiveServiceRequest] = useState(false);
  const [serviceRequestBlockedUntil, setServiceRequestBlockedUntil] = useState(0);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const [isOrderPanelVisible, setIsOrderPanelVisible] = useState(false);
  const [flyingOrderItems, setFlyingOrderItems] = useState<FlyingOrderItem[]>([]);
  const orderJumpButtonRef = useRef<HTMLButtonElement | null>(null);
  const orderPanelRef = useRef<HTMLElement | null>(null);
  const currentSessionIdRef = useRef(currentSessionId);
  const pendingOrderRequestIdRef = useRef<string | null>(null);
  const lastSuccessfulOrderSignatureRef = useRef<{
    signature: string;
    submittedAt: number;
  } | null>(null);

  const detailedItems = useMemo(() => {
    return items
      .map((cartItem) => {
        const menuItem = menu.find((item) => item.id === cartItem.menuItemId);
        return menuItem ? { cartItem, menuItem } : null;
      })
      .filter(Boolean) as { cartItem: CartItem; menuItem: MenuItem }[];
  }, [items, menu]);

  const total = detailedItems.reduce(
    (sum, item) =>
      sum +
      (item.cartItem.priceOverride ?? item.menuItem.price) *
        item.cartItem.quantity,
    0
  );
  const pendingOrderItemsCount = items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  const hasDessertInOrder = detailedItems.some(
    ({ menuItem }) => menuItem.category === "desserts"
  );
  const hasDrinksInOrder = detailedItems.some(({ menuItem }) =>
    drinkCategories.has(menuItem.category)
  );
  const hasDishesInOrder = detailedItems.some(
    ({ menuItem }) => !drinkCategories.has(menuItem.category)
  );

  const quantities = items.reduce<Record<string, number>>((acc, item) => {
    acc[`${item.menuItemId}:${item.volumeOptionId ?? "base"}`] = item.quantity;
    return acc;
  }, {});

  const submittedOrdersTotal = submittedOrders.reduce(
    (sum, order) => sum + order.total,
    0
  );
  const OPEN_COUNTDOWN_VISIBILITY_MS = 30 * 60 * 1000;
  const serviceRequestDisabled =
    hasActiveServiceRequest || serviceRequestBlockedUntil > Date.now();
  const text = uiText[language];
  const kitchenOpenRemainingMs = kitchenOpenUntil
    ? new Date(kitchenOpenUntil).getTime() - countdownNow
    : 0;
  const hasKitchenOpenTimer = showKitchenOpen && Boolean(kitchenOpenUntil);
  const showKitchenOpenBanner =
    hasKitchenOpenTimer &&
    kitchenOpenRemainingMs > 0 &&
    kitchenOpenRemainingMs <= OPEN_COUNTDOWN_VISIBILITY_MS;
  const showKitchenClosedBanner = hasKitchenOpenTimer && kitchenOpenRemainingMs <= 0;
  const barOpenRemainingMs = barOpenUntil
    ? new Date(barOpenUntil).getTime() - countdownNow
    : 0;
  const hasBarOpenTimer = showBarOpen && Boolean(barOpenUntil);
  const showBarOpenBanner =
    hasBarOpenTimer &&
    barOpenRemainingMs > 0 &&
    barOpenRemainingMs <= OPEN_COUNTDOWN_VISIBILITY_MS;
  const showBarClosedBanner = hasBarOpenTimer && barOpenRemainingMs <= 0;
  const isKitchenClosed = showKitchenClosedBanner;
  const isBarClosed = showBarClosedBanner;
  const areKitchenAndBarClosed = isKitchenClosed && isBarClosed;
  const submitDisabled =
    detailedItems.length === 0 ||
    submitting ||
    areKitchenAndBarClosed ||
    (isKitchenClosed && hasDishesInOrder) ||
    (isBarClosed && hasDrinksInOrder);
  const shouldAnimateSubmitButton = detailedItems.length > 0 && !submitDisabled;
  const promoCategoryLabels = useMemo<Record<MenuCategory, string>>(
    () => ({
      starters: language === "he" ? "מנות פתיחה" : "starters",
      mains: language === "he" ? "עיקריות" : "main courses",
      drinks: language === "he" ? "drinks" : "drinks",
      fluids: language === "he" ? "fluids" : "fluids",
      draft: language === "he" ? "draft" : "draft",
      bottled: language === "he" ? "bottled" : "bottled",
      fuel: language === "he" ? "fuel" : "fuel",
      whiskey: language === "he" ? "whiskey" : "whiskey",
      vodka: language === "he" ? "vodka" : "vodka",
      rum: language === "he" ? "rum" : "rum",
      cognac: language === "he" ? "cognac" : "cognac",
      gin: language === "he" ? "gin" : "gin",
      tequila: language === "he" ? "tequila" : "tequila",
      absent: language === "he" ? "absent" : "absent",
      ouzo: language === "he" ? "ouzo" : "ouzo",
      likers: language === "he" ? "likers" : "likers",
      two_component_mixture:
        language === "he" ? "2 component mixture" : "2 component mixture",
      dot4: language === "he" ? "DOT 4" : "DOT 4",
      non_alcoholic_drinks:
        language === "he" ? "משקאות קלים" : "non-alcoholic drinks",
      desserts: language === "he" ? "קינוחים" : "desserts"
    }),
    [language]
  );
  const hasTimedMenuWindows = useMemo(
    () =>
      promotions.some(
        (promotion) =>
          promotion.enabled &&
          Boolean(promotion.startsFrom || promotion.until)
      ) ||
      businessLunches.some(
        (businessLunch) =>
          businessLunch.enabled &&
          Boolean(businessLunch.startsFrom || businessLunch.until)
      ),
    [businessLunches, promotions]
  );

  function isScheduledWindowActive(
    settings:
      | Pick<PromotionSettings, "enabled" | "days" | "startsFrom" | "until">
      | Pick<BusinessLunchSettings, "enabled" | "days" | "startsFrom" | "until">
  ) {
    if (!settings.enabled) {
      return false;
    }

    const now = countdownNow;
    const currentDay = new Date(now).getDay();

    if (settings.days.length > 0 && !settings.days.includes(currentDay)) {
      return false;
    }

    if (!settings.startsFrom || !settings.until) {
      return true;
    }

    const startDate = new Date(settings.startsFrom);
    const untilDate = new Date(settings.until);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(untilDate.getTime())
    ) {
      return false;
    }

    return now >= startDate.getTime() && now <= untilDate.getTime();
  }

  const activePromotions = useMemo(() => {
    return promotions.filter(
      (promotion) =>
        promotion.discountPercent > 0 && isScheduledWindowActive(promotion)
    );
  }, [countdownNow, promotions]);
  const activeBusinessLunches = useMemo(
    () => businessLunches.filter((businessLunch) => isScheduledWindowActive(businessLunch)),
    [businessLunches, countdownNow]
  );
  const visibleMenu = useMemo(() => {
    const restrictedCategories = new Set<MenuCategory>(
      businessLunches.flatMap((businessLunch) =>
        businessLunch.enabled ? businessLunch.categories : []
      )
    );
    const activeBusinessLunchCategories = new Set<MenuCategory>(
      activeBusinessLunches.flatMap((businessLunch) => businessLunch.categories)
    );

    if (restrictedCategories.size === 0) {
      return menu;
    }

    return menu.filter(
      (item) =>
        !restrictedCategories.has(item.category) ||
        activeBusinessLunchCategories.has(item.category)
    );
  }, [activeBusinessLunches, businessLunches, menu]);

  const effectiveSelectedFilter =
    selectedMenuFilter &&
    !visibleMenu.some((item) =>
      selectedMenuFilter === "drinks"
        ? drinkCategories.has(item.category)
        : item.category === selectedMenuFilter
    )
      ? null
      : selectedMenuFilter;
  const categoryDiscounts = useMemo(() => {
    return activePromotions.reduce<Partial<Record<MenuCategory, number>>>(
      (acc, promotion) => {
        for (const category of promotion.categories) {
          const currentDiscount = acc[category] ?? 0;

          if (promotion.discountPercent > currentDiscount) {
            acc[category] = promotion.discountPercent;
          }
        }

        return acc;
      },
      {}
    );
  }, [activePromotions]);
  const promotionBannerTexts = useMemo(
    () =>
      activePromotions.map((promotion) => {
        const promoCategorySummary = promotion.categories
          .map((category) => promoCategoryLabels[category] ?? category)
          .join(", ");
        const baseText = (promotion.text.trim() || text.happyHour).replace(
          /\s*-\s*\d+%/gi,
          ""
        );

        return [
          `🎉 ${baseText}`,
          promotion.discountPercent > 0 ? `-${promotion.discountPercent}%` : null,
          promoCategorySummary
            ? `${language === "he" ? "על" : "on"} ${promoCategorySummary}`
            : null
        ]
          .filter(Boolean)
          .join(" · ");
      }),
    [activePromotions, language, promoCategoryLabels, text.happyHour]
  );
  const businessLunchBannerTexts = useMemo(
    () =>
      activeBusinessLunches.map((businessLunch) => {
        const categorySummary = businessLunch.categories
          .map((category) => promoCategoryLabels[category] ?? category)
          .join(", ");
        const baseText = businessLunch.text.trim() || text.businessLunchNow;

        return categorySummary
          ? `🍽 ${baseText} · ${language === "he" ? "על" : "on"} ${categorySummary}`
          : `🍽 ${baseText}`;
      }),
    [activeBusinessLunches, language, promoCategoryLabels, text.businessLunchNow]
  );
  const currentOrderDiscountAmount = Number(
    detailedItems
      .reduce((sum, { cartItem, menuItem }) => {
        const categoryDiscount = categoryDiscounts[menuItem.category] ?? 0;

        if (categoryDiscount <= 0) {
          return sum;
        }

        const unitPrice = cartItem.priceOverride ?? menuItem.price;
        return sum + unitPrice * cartItem.quantity * (categoryDiscount / 100);
      }, 0)
      .toFixed(2)
  );
  const currentOrderTotalAfterDiscount = Number(
    Math.max(0, total - currentOrderDiscountAmount).toFixed(2)
  );

  const pendingOrderStorageKey = useMemo(
    () => `pending-order:${restaurantSlug}:${tableToken}`,
    [restaurantSlug, tableToken]
  );

  function getMenuItemDisplayName(
    menuItemId: string,
    volumeLabel?: string | null
  ) {
    const menuItem = menu.find((item) => item.id === menuItemId);

    if (!menuItem) {
      return "";
    }

    const baseName =
      language === "he"
      ? menuItem.nameHe || menuItem.name
      : menuItem.nameEn || menuItem.nameHe || menuItem.name;

    return volumeLabel ? `${baseName} · ${volumeLabel}` : baseName;
  }

  function getCartItemKey(cartItem: CartItem) {
    return `${cartItem.menuItemId}:${cartItem.volumeOptionId ?? cartItem.volumeLabel ?? "base"}`;
  }

  function getMenuCategoryDisplayName(category: MenuCategory) {
    return promoCategoryLabels[category] ?? category;
  }

  const activeCartRecommendations = useMemo(() => {
    const currentOrderItemIds = new Set(detailedItems.map(({ menuItem }) => menuItem.id));
    const uniqueTriggerItemIdsInOrder = [
      ...new Set(detailedItems.map(({ menuItem }) => menuItem.id))
    ];
    const nextRecommendations: Array<
      | {
          kind: "item";
          triggerItem: MenuItem;
          suggestedItem: MenuItem;
        }
      | {
          kind: "category";
          triggerItem: MenuItem;
          suggestedCategory: MenuCategory;
        }
    > = [];
    const seenSuggestions = new Set<string>();
    const hasEligibleRecommendationForTriggerItem = (triggerItemId: string) =>
      recommendations.some((recommendation) => {
        if (!recommendation.enabled || recommendation.triggerItemId !== triggerItemId) {
          return false;
        }

        if (
          recommendation.suggestedType === "item" &&
          currentOrderItemIds.has(recommendation.suggestedItemId)
        ) {
          return false;
        }

        if (recommendation.suggestedType === "category") {
          const suggestedCategory = recommendation.suggestedCategory;

          if (
            !suggestedCategory ||
            detailedItems.some(({ menuItem }) => menuItem.category === suggestedCategory) ||
            !visibleMenu.some((item) => item.category === suggestedCategory) ||
            (isKitchenClosed && !drinkCategories.has(suggestedCategory)) ||
            (isBarClosed && drinkCategories.has(suggestedCategory))
          ) {
            return false;
          }

          return true;
        }

        const suggestedItem = menu.find((item) => item.id === recommendation.suggestedItemId);

        if (!suggestedItem || !suggestedItem.available) {
          return false;
        }

        if (
          (isKitchenClosed && !drinkCategories.has(suggestedItem.category)) ||
          (isBarClosed && drinkCategories.has(suggestedItem.category))
        ) {
          return false;
        }

        return true;
      });
    const activeTriggerItemId =
      uniqueTriggerItemIdsInOrder.find((itemId) =>
        hasEligibleRecommendationForTriggerItem(itemId)
      ) ?? null;

    if (!activeTriggerItemId) {
      return nextRecommendations;
    }

    for (const recommendation of recommendations) {
      if (
        !recommendation.enabled ||
        recommendation.triggerItemId !== activeTriggerItemId
      ) {
        continue;
      }

      if (
        !currentOrderItemIds.has(recommendation.triggerItemId) ||
        (
          recommendation.suggestedType === "item" &&
          currentOrderItemIds.has(recommendation.suggestedItemId)
        )
      ) {
        continue;
      }

      const triggerItem = menu.find((item) => item.id === recommendation.triggerItemId);
      const suggestedItem =
        recommendation.suggestedType === "item"
          ? menu.find((item) => item.id === recommendation.suggestedItemId)
          : null;

      if (!triggerItem) {
        continue;
      }

      if (recommendation.suggestedType === "category") {
        const suggestedCategory = recommendation.suggestedCategory;

        if (!suggestedCategory) {
          continue;
        }

        if (
          currentOrderItemIds.size > 0 &&
          detailedItems.some(({ menuItem }) => menuItem.category === suggestedCategory)
        ) {
          continue;
        }

        if (
          !visibleMenu.some((item) => item.category === suggestedCategory) ||
          (isKitchenClosed && !drinkCategories.has(suggestedCategory)) ||
          (isBarClosed && drinkCategories.has(suggestedCategory))
        ) {
          continue;
        }

        const suggestionKey = `category:${suggestedCategory}`;

        if (seenSuggestions.has(suggestionKey)) {
          continue;
        }

        seenSuggestions.add(suggestionKey);
        nextRecommendations.push({
          kind: "category" as const,
          triggerItem,
          suggestedCategory
        });

        if (nextRecommendations.length >= MAX_CART_RECOMMENDATIONS_PER_TRIGGER_ITEM) {
          break;
        }

        continue;
      }

      if (!suggestedItem || !suggestedItem.available) {
        continue;
      }

      if (
        (isKitchenClosed && !drinkCategories.has(suggestedItem.category)) ||
        (isBarClosed && drinkCategories.has(suggestedItem.category))
      ) {
        continue;
      }

      const suggestionKey = `item:${suggestedItem.id}`;

      if (seenSuggestions.has(suggestionKey)) {
        continue;
      }

      seenSuggestions.add(suggestionKey);
      nextRecommendations.push({
        kind: "item" as const,
        triggerItem,
        suggestedItem
      });

      if (nextRecommendations.length >= MAX_CART_RECOMMENDATIONS_PER_TRIGGER_ITEM) {
        break;
      }
    }

    return nextRecommendations;
  }, [detailedItems, isBarClosed, isKitchenClosed, menu, recommendations, visibleMenu]);

  function createOrderPayloadSignature(serveMode: ServeMode) {
    const normalizedItems = [...items]
      .map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        note: item.note?.trim() ?? "",
        volumeOptionId: item.volumeOptionId ?? "",
        volumeLabel: item.volumeLabel ?? "",
        priceOverride:
          typeof item.priceOverride === "number" && Number.isFinite(item.priceOverride)
            ? item.priceOverride
            : null
      }))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      );

    return JSON.stringify({
      serveMode,
      items: normalizedItems
    });
  }

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(
      `menu-language:${restaurantSlug}:${tableToken}`
    );

    if (savedLanguage === "he" || savedLanguage === "en") {
      setLanguage(savedLanguage);
    }
  }, [restaurantSlug, tableToken]);

  useEffect(() => {
    const savedRequestId = window.localStorage.getItem(pendingOrderStorageKey);

    if (savedRequestId) {
      pendingOrderRequestIdRef.current = savedRequestId;
    }
  }, [pendingOrderStorageKey]);

  useEffect(() => {
    const panelElement = orderPanelRef.current;

    if (!panelElement) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsOrderPanelVisible(entry.isIntersecting);
      },
      {
        threshold: 0.2
      }
    );

    observer.observe(panelElement);

    return () => {
      observer.disconnect();
    };
  }, [orderingEnabled]);

  function setNextLanguage(nextLanguage: MenuLanguage) {
    setLanguage(nextLanguage);
    window.localStorage.setItem(
      `menu-language:${restaurantSlug}:${tableToken}`,
      nextLanguage
    );
    setShowWelcomeDialog(true);
  }

  useEffect(() => {
    if (serviceRequestDisabled) {
      setServiceMenuOpen(false);
    }
  }, [serviceRequestDisabled]);

  useEffect(() => {
    if (!orderingEnabled) {
      return;
    }

    let cancelled = false;
    let inFlightAbortController: AbortController | null = null;

    async function syncSubmittedOrders() {
      if (document.visibilityState === "hidden") {
        return;
      }

      inFlightAbortController?.abort();
      inFlightAbortController = new AbortController();

      let response: Response;

      try {
        response = await fetch(`/api/tables/${restaurantSlug}/${tableToken}`, {
          cache: "no-store",
          signal: inFlightAbortController.signal
        });
      } catch {
        return;
      }

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        currentSessionId?: number;
        submittedOrders?: Order[];
        activeServiceRequests?: Array<Order["kind"]>;
      };

      if (!cancelled) {
        const previousSessionId = currentSessionIdRef.current;
        const nextSessionId = data.currentSessionId ?? previousSessionId;
        const nextOrders = data.submittedOrders ?? [];
        const hasActiveServiceRequests = (data.activeServiceRequests ?? []).some(
          (kind) => kind === "waiter_call" || kind === "bill_request"
        );

        setCurrentSessionId(nextSessionId);
        setHasActiveServiceRequest(hasActiveServiceRequests);
        if (!hasActiveServiceRequests) {
          setServiceRequestBlockedUntil(0);
        }
        setSubmittedOrders((current) => {
          if (nextSessionId !== previousSessionId) {
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
      inFlightAbortController?.abort();
      window.clearInterval(intervalId);
    };
  }, [restaurantSlug, tableToken, orderingEnabled]);

  useEffect(() => {
    if (!orderingEnabled) {
      return;
    }

    const storageKey = `service-request:${restaurantSlug}:${tableToken}`;
    const savedValue = window.localStorage.getItem(storageKey);
    const savedTimestamp = savedValue ? Number(savedValue) : 0;

    if (savedTimestamp > Date.now()) {
      setServiceRequestBlockedUntil(savedTimestamp);
    }
  }, [restaurantSlug, tableToken]);

  useEffect(() => {
    if (!serviceRequestBlockedUntil || serviceRequestBlockedUntil <= Date.now()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setServiceRequestBlockedUntil(0);
    }, serviceRequestBlockedUntil - Date.now());

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [serviceRequestBlockedUntil]);

  useEffect(() => {
    if (!hasKitchenOpenTimer && !hasBarOpenTimer && !hasTimedMenuWindows) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, hasKitchenOpenTimer || hasBarOpenTimer ? 1000 : 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasBarOpenTimer, hasKitchenOpenTimer, hasTimedMenuWindows]);

  function animateOrderMovement(
    menuItemId: string,
    direction: "to-order" | "from-order",
    sourceElement?: HTMLElement | null
  ) {
    const targetElement = orderJumpButtonRef.current;
    const menuItem = menu.find((item) => item.id === menuItemId);

    if (!sourceElement || !targetElement || !menuItem) {
      return;
    }

    const sourceRect = sourceElement.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const sourceX = sourceRect.left + sourceRect.width / 2;
    const sourceY = sourceRect.top + sourceRect.height / 2;
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;
    const startX = direction === "to-order" ? sourceX : targetX;
    const startY = direction === "to-order" ? sourceY : targetY;
    const endX = direction === "to-order" ? targetX : sourceX;
    const endY = direction === "to-order" ? targetY : sourceY;
    const id = Date.now() + Math.random();

    setFlyingOrderItems((current) => [
      ...current,
      {
        id,
        icon: categoryFlightIcons[menuItem.category] ?? "🍽️",
        startX,
        startY,
        deltaX: endX - startX,
        deltaY: endY - startY
      }
    ]);

    window.setTimeout(() => {
      setFlyingOrderItems((current) => current.filter((item) => item.id !== id));
    }, 1320);
  }

  function addItem(
    menuItemId: string,
    sourceElement?: HTMLElement | null,
    volumeOptionId?: string
  ) {
    animateOrderMovement(menuItemId, "to-order", sourceElement);
    const menuItem = menu.find((item) => item.id === menuItemId);
    const matchedVolumeOption = menuItem?.volumeOptions?.find(
      (option) => option.id === volumeOptionId
    );

    setItems((current) => {
      const existing = current.find(
        (item) =>
          item.menuItemId === menuItemId &&
          (item.volumeOptionId ?? "") === (volumeOptionId ?? "")
      );

      if (existing) {
        return current.map((item) =>
          item.menuItemId === menuItemId &&
          (item.volumeOptionId ?? "") === (volumeOptionId ?? "")
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...current,
        {
          menuItemId,
          quantity: 1,
          volumeOptionId,
          volumeLabel: matchedVolumeOption?.label,
          priceOverride: matchedVolumeOption?.price
        }
      ];
    });
  }

  function changeQuantity(
    menuItemId: string,
    delta: number,
    volumeOptionId?: string
  ) {
    setItems((current) =>
      current
        .map((item) =>
          item.menuItemId === menuItemId &&
          (item.volumeOptionId ?? "") === (volumeOptionId ?? "")
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  async function getResponseErrorMessage(
    response: Response,
    fallbackMessage: string
  ) {
    try {
      const data = (await response.json()) as { message?: string };
      return data.message || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }

  function decreaseItem(
    menuItemId: string,
    sourceElement?: HTMLElement | null,
    volumeOptionId?: string
  ) {
    animateOrderMovement(menuItemId, "from-order", sourceElement);
    changeQuantity(menuItemId, -1, volumeOptionId);
  }

  async function submitOrder(serveMode: ServeMode) {
    const now = Date.now();

    if (areKitchenAndBarClosed) {
      setMessage(text.kitchenClosedAction);
      return;
    }

    if (isKitchenClosed && hasDishesInOrder) {
      setShowReviewDialog(true);
      setMessage(text.kitchenClosedOrderCheck);
      return;
    }

    if (isBarClosed && hasDrinksInOrder) {
      setShowReviewDialog(true);
      setMessage(text.barClosedOrderCheck);
      return;
    }

    const payloadSignature = createOrderPayloadSignature(serveMode);

    if (
      submitting ||
      (lastSuccessfulOrderSignatureRef.current?.signature === payloadSignature &&
        now - lastSuccessfulOrderSignatureRef.current.submittedAt <
          ORDER_SUBMIT_THROTTLE_MS)
    ) {
      setDialogMessage(text.submitCooldown);
      return;
    }

    const clientRequestId =
      pendingOrderRequestIdRef.current ??
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

    setSubmitting(true);
    pendingOrderRequestIdRef.current = clientRequestId;
    window.localStorage.setItem(pendingOrderStorageKey, clientRequestId);
    setMessage(null);
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
          serveMode,
          clientRequestId
        })
      });

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, text.submitError));
      }

      const order = (await response.json()) as Order;
      setItems([]);
      lastSuccessfulOrderSignatureRef.current = {
        signature: payloadSignature,
        submittedAt: Date.now()
      };
      pendingOrderRequestIdRef.current = null;
      window.localStorage.removeItem(pendingOrderStorageKey);
      setSubmittedOrders((current) => {
        const existingIndex = current.findIndex((item) => item.id === order.id);

        if (existingIndex === -1) {
          return [order, ...current];
        }

        return current.map((item) => (item.id === order.id ? order : item));
      });
      setDialogMessage(text.orderSent);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : text.submitError;
      setMessage(
        errorMessage === text.submitError
          ? text.submitRetrySafe
          : errorMessage
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openServeModeDialog() {
    if (areKitchenAndBarClosed) {
      setMessage(text.kitchenClosedAction);
      return;
    }

    if (isKitchenClosed && hasDishesInOrder) {
      setMessage(text.kitchenClosedOrderCheck);
      return;
    }

    if (isBarClosed && hasDrinksInOrder) {
      setMessage(text.barClosedOrderCheck);
      return;
    }

    if (!items.length) {
      setMessage(text.addDish);
      return;
    }

    setShowReviewDialog(true);
  }

  async function callWaiter() {
    setMessage(null);

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
        throw new Error(await getResponseErrorMessage(response, text.waiterError));
      }

      const blockedUntil = Date.now() + SERVICE_REQUEST_COOLDOWN_MS;
      const storageKey = `service-request:${restaurantSlug}:${tableToken}`;
      window.localStorage.setItem(storageKey, String(blockedUntil));
      setHasActiveServiceRequest(true);
      setServiceRequestBlockedUntil(blockedUntil);
      setDialogMessage(text.waiterCalled);
    } catch (error) {
      setDialogMessage(
        error instanceof Error ? error.message : text.waiterError
      );
    }
  }

  async function requestBill() {
    setMessage(null);

    if (serviceRequestDisabled) {
      setDialogMessage(text.waiterAlreadyCalled);
      return;
    }

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "bill_request",
          restaurantSlug,
          tableNumber
        })
      });

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, text.billError));
      }

      const blockedUntil = Date.now() + SERVICE_REQUEST_COOLDOWN_MS;
      const storageKey = `service-request:${restaurantSlug}:${tableToken}`;
      window.localStorage.setItem(storageKey, String(blockedUntil));
      setHasActiveServiceRequest(true);
      setServiceRequestBlockedUntil(blockedUntil);
      setDialogMessage(text.billRequested);
    } catch (error) {
      setDialogMessage(error instanceof Error ? error.message : text.billError);
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

  function formatCountdown(remainingMs: number) {
    const totalMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
    return `${totalMinutes} min`;
  }

  function scrollToOrder() {
    orderPanelRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  function handleOrderJump() {
    scrollToOrder();
  }

  function getUpsellPromptType() {
    if (!hasDessertInOrder && !hasDrinksInOrder) {
      return "dessert_drinks" as const;
    }

    if (!hasDessertInOrder) {
      return "dessert" as const;
    }

    if (!hasDrinksInOrder) {
      return "drinks" as const;
    }

    return null;
  }

  function getUpsellPromptContent() {
    if (upsellPrompt === "dessert") {
      return {
        title: text.dessertPromptTitle,
        description: text.dessertPromptText
      };
    }

    if (upsellPrompt === "drinks") {
      return {
        title: text.drinksPromptTitle,
        description: text.drinksPromptText
      };
    }

    if (upsellPrompt === "dessert_drinks") {
      return {
        title: text.dessertDrinksPromptTitle,
        description: text.dessertDrinksPromptText
      };
    }

    return null;
  }

  function handleUpsellYes() {
    if (upsellPrompt === "dessert") {
      setSelectedMenuFilter("desserts");
    } else if (upsellPrompt === "drinks" || upsellPrompt === "dessert_drinks") {
      setSelectedMenuFilter("drinks");
    }

    setUpsellPrompt(null);
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

      {showWelcomeDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-dialog-title"
          >
            <h2 id="welcome-dialog-title">{text.welcomeTitle}</h2>
            <p>{text.welcomeText}</p>
            <button
              className="button-success"
              type="button"
              onClick={() => setShowWelcomeDialog(false)}
            >
              {text.welcomeOk}
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
                <div key={getCartItemKey(cartItem)} className="table-order-item">
                  <span>
                    {getMenuItemDisplayName(
                      menuItem.id,
                      cartItem.volumeLabel
                    )}{" "}
                    x {cartItem.quantity}
                  </span>
                  <strong>
                    {formatCurrency(
                      (cartItem.priceOverride ?? menuItem.price) *
                        cartItem.quantity
                    )}
                  </strong>
                </div>
              ))}
            </div>
            <div className="cart-summary">
              <span>{text.total}</span>
              <strong>{formatCurrency(currentOrderTotalAfterDiscount)}</strong>
            </div>
            {currentOrderDiscountAmount > 0 ? (
              <p className="muted">
                {text.happyHourDiscount}: -{formatCurrency(currentOrderDiscountAmount)}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                className="button-success"
                type="button"
                onClick={() => {
                  const nextUpsellPrompt = getUpsellPromptType();

                  if (!nextUpsellPrompt) {
                    void submitOrder("as_ready");
                    return;
                  }

                  setShowReviewDialog(false);
                  setUpsellPrompt(nextUpsellPrompt);
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

      {upsellPrompt && getUpsellPromptContent() ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upsell-prompt-dialog-title"
          >
            <h2 id="upsell-prompt-dialog-title">
              {getUpsellPromptContent()?.title}
            </h2>
            <p>{getUpsellPromptContent()?.description}</p>
            <div className="modal-actions">
              <button
                className="button-success"
                type="button"
                onClick={() => {
                  setUpsellPrompt(null);
                  void submitOrder("as_ready");
                }}
              >
                {text.dessertPromptLater}
              </button>
              <button
                className="button-neutral"
                type="button"
                onClick={handleUpsellYes}
              >
                {text.dessertPromptNow}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {orderingEnabled && !isOrderPanelVisible ? (
        <button
          ref={orderJumpButtonRef}
          className={
            [
              "order-jump-button",
              language === "he" ? "order-jump-button--rtl" : ""
            ]
              .filter(Boolean)
              .join(" ")
          }
          type="button"
          aria-label={text.jumpToOrder}
          onClick={handleOrderJump}
        >
          <span aria-hidden="true">🍽</span>
          {pendingOrderItemsCount > 0 ? (
            <span className="order-jump-button__count">
              {pendingOrderItemsCount}
            </span>
          ) : null}
          <span className="order-jump-button__label">{text.jumpToOrder}</span>
        </button>
      ) : null}
      {flyingOrderItems.map((item) => {
        const style = {
          left: `${item.startX}px`,
          top: `${item.startY}px`,
          "--fly-x": `${item.deltaX}px`,
          "--fly-y": `${item.deltaY}px`
        } as CSSProperties;

        return (
          <span key={item.id} className="flying-order-item" style={style}>
            {item.icon}
          </span>
        );
      })}

      <div
        className={
          language === "he" ? "page-shell menu-page menu-page--rtl" : "page-shell menu-page"
        }
        dir={language === "he" ? "rtl" : "ltr"}
      >
        <section className="hero">
          <div>
            <div className="menu-hero-header">
              <h1>{text.restaurantHeader || restaurantName}</h1>
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
            </div>
            <p className="lead">
              {orderingEnabled
                ? `${text.tableOrderingHint} ${tableNumber}`
                : "Menu"}
            </p>
            {orderingEnabled && serviceRequestDisabled ? (
              <p className="menu-service-note">{text.waiterServiceNote}</p>
            ) : null}
            {showKitchenOpenBanner ? (
              <div className="menu-kitchen-open">
                <span className="menu-kitchen-open__label">{text.kitchenOpen}</span>
                <strong className="menu-kitchen-open__timer">
                  {formatCountdown(kitchenOpenRemainingMs)}
                </strong>
              </div>
            ) : null}
            {showKitchenClosedBanner ? (
              <div className="menu-kitchen-open menu-kitchen-open--closed">
                <strong className="menu-kitchen-open__label">{text.kitchenClosed}</strong>
              </div>
            ) : null}
            {showKitchenClosedBanner ? (
              <p className="menu-kitchen-note">{text.kitchenClosedNote}</p>
            ) : null}
            {showBarOpenBanner ? (
              <div className="menu-kitchen-open">
                <span className="menu-kitchen-open__label">{text.barOpen}</span>
                <strong className="menu-kitchen-open__timer">
                  {formatCountdown(barOpenRemainingMs)}
                </strong>
              </div>
            ) : null}
            {showBarClosedBanner ? (
              <div className="menu-kitchen-open menu-kitchen-open--closed">
                <strong className="menu-kitchen-open__label">{text.barClosed}</strong>
              </div>
            ) : null}
            {showBarClosedBanner ? (
              <p className="menu-kitchen-note">{text.barClosedNote}</p>
            ) : null}
            {showKitchenLoadWarning ? (
              <p className="menu-kitchen-warning">{text.kitchenLoadWarning}</p>
            ) : null}
            {promotionBannerTexts.length || businessLunchBannerTexts.length ? (
              <div className="menu-alert-banners">
                {promotionBannerTexts.map((promotionText) => (
                  <p key={promotionText} className="menu-alert-banner menu-happy-hour">
                    {promotionText}
                  </p>
                ))}
                {businessLunchBannerTexts.map((businessLunchText) => (
                  <p
                    key={businessLunchText}
                    className="menu-alert-banner menu-happy-hour menu-business-lunch"
                  >
                    {businessLunchText}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          {orderingEnabled ? (
            <div
              className={
                language === "he"
                  ? "menu-action-card menu-action-card--stacked menu-action-card--rtl"
                  : "menu-action-card menu-action-card--stacked"
              }
            >
              <div className="menu-action-buttons">
                <button
                  className="button-danger button-danger--call"
                  type="button"
                  onClick={() => setServiceMenuOpen((current) => !current)}
                  aria-expanded={serviceMenuOpen}
                  aria-controls="service-action-menu"
                >
                  {text.callWaiter}
                </button>
                {serviceMenuOpen ? (
                  <div id="service-action-menu" className="service-action-menu">
                    <button
                      className="button-neutral button-neutral--bill"
                      type="button"
                      onClick={() => {
                        setServiceMenuOpen(false);
                        void requestBill();
                      }}
                      disabled={serviceRequestDisabled}
                    >
                      {text.requestBill}
                    </button>
                    <button
                      className="button-neutral button-neutral--bill"
                      type="button"
                      onClick={() => {
                        setServiceMenuOpen(false);
                        void callWaiter();
                      }}
                    >
                      {text.serviceHelp}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <div className="content-grid">
          <MenuList
            items={visibleMenu}
            language={language}
            quantities={quantities}
            orderingEnabled={orderingEnabled}
            dishesClosed={showKitchenClosedBanner}
            drinksClosed={showBarClosedBanner}
            categoryDiscounts={categoryDiscounts}
            onAdd={addItem}
            onDecrease={decreaseItem}
            selectedFilter={effectiveSelectedFilter}
          />

          {orderingEnabled ? (
          <aside
            id="new-order-panel"
            ref={orderPanelRef}
            className="cart-panel cart-panel--new-order"
          >
            <div className="section-header">
              <h2>{text.newOrder}</h2>
            </div>

            {!detailedItems.length ? (
              <div className="cart-empty-state" role="status" aria-live="polite">
                <span className="cart-empty-state__icon" aria-hidden="true">
                  🍽
                </span>
                <p className="cart-empty-state__text">{text.emptyCart}</p>
              </div>
            ) : (
              <div className="cart-list">
                {detailedItems.map(({ cartItem, menuItem }) => (
                  <div className="cart-row" key={getCartItemKey(cartItem)}>
                    <div>
                      <strong>
                        {getMenuItemDisplayName(
                          menuItem.id,
                          cartItem.volumeLabel
                        )}
                      </strong>
                      <p className="muted">
                        {formatCurrency(cartItem.priceOverride ?? menuItem.price)}
                      </p>
                    </div>
                    <div className="quantity-box">
                      <button
                        type="button"
                        onClick={() =>
                          changeQuantity(
                            menuItem.id,
                            -1,
                            cartItem.volumeOptionId
                          )
                        }
                      >
                        -
                      </button>
                      <span>{cartItem.quantity}</span>
                      <button
                        type="button"
                        onClick={() =>
                          changeQuantity(
                            menuItem.id,
                            1,
                            cartItem.volumeOptionId
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeCartRecommendations.length ? (
              <div className="cart-recommendations" role="status" aria-live="polite">
                {activeCartRecommendations.map((recommendation) => (
                  <div
                    key={
                      recommendation.kind === "item"
                        ? `item-${recommendation.suggestedItem.id}`
                        : `category-${recommendation.suggestedCategory}`
                    }
                    className="cart-recommendation"
                  >
                    <div>
                      <p className="cart-recommendation__eyebrow">
                        {text.recommendationTitle}
                      </p>
                      <p className="cart-recommendation__text">
                        {text.recommendationPrefix}{" "}
                        <strong>
                          {getMenuItemDisplayName(recommendation.triggerItem.id)}
                        </strong>
                        {text.recommendationJoiner}{" "}
                        <strong>
                          {recommendation.kind === "item"
                            ? getMenuItemDisplayName(recommendation.suggestedItem.id)
                            : getMenuCategoryDisplayName(
                                recommendation.suggestedCategory
                              )}
                        </strong>
                        .
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button-neutral cart-recommendation__button"
                      onClick={() => {
                        if (recommendation.kind === "item") {
                          addItem(
                            recommendation.suggestedItem.id,
                            null,
                            recommendation.suggestedItem.volumeOptions?.[0]?.id
                          );
                          return;
                        }

                        setSelectedMenuFilter(recommendation.suggestedCategory);
                      }}
                    >
                      {recommendation.kind === "item"
                        ? text.recommendationAdd
                        : text.recommendationView}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="cart-summary">
              <span>{text.total}</span>
              <strong>{formatCurrency(currentOrderTotalAfterDiscount)}</strong>
            </div>
            {currentOrderDiscountAmount > 0 ? (
              <p className="muted">
                {text.happyHourDiscount}: -{formatCurrency(currentOrderDiscountAmount)}
              </p>
            ) : null}

            <button
              className={
                shouldAnimateSubmitButton
                  ? "cart-submit cart-submit--animated"
                  : "cart-submit"
              }
              type="button"
              onClick={openServeModeDialog}
              disabled={submitDisabled}
            >
              {areKitchenAndBarClosed
                ? text.kitchenClosedAction
                : isKitchenClosed && hasDishesInOrder
                ? text.kitchenClosedAction
                : isBarClosed && hasDrinksInOrder
                  ? text.barClosed
                : submitting
                  ? text.submitting
                  : text.submit}
            </button>
            {submitting ? (
              <p className="status-message status-message--loading">
                {text.submitLoadingNote}
              </p>
            ) : null}

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
                  <div className="submitted-orders__summary-copy">
                    <h2>
                      <span>{text.currentOrders}</span>{" "}
                      <span className="submitted-orders__summary-total">
                        ({formatCurrency(submittedOrdersTotal)})
                      </span>
                    </h2>
                  </div>
                  <span
                    className="submitted-orders__chevron"
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M5 7.5L10 12.5L15 7.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </summary>
                <div className="submitted-orders__content">
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
                              {getMenuItemDisplayName(
                                item.menuItemId,
                                item.volumeLabel
                              ) || item.name}
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
          ) : null}
        </div>
        <div className="menu-quick-info menu-quick-info--bottom" aria-label="Guest information shortcuts">
          {text.quickInfo.map((label) => (
            <span key={label} className="menu-quick-info__chip">
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
