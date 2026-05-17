"use client";

import Link from "next/link";
import Script from "next/script";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import { MenuList } from "@/components/menu/MenuList";
import type { MenuFilter } from "@/components/menu/MenuList";
import type { MenuCategoryDefinition } from "@/lib/menu-categories";
import { formatCurrency, getLocalizedVolumeOptionLabel } from "@/lib/menu";
import {
  agorotToShekels,
  calculateCartTotal,
  percentToBps,
  shekelsToAgorot
} from "@/lib/money";
import { getGuestShortOrderNumber } from "@/lib/order-number-display";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  BusinessLunchSettings,
  ContactRequirement,
  PromotionSettings,
  RecommendationRuleSettings,
  RestaurantOrderMode
} from "@/lib/menu-settings";
import {
  CartItem,
  MenuCategory,
  MenuItem,
  MenuLanguage,
  Order,
  OrderStatus,
  ServeMode
} from "@/lib/types";

type CartProps = {
  restaurantId?: string;
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  tableToken: string;
  orderingEnabled?: boolean;
  orderMode?: RestaurantOrderMode;
  contactRequirement?: ContactRequirement;
  requireOtp?: boolean;
  showGuestOrderHistory?: boolean;
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
  categoryDefinitions?: MenuCategoryDefinition[];
};

type FlyingOrderItem = {
  id: number;
  icon: string;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
};

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: "auto" | "light" | "dark";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const categoryFlightIcons: Record<MenuCategory, string> = {
  starters: "🥗",
  mains: "🍝",
  buters: "🥪",
  sweet: "🥞",
  cakes: "🎂",
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
  alcohol: "🍷",
  cocktails: "🍸",
  chasers: "🥃",
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
  "alcohol",
  "cocktails",
  "chasers",
  "two_component_mixture",
  "dot4",
  "non_alcoholic_drinks"
]);

const SERVICE_REQUEST_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_CART_RECOMMENDATIONS_PER_TRIGGER_ITEM = 3;
const AUTO_COOKING_AFTER_MS = 3 * 60 * 1000;
const MENU_SETTINGS_FALLBACK_POLL_MS = 60_000;
const TABLE_SESSION_ACTIVE_POLL_MS = 6_000;
const TABLE_SESSION_HIDDEN_POLL_MS = 18_000;
const MENU_SETTINGS_REALTIME_DEBOUNCE_MS = 300;
const COUNTER_CAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_COUNTER_CAPTCHA_SITE_KEY?.trim() ?? "";
const COUNTER_CAPTCHA_PUBLIC_ENABLED = ["1", "true", "yes", "on"].includes(
  (process.env.NEXT_PUBLIC_COUNTER_CAPTCHA_ENABLED ?? "").toLowerCase()
);
const COUNTER_CAPTCHA_MISSING_MESSAGE = "Please complete the captcha check.";
const COUNTER_CAPTCHA_INIT_FAILED_MESSAGE =
  "Captcha could not be initialized. Please refresh and try again.";

function getQuickInfoLinks(restaurantSlug: string) {
  const normalizedSlug = restaurantSlug.trim().toLowerCase();

  if (normalizedSlug === "simulev") {
    return [
      null,
      "https://maps.app.goo.gl/MVeFS6CFBWwA4x5VA",
      "https://www.instagram.com/simulev.tlv/"
    ] as const;
  }

  return [null, null, null] as const;
}

const uiText = {
  he: {
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
    emptyCart: "הוסיפו משהו טעים מהתפריט.",
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
    currentOrdersActiveHint: "ההזמנה שלכם למטה 👇",
    orderNew: "חדש",
    orderPreparing: "בהכנה",
    orderServed: "הוגש",
    thankYou: "תודה",
    orderSent: "ההזמנה שלכם נשלחה. אנחנו מכינים באהבה.",
    orderStatusOptIn:
      "אם תרצו לקבל עדכון ב-WhatsApp כשההזמנה תהיה מוכנה, השאירו בבקשה את מספר הטלפון שלכם.",
    orderStatusName: "שם",
    orderStatusPhone: "מספר טלפון",
    privacyPolicy: "Privacy Policy",
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
    emptyCart: "Add something tasty from the menu.",
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
    currentOrdersActiveHint: "Your order below 👇",
    orderNew: "New",
    orderPreparing: "Preparing",
    orderServed: "Served",
    thankYou: "Thanks",
    orderSent: "Your order has been sent. We are cooking with love.",
    orderStatusOptIn: "Get a WhatsApp update when your order is ready.",
    orderStatusName: "Name",
    orderStatusPhone: "Phone number",
    privacyPolicy: "Privacy Policy",
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
  },
  ru: {
    table: "Стол",
    tableOrderingHint: "📍 Вы оформляете заказ со стола",
    callWaiter: "Позвать официанта",
    requestBill: "Принести счёт",
    serviceHelp: "Помощь / вопрос",
    welcomeTitle: "Добро пожаловать",
    welcomeText:
      "Выберите блюда из меню и отправьте заказ прямо со своего стола.",
    welcomeOk: "ОК",
    reviewOrderTitle: "Проверьте ваш заказ",
    reviewOrderText: "Пожалуйста, проверьте заказ перед отправкой.",
    reviewOrderOk: "ОК",
    reviewOrderChange: "Изменить",
    dessertPromptTitle: "Ещё один момент",
    dessertPromptText: "Добавить десерт?",
    drinksPromptTitle: "Ещё один момент",
    drinksPromptText: "Добавить напитки?",
    dessertDrinksPromptTitle: "Ещё один момент",
    dessertDrinksPromptText: "Добавить напиток или десерт?",
    dessertPromptLater: "Позже",
    dessertPromptNow: "Да",
    serveModeTitle: "Как подать ваш заказ?",
    serveModeText: "Выберите удобный вариант подачи.",
    serveAll: "Подать всё вместе",
    serveAsReady: "Подавайте по готовности",
    newOrder: "Мой заказ",
    emptyCart: "Добавьте что-нибудь вкусное из меню.",
    recommendationTitle: "Вам также может понравиться",
    recommendationPrefix: "Вы выбрали",
    recommendationJoiner: ". Добавить",
    recommendationAdd: "Добавить",
    recommendationView: "Открыть",
    total: "Итого",
    happyHourDiscount: "Скидка Happy hour",
    submit: "Оформить заказ",
    submitting: "Отправка...",
    currentOrders: "Текущие заказы",
    currentOrdersActiveHint: "Ваш заказ ниже 👇",
    orderNew: "Новый",
    orderPreparing: "Готовится",
    orderServed: "Подан",
    thankYou: "Спасибо",
    orderSent: "Ваш заказ отправлен. Мы готовим с любовью.",
    orderStatusOptIn: "Получить WhatsApp-уведомление, когда заказ будет готов.",
    orderStatusName: "Имя",
    orderStatusPhone: "Номер телефона",
    privacyPolicy: "Privacy Policy",
    waiterCalled: "Официант вызван",
    billRequested: "Официант скоро принесёт счёт.\nСпасибо, что были у нас!",
    waiterServiceNote: "Официант уже идёт к вам.",
    waiterAlreadyCalled: "Официант скоро подойдёт к вашему столику.",
    kitchenOpen: "Кухня закроется через",
    kitchenClosed: "Кухня закрыта",
    kitchenClosedNote: "Сейчас доступны только напитки.",
    barOpen: "Бар закроется через",
    barClosed: "Бар закрыт",
    barClosedNote: "Сейчас доступны только блюда кухни.",
    kitchenClosedAction: "К сожалению, кухня закрыта",
    kitchenClosedOrderCheck:
      "Кухня закрыта. Проверьте заказ, оставьте только напитки и подтвердите ещё раз.",
    barClosedOrderCheck:
      "Бар закрыт. Проверьте заказ, оставьте только блюда кухни и подтвердите ещё раз.",
    waiterAvailable: "Официант всё ещё доступен, если вам нужна помощь.",
    kitchenLoadWarning:
      "Из-за большого количества заказов время приготовления может быть дольше обычного. Спасибо за терпение.",
    happyHour: "Happy hour",
    businessLunchNow: "Бизнес-ланч доступен сейчас",
    happyHourStartsFrom: "с",
    happyHourUntil: "до",
    addDish: "Добавьте хотя бы одно блюдо.",
    submitCooldown: "Этот заказ уже был отправлен.",
    submitRetrySafe:
      "Мы не смогли подтвердить получение заказа. Корзина сохранена, можно безопасно попробовать ещё раз без дубля.",
    submitLoadingNote: "Отправляем… Пожалуйста, не закрывайте страницу.",
    submitError: "Не удалось отправить заказ",
    waiterError: "Не удалось вызвать официанта",
    billError: "Не удалось запросить счёт",
    close: "Закрыть",
    jumpToOrder: "Мой заказ",
    quickInfo: [
      "📍 Другие локации",
      "⭐ Оставить отзыв",
      "📲 Подписаться"
    ]
  }
} as const;

export function Cart({
  restaurantId,
  restaurantSlug,
  restaurantName,
  tableNumber,
  tableToken,
  orderingEnabled = true,
  orderMode = "tables",
  contactRequirement = "none",
  requireOtp = false,
  showGuestOrderHistory = false,
  menu,
  showKitchenLoadWarning,
  promotions = [],
  businessLunches = [],
  recommendations = [],
  showKitchenOpen,
  kitchenOpenUntil,
  showBarOpen,
  barOpenUntil,
  initialSubmittedOrders,
  categoryDefinitions = []
}: CartProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(orderingEnabled);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [upsellPrompt, setUpsellPrompt] = useState<
    null | "dessert" | "drinks" | "dessert_drinks"
  >(null);
  const [selectedMenuFilter, setSelectedMenuFilter] = useState<MenuFilter | null>(
    null
  );
  const [language, setLanguage] = useState<MenuLanguage>("he");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [liveMenu, setLiveMenu] = useState<MenuItem[]>(menu);
  const [livePromotions, setLivePromotions] = useState<PromotionSettings[]>(promotions);
  const [liveBusinessLunches, setLiveBusinessLunches] = useState<BusinessLunchSettings[]>(
    businessLunches
  );
  const [liveRecommendations, setLiveRecommendations] = useState<
    RecommendationRuleSettings[]
  >(recommendations);
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
  const [wantsOrderStatusUpdates, setWantsOrderStatusUpdates] = useState(false);
  const [guestContactName, setGuestContactName] = useState("");
  const [guestContactPhone, setGuestContactPhone] = useState("");
  const [counterOtpCode, setCounterOtpCode] = useState("");
  const [counterOtpSending, setCounterOtpSending] = useState(false);
  const [counterOtpDebugCode, setCounterOtpDebugCode] = useState<string | null>(null);
  const [counterCaptchaToken, setCounterCaptchaToken] = useState<string | null>(
    null
  );
  const [counterCaptchaScriptReady, setCounterCaptchaScriptReady] = useState(false);
  const [counterCaptchaError, setCounterCaptchaError] = useState<string | null>(null);
  const [counterDeviceId, setCounterDeviceId] = useState<string | null>(null);
  const [latestSubmittedOrderId, setLatestSubmittedOrderId] = useState<string | null>(
    null
  );
  const [flyingOrderItems, setFlyingOrderItems] = useState<FlyingOrderItem[]>([]);
  const orderJumpButtonRef = useRef<HTMLButtonElement | null>(null);
  const orderPanelRef = useRef<HTMLElement | null>(null);
  const menuSectionRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const counterCaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const counterCaptchaWidgetIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef(currentSessionId);
  const sessionSyncPollCountRef = useRef(0);
  const pendingOrderRequestIdRef = useRef<string | null>(null);
  const isCounterMode = orderMode === "counter";
  const quickInfoLinks = useMemo(
    () => getQuickInfoLinks(restaurantSlug),
    [restaurantSlug]
  );
  const liveMenuById = useMemo(
    () => new Map(liveMenu.map((item) => [item.id, item])),
    [liveMenu]
  );
  const counterRequiresPhone =
    isCounterMode && (contactRequirement === "phone_only" || requireOtp);
  const counterRequiresNameOrPhone =
    isCounterMode && contactRequirement === "name_or_phone";
  const shouldRenderCounterCaptcha =
    isCounterMode &&
    COUNTER_CAPTCHA_PUBLIC_ENABLED &&
    COUNTER_CAPTCHA_SITE_KEY.length > 0;

  useEffect(() => {
    setLiveMenu(menu);
  }, [menu]);

  useEffect(() => {
    setLivePromotions(promotions);
  }, [promotions]);

  useEffect(() => {
    setLiveBusinessLunches(businessLunches);
  }, [businessLunches]);

  useEffect(() => {
    setLiveRecommendations(recommendations);
  }, [recommendations]);

  useEffect(() => {
    let cancelled = false;
    let inFlightAbortController: AbortController | null = null;
    let pollTimeoutId: number | null = null;
    let realtimeDebounceId: number | null = null;
    const supabase = getSupabaseClient();
    const realtimeChannel = supabase
      ? supabase
          .channel(`menu-settings-${restaurantSlug}-${Date.now()}`)
          .on(
            "postgres_changes",
            restaurantId
              ? {
                  event: "*",
                  schema: "public",
                  table: "menu_settings",
                  filter: `restaurant_id=eq.${restaurantId}`
                }
              : {
                  event: "*",
                  schema: "public",
                  table: "menu_settings"
                },
            () => {
              if (cancelled) {
                return;
              }

              if (realtimeDebounceId !== null) {
                window.clearTimeout(realtimeDebounceId);
              }

              realtimeDebounceId = window.setTimeout(() => {
                void syncMenuSettings();
              }, MENU_SETTINGS_REALTIME_DEBOUNCE_MS);
            }
          )
      : null;

    function scheduleNextSync() {
      if (cancelled) {
        return;
      }

      pollTimeoutId = window.setTimeout(() => {
        void syncMenuSettings();
      }, MENU_SETTINGS_FALLBACK_POLL_MS);
    }

    async function syncMenuSettings() {
      if (cancelled) {
        return;
      }

      if (document.visibilityState === "hidden") {
        scheduleNextSync();
        return;
      }

      inFlightAbortController?.abort();
      inFlightAbortController = new AbortController();

      let response: Response;

      try {
        response = await fetch(
          `/api/menu-settings?restaurantSlug=${encodeURIComponent(
            restaurantSlug
          )}&fields=promotions,businessLunches,recommendations`,
          {
            cache: "no-store",
            signal: inFlightAbortController.signal
          }
        );
      } catch {
        scheduleNextSync();
        return;
      }

      if (!response.ok) {
        scheduleNextSync();
        return;
      }

      const data = (await response.json()) as {
        promotions?: PromotionSettings[];
        businessLunches?: BusinessLunchSettings[];
        recommendations?: RecommendationRuleSettings[];
      };

      if (!cancelled) {
        if (Array.isArray(data.promotions)) {
          setLivePromotions(data.promotions);
        }

        if (Array.isArray(data.businessLunches)) {
          setLiveBusinessLunches(data.businessLunches);
        }

        if (Array.isArray(data.recommendations)) {
          setLiveRecommendations(data.recommendations);
        }
      }

      scheduleNextSync();
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }

      void syncMenuSettings();
    }

    if (realtimeChannel) {
      realtimeChannel.subscribe();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void syncMenuSettings();

    return () => {
      cancelled = true;
      inFlightAbortController?.abort();

      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
      }

      if (realtimeDebounceId !== null) {
        window.clearTimeout(realtimeDebounceId);
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (realtimeChannel && supabase) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, [restaurantId, restaurantSlug]);

  const detailedItems = useMemo(() => {
    return items
      .map((cartItem) => {
        const menuItem = liveMenuById.get(cartItem.menuItemId);
        return menuItem ? { cartItem, menuItem } : null;
      })
      .filter(Boolean) as { cartItem: CartItem; menuItem: MenuItem }[];
  }, [items, liveMenuById]);

  const cartItemMetrics = useMemo(() => {
    const quantities: Record<string, number> = {};
    let pendingOrderItemsCount = 0;

    for (const item of items) {
      pendingOrderItemsCount += item.quantity;
      quantities[`${item.menuItemId}:${item.volumeOptionId ?? "base"}`] = item.quantity;
    }

    return { pendingOrderItemsCount, quantities };
  }, [items]);
  const { pendingOrderItemsCount, quantities } = cartItemMetrics;
  const detailedOrderState = useMemo(() => {
    const currentOrderItemIds = new Set<string>();
    const currentOrderCategories = new Set<MenuCategory>();
    const uniqueTriggerItemIdsInOrder: string[] = [];
    let hasDessertInOrder = false;
    let hasDrinksInOrder = false;
    let hasDishesInOrder = false;

    for (const { menuItem } of detailedItems) {
      currentOrderCategories.add(menuItem.category);

      if (!currentOrderItemIds.has(menuItem.id)) {
        currentOrderItemIds.add(menuItem.id);
        uniqueTriggerItemIdsInOrder.push(menuItem.id);
      }

      if (menuItem.category === "desserts") {
        hasDessertInOrder = true;
      }

      if (drinkCategories.has(menuItem.category)) {
        hasDrinksInOrder = true;
      } else {
        hasDishesInOrder = true;
      }
    }

    return {
      currentOrderItemIds,
      currentOrderCategories,
      uniqueTriggerItemIdsInOrder,
      hasDessertInOrder,
      hasDrinksInOrder,
      hasDishesInOrder
    };
  }, [detailedItems, drinkCategories]);
  const {
    currentOrderItemIds,
    currentOrderCategories,
    uniqueTriggerItemIdsInOrder,
    hasDessertInOrder,
    hasDrinksInOrder,
    hasDishesInOrder
  } = detailedOrderState;
  const normalizedGuestPhone = useMemo(() => {
    const normalized = guestContactPhone.replace(/[^\d+]/g, "").trim();

    if (!normalized) {
      return "";
    }

    return normalized.startsWith("+") ? normalized : `+${normalized}`;
  }, [guestContactPhone]);
  const hasValidGuestPhone = useMemo(() => {
    const withoutPlus = normalizedGuestPhone.startsWith("+")
      ? normalizedGuestPhone.slice(1)
      : normalizedGuestPhone;

    return withoutPlus.length >= 7 && withoutPlus.length <= 15;
  }, [normalizedGuestPhone]);
  const hasCounterContactReady = useMemo(() => {
    if (!isCounterMode) {
      return true;
    }

    if (counterRequiresPhone) {
      return hasValidGuestPhone;
    }

    if (counterRequiresNameOrPhone) {
      return Boolean(guestContactName.trim() || hasValidGuestPhone);
    }

    return true;
  }, [
    counterRequiresNameOrPhone,
    counterRequiresPhone,
    guestContactName,
    hasValidGuestPhone,
    isCounterMode
  ]);

  const submittedOrdersTotal = agorotToShekels(
    submittedOrders.reduce(
      (sum, order) => sum + shekelsToAgorot(order.total),
      0
    )
  );
  const submittedOrdersSummaryStatus = useMemo(() => {
    let hasPreparing = false;
    let hasServed = false;

    for (const order of submittedOrders) {
      const status = getGuestVisibleOrderStatus(order);

      if (status === "new") {
        return "new" as const;
      }

      if (status === "preparing") {
        hasPreparing = true;
      } else if (status === "served") {
        hasServed = true;
      }
    }

    if (hasPreparing) {
      return "preparing" as const;
    }

    if (hasServed) {
      return "served" as const;
    }

    return null;
  }, [countdownNow, submittedOrders]);
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
    !orderingEnabled ||
    detailedItems.length === 0 ||
    submitting ||
    areKitchenAndBarClosed ||
    (isKitchenClosed && hasDishesInOrder) ||
    (isBarClosed && hasDrinksInOrder);
  const shouldAnimateSubmitButton = detailedItems.length > 0 && !submitDisabled;
  const promoCategoryLabels = useMemo<Record<MenuCategory, string>>(
    () => ({
      starters: language === "he" ? "מנות פתיחה" : language === "ru" ? "закуски" : "starters",
      mains: language === "he" ? "עיקריות" : language === "ru" ? "основные блюда" : "main courses",
      buters:
        language === "he"
          ? "סנדוויצ'ים"
          : language === "ru"
            ? "бутерброды"
            : "sandwiches",
      sweet:
        language === "he"
          ? "מנות מתוקות"
          : language === "ru"
            ? "сладкие блюда"
            : "sweet dishes",
      cakes: language === "he" ? "עוגות" : language === "ru" ? "торты" : "cakes",
      drinks:
        language === "he" ? "משקאות" : language === "ru" ? "напитки" : "drinks",
      fluids:
        language === "he" ? "משקאות קלים" : language === "ru" ? "напитки" : "fluids",
      draft: language === "he" ? "מהחבית" : language === "ru" ? "разливное" : "draft",
      bottled:
        language === "he" ? "בבקבוק" : language === "ru" ? "бутылочное" : "bottled",
      fuel: language === "he" ? "חזקים" : language === "ru" ? "топливо" : "fuel",
      whiskey: language === "he" ? "ויסקי" : language === "ru" ? "виски" : "whiskey",
      vodka: language === "he" ? "וודקה" : language === "ru" ? "водка" : "vodka",
      rum: language === "he" ? "רום" : language === "ru" ? "ром" : "rum",
      cognac: language === "he" ? "קוניאק" : language === "ru" ? "коньяк" : "cognac",
      gin: language === "he" ? "ג׳ין" : language === "ru" ? "джин" : "gin",
      tequila: language === "he" ? "טקילה" : language === "ru" ? "текила" : "tequila",
      absent: language === "he" ? "אבסינת" : language === "ru" ? "абсент" : "absent",
      ouzo: language === "he" ? "אוזו" : language === "ru" ? "узо" : "ouzo",
      likers: language === "he" ? "ליקרים" : language === "ru" ? "ликёры" : "likers",
      alcohol: language === "he" ? "אלכוהול" : language === "ru" ? "алкоголь" : "alcohol",
      cocktails:
        language === "he" ? "קוקטיילים" : language === "ru" ? "коктейли" : "cocktails",
      chasers:
        language === "he"
          ? "צ'ייסרים"
          : language === "ru"
            ? "чейсеры"
            : "Chasers",
      two_component_mixture:
        language === "he"
          ? "מיקס דו-רכיבי"
          : language === "ru"
            ? "2-компонентный микс"
            : "2 component mixture",
      dot4: "DOT 4",
      non_alcoholic_drinks:
        language === "he"
          ? "משקאות ללא אלכוהול"
          : language === "ru"
            ? "безалкогольные напитки"
            : "non-alcoholic drinks",
      desserts: language === "he" ? "קינוחים" : language === "ru" ? "десерты" : "desserts"
    }),
    [language]
  );
  const hasTimedMenuWindows = useMemo(
    () =>
      livePromotions.some(
        (promotion) =>
          promotion.enabled &&
          Boolean(promotion.startsFrom || promotion.until)
      ) ||
      liveBusinessLunches.some(
        (businessLunch) =>
          businessLunch.enabled &&
          Boolean(businessLunch.startsFrom || businessLunch.until)
      ),
    [liveBusinessLunches, livePromotions]
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
    return livePromotions.filter(
      (promotion) =>
        promotion.discountPercent > 0 && isScheduledWindowActive(promotion)
    );
  }, [countdownNow, livePromotions]);
  const activeBusinessLunches = useMemo(
    () =>
      liveBusinessLunches.filter((businessLunch) => isScheduledWindowActive(businessLunch)),
    [countdownNow, liveBusinessLunches]
  );
  const visibleMenu = useMemo(() => {
    const restrictedCategories = new Set<MenuCategory>(
      liveBusinessLunches.flatMap((businessLunch) =>
        businessLunch.enabled ? businessLunch.categories : []
      )
    );
    const activeBusinessLunchCategories = new Set<MenuCategory>(
      activeBusinessLunches.flatMap((businessLunch) => businessLunch.categories)
    );

    if (restrictedCategories.size === 0) {
      return liveMenu;
    }

    return liveMenu.filter(
      (item) =>
        !restrictedCategories.has(item.category) ||
        activeBusinessLunchCategories.has(item.category)
    );
  }, [activeBusinessLunches, liveBusinessLunches, liveMenu]);
  const visibleMenuCategories = useMemo(
    () => new Set(visibleMenu.map((item) => item.category)),
    [visibleMenu]
  );

  const effectiveSelectedFilter =
    selectedMenuFilter &&
    !(
      selectedMenuFilter === "drinks"
        ? [...visibleMenuCategories].some((category) => drinkCategories.has(category))
        : visibleMenuCategories.has(selectedMenuFilter)
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
            ? `${language === "he" ? "על" : language === "ru" ? "на" : "on"} ${promoCategorySummary}`
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
          ? `🍽 ${baseText} · ${language === "he" ? "על" : language === "ru" ? "на" : "on"} ${categorySummary}`
          : `🍽 ${baseText}`;
      }),
    [activeBusinessLunches, language, promoCategoryLabels, text.businessLunchNow]
  );
  const cartCalculation = useMemo(() => {
    const lineItems = detailedItems.map(({ cartItem, menuItem }) => ({
      id: `${cartItem.menuItemId}:${cartItem.volumeOptionId ?? cartItem.volumeLabel ?? "base"}`,
      name: menuItem.nameEn || menuItem.nameHe || menuItem.name,
      unitPriceAgorot: shekelsToAgorot(cartItem.priceOverride ?? menuItem.price),
      quantity: cartItem.quantity
    }));

    const discountedLineIdsByCategory = new Map<MenuCategory, string[]>();

    for (const { cartItem, menuItem } of detailedItems) {
      const categoryDiscount = categoryDiscounts[menuItem.category] ?? 0;

      if (categoryDiscount <= 0) {
        continue;
      }

      const currentLineIds = discountedLineIdsByCategory.get(menuItem.category) ?? [];
      currentLineIds.push(
        `${cartItem.menuItemId}:${cartItem.volumeOptionId ?? cartItem.volumeLabel ?? "base"}`
      );
      discountedLineIdsByCategory.set(menuItem.category, currentLineIds);
    }

    const discounts = [...discountedLineIdsByCategory.entries()].map(
      ([category, lineIds]) => ({
        type: "percent" as const,
        valueBps: percentToBps(categoryDiscounts[category] ?? 0),
        label: `Happy hour ${category}`,
        appliesToItemIds: lineIds
      })
    );

    return calculateCartTotal(lineItems, discounts);
  }, [categoryDiscounts, detailedItems]);
  const currentOrderDiscountAmount = agorotToShekels(
    cartCalculation.totalDiscountAgorot
  );
  const currentOrderTotalAfterDiscount = agorotToShekels(
    cartCalculation.totalAgorot
  );

  const cartStorageKey = useMemo(
    () => `cart:${restaurantSlug}:${tableToken}`,
    [restaurantSlug, tableToken]
  );
  const pendingOrderStorageKey = useMemo(
    () => `pending-order:${restaurantSlug}:${tableToken}`,
    [restaurantSlug, tableToken]
  );

  function getMenuItemDisplayName(
    menuItemId: string,
    volumeLabel?: string | null
  ) {
    const menuItem = liveMenuById.get(menuItemId);

    if (!menuItem) {
      return "";
    }

    const baseName =
      language === "he"
        ? menuItem.nameHe || menuItem.name
        : language === "ru"
          ? menuItem.nameRu || menuItem.nameEn || menuItem.nameHe || menuItem.name
          : menuItem.nameEn || menuItem.nameHe || menuItem.name;

    return volumeLabel ? `${baseName} · ${volumeLabel}` : baseName;
  }

  function getCartItemKey(cartItem: CartItem) {
    return `${cartItem.menuItemId}:${cartItem.volumeOptionId ?? cartItem.volumeLabel ?? "base"}`;
  }

  function getOrderStatusLabel(status: OrderStatus) {
    if (status === "new") {
      return text.orderNew;
    }

    if (status === "served") {
      return text.orderServed;
    }

    if (status === "preparing") {
      return text.orderPreparing;
    }

    return null;
  }

  function isCookedOrder(order: Order) {
    return (
      order.kind !== "waiter_call" &&
      order.kind !== "bill_request" &&
      order.items.length > 0 &&
      order.items.some((item) =>
        typeof item.note === "string"
          ? item.note.includes("__menu_order_cooked__")
          : false
      )
    );
  }

  function getGuestVisibleOrderStatus(order: Order): OrderStatus | null {
    if (order.status === "cancelled") {
      return null;
    }

    if (order.status === "served") {
      return "served";
    }

    if (
      order.status === "preparing" ||
      isCookedOrder(order) ||
      countdownNow - new Date(order.createdAt).getTime() >= AUTO_COOKING_AFTER_MS
    ) {
      return "preparing";
    }

    return "new";
  }

  function getMenuCategoryDisplayName(category: MenuCategory) {
    return promoCategoryLabels[category] ?? category;
  }

  const activeCartRecommendations = useMemo(() => {
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
      liveRecommendations.some((recommendation) => {
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
            currentOrderCategories.has(suggestedCategory) ||
            !visibleMenuCategories.has(suggestedCategory) ||
            (isKitchenClosed && !drinkCategories.has(suggestedCategory)) ||
            (isBarClosed && drinkCategories.has(suggestedCategory))
          ) {
            return false;
          }

          return true;
        }

        const suggestedItem = liveMenuById.get(recommendation.suggestedItemId);

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

    for (const recommendation of liveRecommendations) {
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

      const triggerItem = liveMenuById.get(recommendation.triggerItemId);
      const suggestedItem =
        recommendation.suggestedType === "item"
          ? liveMenuById.get(recommendation.suggestedItemId)
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
          currentOrderCategories.has(suggestedCategory) ||
          !visibleMenuCategories.has(suggestedCategory) ||
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
  }, [
    currentOrderCategories,
    currentOrderItemIds,
    isBarClosed,
    isKitchenClosed,
    liveMenuById,
    liveRecommendations,
    uniqueTriggerItemIdsInOrder,
    visibleMenuCategories
  ]);
  function jumpToMenuFilter(filter: MenuFilter) {
    setSelectedMenuFilter(filter);
    window.requestAnimationFrame(() => {
      menuSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(
      `menu-language:${restaurantSlug}:${tableToken}`
    );

    if (savedLanguage === "he" || savedLanguage === "en" || savedLanguage === "ru") {
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
    const storageKey = `menu-device-id:${restaurantSlug}`;
    const stored = window.localStorage.getItem(storageKey);

    if (stored && stored.trim()) {
      setCounterDeviceId(stored.trim());
      return;
    }

    const nextId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(storageKey, nextId);
    setCounterDeviceId(nextId);
  }, [restaurantSlug]);

  useEffect(() => {
    if (!shouldRenderCounterCaptcha) {
      return;
    }

    if (!showReviewDialog) {
      setCounterCaptchaToken(null);
      setCounterCaptchaError(null);
      return;
    }

    if (!counterCaptchaScriptReady || !window.turnstile) {
      return;
    }

    const container = counterCaptchaContainerRef.current;

    if (!container) {
      return;
    }

    const previousWidgetId = counterCaptchaWidgetIdRef.current;

    if (previousWidgetId) {
      window.turnstile.remove(previousWidgetId);
      counterCaptchaWidgetIdRef.current = null;
    }

    setCounterCaptchaToken(null);
    setCounterCaptchaError(null);

    try {
      const widgetId = window.turnstile.render(container, {
        sitekey: COUNTER_CAPTCHA_SITE_KEY,
        theme: "light",
        callback: (token: string) => {
          setCounterCaptchaToken(token);
          setCounterCaptchaError(null);
        },
        "expired-callback": () => {
          setCounterCaptchaToken(null);
        },
        "error-callback": () => {
          setCounterCaptchaToken(null);
          setCounterCaptchaError(COUNTER_CAPTCHA_INIT_FAILED_MESSAGE);
        }
      });

      counterCaptchaWidgetIdRef.current = widgetId;
    } catch {
      setCounterCaptchaError(COUNTER_CAPTCHA_INIT_FAILED_MESSAGE);
    }

    return () => {
      const currentWidgetId = counterCaptchaWidgetIdRef.current;

      if (currentWidgetId && window.turnstile) {
        window.turnstile.remove(currentWidgetId);
        counterCaptchaWidgetIdRef.current = null;
      }
    };
  }, [counterCaptchaScriptReady, shouldRenderCounterCaptcha, showReviewDialog]);

  useEffect(() => {
    const savedCart = window.localStorage.getItem(cartStorageKey);

    if (!savedCart) {
      return;
    }

    try {
      const parsed = JSON.parse(savedCart) as unknown;

      if (!Array.isArray(parsed)) {
        return;
      }

      const restoredItems = parsed
        .filter((item): item is CartItem => {
          if (!item || typeof item !== "object") {
            return false;
          }

          const candidate = item as Partial<CartItem>;

          return (
            typeof candidate.menuItemId === "string" &&
            candidate.menuItemId.trim().length > 0 &&
            typeof candidate.quantity === "number" &&
            Number.isFinite(candidate.quantity) &&
            candidate.quantity > 0
          );
        })
        .map((item) => {
          const menuItem = liveMenuById.get(item.menuItemId);
          const matchedVolumeOption = menuItem?.volumeOptions?.find(
            (option) => option.id === item.volumeOptionId
          );

          return {
            menuItemId: item.menuItemId,
            quantity: Math.max(1, Math.trunc(item.quantity)),
            note: typeof item.note === "string" ? item.note : undefined,
            volumeOptionId:
              typeof item.volumeOptionId === "string" && item.volumeOptionId.trim()
                ? item.volumeOptionId
                : undefined,
            volumeLabel:
              (matchedVolumeOption
                ? getLocalizedVolumeOptionLabel(
                    matchedVolumeOption,
                    language,
                    menuItem?.restaurantSlug
                  )
                : undefined) ??
              (typeof item.volumeLabel === "string" && item.volumeLabel.trim()
                ? item.volumeLabel
                : undefined),
            priceOverride:
              typeof item.priceOverride === "number" && Number.isFinite(item.priceOverride)
                ? item.priceOverride
                : matchedVolumeOption?.price
          };
        })
        .filter((item) => liveMenuById.has(item.menuItemId));

      if (restoredItems.length) {
        setItems(restoredItems);
      }
    } catch {
      window.localStorage.removeItem(cartStorageKey);
    }
  }, [cartStorageKey, language, liveMenuById]);

  useEffect(() => {
    if (items.length === 0) {
      window.localStorage.removeItem(cartStorageKey);
      return;
    }

    window.localStorage.setItem(cartStorageKey, JSON.stringify(items));
  }, [cartStorageKey, items]);

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
    setLanguageMenuOpen(false);
    window.localStorage.setItem(
      `menu-language:${restaurantSlug}:${tableToken}`,
      nextLanguage
    );
    setShowWelcomeDialog(orderingEnabled);
  }

  useEffect(() => {
    if (!languageMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [languageMenuOpen]);

  useEffect(() => {
    if (serviceRequestDisabled) {
      setServiceMenuOpen(false);
    }
  }, [serviceRequestDisabled]);

  const languageLabel = language.toUpperCase();
  const availableLanguages: MenuLanguage[] = ["he", "en", "ru"];

  useEffect(() => {
    if (!orderingEnabled) {
      return;
    }

    let cancelled = false;
    let inFlightAbortController: AbortController | null = null;
    let pollTimeoutId: number | null = null;
    function scheduleNextSync() {
      if (cancelled) {
        return;
      }

      const pollIntervalMs =
        document.visibilityState === "hidden"
          ? TABLE_SESSION_HIDDEN_POLL_MS
          : TABLE_SESSION_ACTIVE_POLL_MS;

      pollTimeoutId = window.setTimeout(() => {
        void syncSubmittedOrders();
      }, pollIntervalMs);
    }

    async function syncSubmittedOrders() {
      if (cancelled) {
        return;
      }

      if (document.visibilityState === "hidden") {
        scheduleNextSync();
        return;
      }

      inFlightAbortController?.abort();
      inFlightAbortController = new AbortController();

      let response: Response;

      try {
        const includeMenuPayload =
          !isCounterMode && sessionSyncPollCountRef.current % 6 === 0;
        sessionSyncPollCountRef.current += 1;
        const sessionPath = isCounterMode
          ? `/api/orders/my?restaurantSlug=${restaurantSlug}`
          : `/api/tables/${restaurantSlug}/${tableToken}${includeMenuPayload ? "?includeMenu=1" : ""}`;
        response = await fetch(
          sessionPath,
          {
            cache: "no-store",
            signal: inFlightAbortController.signal
          }
        );
      } catch {
        scheduleNextSync();
        return;
      }

      if (!response.ok) {
        scheduleNextSync();
        return;
      }

      if (!cancelled) {
        if (isCounterMode) {
          const data = (await response.json()) as {
            orders?: Order[];
          };
          const nextOrders = (data.orders ?? []).filter(
            (order) => order.status !== "cancelled"
          );
          setSubmittedOrders(
            [...nextOrders].sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt)
            )
          );
          setHasActiveServiceRequest(false);
          setServiceRequestBlockedUntil(0);
        } else {
          const data = (await response.json()) as {
            currentSessionId?: number;
            submittedOrders?: Order[];
            activeServiceRequests?: Array<Order["kind"]>;
            menu?: MenuItem[];
          };
          const previousSessionId = currentSessionIdRef.current;
          const nextSessionId = data.currentSessionId ?? previousSessionId;
          const nextOrders = data.submittedOrders ?? [];
          const hasActiveServiceRequests = (data.activeServiceRequests ?? []).some(
            (kind) => kind === "waiter_call" || kind === "bill_request"
          );

          setCurrentSessionId(nextSessionId);
          if (Array.isArray(data.menu)) {
            setLiveMenu(data.menu);
          }
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

      scheduleNextSync();
    }

    void syncSubmittedOrders();

    return () => {
      cancelled = true;
      inFlightAbortController?.abort();

      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
      }
    };
  }, [isCounterMode, orderingEnabled, restaurantSlug, tableToken]);

  useEffect(() => {
    if (!orderingEnabled || isCounterMode) {
      return;
    }

    const storageKey = `service-request:${restaurantSlug}:${tableToken}`;
    const savedValue = window.localStorage.getItem(storageKey);
    const savedTimestamp = savedValue ? Number(savedValue) : 0;

    if (savedTimestamp > Date.now()) {
      setServiceRequestBlockedUntil(savedTimestamp);
    }
  }, [isCounterMode, orderingEnabled, restaurantSlug, tableToken]);

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
    const menuItem = liveMenuById.get(menuItemId);

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
    volumeOptionId?: string,
    selection?: {
      volumeLabel?: string;
      priceOverride?: number;
    }
  ) {
    animateOrderMovement(menuItemId, "to-order", sourceElement);
    const menuItem = liveMenuById.get(menuItemId);
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
          volumeLabel:
            selection?.volumeLabel ??
            (matchedVolumeOption
              ? getLocalizedVolumeOptionLabel(
                  matchedVolumeOption,
                  language,
                  menuItem?.restaurantSlug
                )
              : undefined),
          priceOverride: selection?.priceOverride ?? matchedVolumeOption?.price
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

  function consumeCounterCaptchaToken() {
    if (!shouldRenderCounterCaptcha) {
      return undefined;
    }

    const token = counterCaptchaToken?.trim();

    if (!token) {
      return null;
    }

    return token;
  }

  function refreshCounterCaptchaToken() {
    if (!shouldRenderCounterCaptcha) {
      return;
    }

    setCounterCaptchaToken(null);
    const widgetId = counterCaptchaWidgetIdRef.current;

    if (!widgetId || !window.turnstile) {
      return;
    }

    window.turnstile.reset(widgetId);
  }

  function getCounterContactValidationMessage() {
    if (!isCounterMode) {
      return null;
    }

    if (counterRequiresPhone && !hasValidGuestPhone) {
      return "Please enter a valid phone number.";
    }

    if (counterRequiresNameOrPhone && !hasCounterContactReady) {
      return "Please enter your name or phone number.";
    }

    if (requireOtp && !counterOtpCode.trim()) {
      return "Please enter the OTP code.";
    }

    if (shouldRenderCounterCaptcha && !counterCaptchaToken?.trim()) {
      return COUNTER_CAPTCHA_MISSING_MESSAGE;
    }

    return null;
  }

  async function requestCounterOtp() {
    if (!isCounterMode) {
      return;
    }

    if (!hasValidGuestPhone) {
      setMessage("Please enter a valid phone number first.");
      return;
    }

    const captchaToken = consumeCounterCaptchaToken();

    if (captchaToken === null) {
      setMessage(COUNTER_CAPTCHA_MISSING_MESSAGE);
      return;
    }

    setCounterOtpSending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/orders/otp/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(counterDeviceId ? { "x-device-id": counterDeviceId } : {})
        },
        body: JSON.stringify({
          restaurantSlug,
          phone: normalizedGuestPhone,
          captchaToken,
          deviceId: counterDeviceId
        })
      });

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, "Failed to send OTP"));
      }

      const data = (await response.json()) as { debugCode?: string };
      setCounterOtpDebugCode(
        typeof data.debugCode === "string" ? data.debugCode : null
      );
      setDialogMessage("Verification code sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send OTP");
    } finally {
      refreshCounterCaptchaToken();
      setCounterOtpSending(false);
    }
  }

  async function submitOrder(serveMode: ServeMode) {
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

    const counterValidationMessage = getCounterContactValidationMessage();

    if (counterValidationMessage) {
      setMessage(counterValidationMessage);
      setShowReviewDialog(true);
      return;
    }

    const captchaToken = consumeCounterCaptchaToken();

    if (captchaToken === null) {
      setMessage(COUNTER_CAPTCHA_MISSING_MESSAGE);
      setShowReviewDialog(true);
      return;
    }

    if (submitting) {
      setShowReviewDialog(false);
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
          "Content-Type": "application/json",
          ...(counterDeviceId ? { "x-device-id": counterDeviceId } : {})
        },
        body: JSON.stringify({
          restaurantSlug,
          tableNumber,
          items,
          serveMode,
          clientRequestId,
          deviceId: counterDeviceId,
          captchaToken,
          otpCode: isCounterMode && requireOtp ? counterOtpCode.trim() : undefined,
          guestContactName:
            (isCounterMode || wantsOrderStatusUpdates) && guestContactName.trim()
              ? guestContactName.trim()
              : undefined,
          guestContactPhone:
            (isCounterMode || wantsOrderStatusUpdates) && guestContactPhone.trim()
              ? guestContactPhone.trim()
              : undefined
        })
      });

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, text.submitError));
      }

      const order = (await response.json()) as Order;
      setItems([]);
      setLatestSubmittedOrderId(order.id);
      pendingOrderRequestIdRef.current = null;
      window.localStorage.removeItem(cartStorageKey);
      window.localStorage.removeItem(pendingOrderStorageKey);
      setSubmittedOrders((current) => {
        const existingIndex = current.findIndex((item) => item.id === order.id);

        if (existingIndex === -1) {
          return [order, ...current];
        }

        return current.map((item) => (item.id === order.id ? order : item));
      });
      setDialogMessage(
        isCounterMode && order.displayOrderNumber
          ? `${text.orderSent}\nOrder number: ${getGuestShortOrderNumber(order.displayOrderNumber)}`
          : text.orderSent
      );
      if (isCounterMode) {
        setCounterOtpCode("");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : text.submitError;
      setMessage(
        errorMessage === text.submitError
          ? text.submitRetrySafe
          : errorMessage
      );
    } finally {
      refreshCounterCaptchaToken();
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
    const locale =
      language === "he" ? "he-IL" : language === "ru" ? "ru-RU" : "en-US";
    const prefix = language === "he" ? "הזמנה" : language === "ru" ? "Заказ" : "Order";

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

  async function closeDialogMessage() {
    if (
      !isCounterMode &&
      dialogMessage === text.orderSent &&
      latestSubmittedOrderId &&
      wantsOrderStatusUpdates &&
      (guestContactName.trim() || guestContactPhone.trim())
    ) {
      try {
        await fetch("/api/orders", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            orderId: latestSubmittedOrderId,
            guestContactName: guestContactName.trim() || undefined,
            guestContactPhone: guestContactPhone.trim() || undefined
          })
        });
      } catch {
        // Keep guest flow uninterrupted even if contact save fails.
      }
    }

    setDialogMessage(null);
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
      {shouldRenderCounterCaptcha ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => {
            setCounterCaptchaScriptReady(true);
            setCounterCaptchaError(null);
          }}
          onError={() => {
            setCounterCaptchaScriptReady(false);
            setCounterCaptchaError(COUNTER_CAPTCHA_INIT_FAILED_MESSAGE);
          }}
        />
      ) : null}
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
                  : "Сообщение"
            }
          >
            <p className="modal-card__message">{dialogMessage}</p>
            {dialogMessage === text.orderSent ? (
              <div className="modal-card__status-opt-in">
                <label className="modal-card__status-toggle">
                  <input
                    type="checkbox"
                    checked={wantsOrderStatusUpdates}
                    onChange={(event) =>
                      setWantsOrderStatusUpdates(event.target.checked)
                    }
                  />
                  <span>{text.orderStatusOptIn}</span>
                </label>
                {wantsOrderStatusUpdates ? (
                  <div className="modal-card__status-fields">
                    <input
                      className="modal-input"
                      type="text"
                      placeholder={text.orderStatusName}
                      value={guestContactName}
                      onChange={(event) => setGuestContactName(event.target.value)}
                    />
                    <input
                      className="modal-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder={text.orderStatusPhone}
                      value={guestContactPhone}
                      onChange={(event) => setGuestContactPhone(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            {dialogMessage === text.orderSent && wantsOrderStatusUpdates ? (
              <Link
                href="/privacy-policy"
                target="_blank"
                rel="noreferrer"
                className="modal-card__privacy-link"
              >
                {text.privacyPolicy}
              </Link>
            ) : null}
            <button
              className="button-success modal-card__ack"
              type="button"
              onClick={() => void closeDialogMessage()}
            >
              {text.thankYou}
            </button>
          </div>
        </div>
      ) : null}

      {orderingEnabled && showWelcomeDialog ? (
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
                      agorotToShekels(
                        shekelsToAgorot(cartItem.priceOverride ?? menuItem.price) *
                          cartItem.quantity
                      )
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
            {isCounterMode ? (
              <div className="modal-card__status-fields">
                <input
                  className="modal-input"
                  type="text"
                  placeholder={text.orderStatusName}
                  value={guestContactName}
                  onChange={(event) => setGuestContactName(event.target.value)}
                />
                <input
                  className="modal-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={text.orderStatusPhone}
                  value={guestContactPhone}
                  onChange={(event) => setGuestContactPhone(event.target.value)}
                />
                {requireOtp ? (
                  <div className="modal-actions">
                    <input
                      className="modal-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="OTP code"
                      value={counterOtpCode}
                      onChange={(event) => setCounterOtpCode(event.target.value)}
                    />
                    <button
                      className="button-neutral"
                      type="button"
                      onClick={() => void requestCounterOtp()}
                      disabled={counterOtpSending || !hasValidGuestPhone}
                    >
                      {counterOtpSending ? "Sending OTP..." : "Send OTP"}
                    </button>
                  </div>
                ) : null}
                {counterOtpDebugCode ? (
                  <p className="muted">Debug OTP: {counterOtpDebugCode}</p>
                ) : null}
                {shouldRenderCounterCaptcha ? (
                  <div className="counter-captcha">
                    <div
                      ref={counterCaptchaContainerRef}
                      className="counter-captcha__widget"
                    />
                    {counterCaptchaError ? (
                      <p className="muted">{counterCaptchaError}</p>
                    ) : (
                      <p className="muted">Complete captcha before submitting.</p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="button-success"
                type="button"
                onClick={() => {
                  setUpsellPrompt(null);
                  void submitOrder("as_ready");
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
              <h1>{restaurantName}</h1>
              <div
                ref={languageMenuRef}
                className={
                  languageMenuOpen
                    ? "language-toggle language-toggle--dropdown-open"
                    : "language-toggle"
                }
              >
                <button
                  className="language-toggle__button language-toggle__button--active"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={languageMenuOpen}
                  aria-label="Language"
                  onClick={() => setLanguageMenuOpen((current) => !current)}
                >
                  {languageLabel}
                  <span className="language-toggle__chevron" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {languageMenuOpen ? (
                  <div className="language-toggle__menu" role="menu" aria-label="Language">
                    {availableLanguages.map((candidate) => (
                      <button
                        key={candidate}
                        className={
                          candidate === language
                            ? "language-toggle__menu-item language-toggle__menu-item--active"
                            : "language-toggle__menu-item"
                        }
                        type="button"
                        role="menuitem"
                        onClick={() => setNextLanguage(candidate)}
                      >
                        {candidate.toUpperCase()}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="menu-quick-info" aria-label="Guest information shortcuts">
              {text.quickInfo.map((label, index) => {
                const href = quickInfoLinks[index] ?? null;
                const shouldHideChip = restaurantSlug.trim().toLowerCase() === "simulev" && index === 0;

                if (shouldHideChip) {
                  return null;
                }

                if (!href) {
                  return (
                    <span key={label} className="menu-quick-info__chip">
                      {label}
                    </span>
                  );
                }

                return (
                  <a
                    key={label}
                    className="menu-quick-info__chip"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {label}
                  </a>
                );
              })}
            </div>
            {orderingEnabled ? (
              <p className="lead">
                {isCounterMode ? "Counter order mode" : `${text.tableOrderingHint} ${tableNumber}`}
              </p>
            ) : null}
            {orderingEnabled && !isCounterMode && serviceRequestDisabled ? (
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
          {orderingEnabled && !isCounterMode ? (
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
                  disabled={serviceRequestDisabled}
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
          <div ref={menuSectionRef}>
            <MenuList
              items={visibleMenu}
              language={language}
              categoryDefinitions={categoryDefinitions}
              quantities={quantities}
              orderingEnabled={orderingEnabled}
              dishesClosed={showKitchenClosedBanner}
              drinksClosed={showBarClosedBanner}
              categoryDiscounts={categoryDiscounts}
              onAdd={addItem}
              onDecrease={decreaseItem}
              selectedFilter={effectiveSelectedFilter}
            />
          </div>

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
                {text.emptyCart ? (
                  <p className="cart-empty-state__text">{text.emptyCart}</p>
                ) : null}
                {submittedOrders.length ? (
                  <p className="cart-empty-state__active-hint">
                    {text.currentOrdersActiveHint}
                  </p>
                ) : null}
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

                        jumpToMenuFilter(recommendation.suggestedCategory);
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
                      <span
                        className="submitted-orders__summary-check"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      <span>{text.currentOrders}</span>{" "}
                      <span className="submitted-orders__summary-total">
                        ({formatCurrency(submittedOrdersTotal)})
                      </span>
                    </h2>
                    {submittedOrdersSummaryStatus ? (
                      <span
                        className={`status-pill status-pill--${submittedOrdersSummaryStatus}`}
                      >
                        {getOrderStatusLabel(submittedOrdersSummaryStatus)}
                      </span>
                    ) : null}
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
                  {submittedOrders.map((order) => {
                    const visibleStatus = getGuestVisibleOrderStatus(order);

                    return (
                      <article key={order.id} className="submitted-order-card">
                        <div className="order-card__header">
                          <div>
                            <strong>
                              {formatOrderLabel(order.createdAt)}
                            </strong>
                          </div>
                          {visibleStatus && getOrderStatusLabel(visibleStatus) ? (
                            <span className={`status-pill status-pill--${visibleStatus}`}>
                              {getOrderStatusLabel(visibleStatus)}
                            </span>
                          ) : null}
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
                              <strong>
                                {formatCurrency(
                                  agorotToShekels(
                                    shekelsToAgorot(item.price) * item.quantity
                                  )
                                )}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </aside>
          ) : null}
        </div>
      </div>
    </>
  );
}
