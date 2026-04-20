import { MenuItem, Order, Restaurant } from "@/lib/types";

export const restaurants: Restaurant[] = [
  {
    id: "rest_olive",
    slug: "olive-bistro",
    name: "Olive Bistro",
    description: "Restaurant with QR menus and instant order delivery for staff.",
    currency: "ILS",
    tables: Array.from({ length: 8 }, (_, index) => ({
      id: `olive_table_${index + 1}`,
      number: index + 1,
      seats: index < 4 ? 2 : 4,
      zone: index < 4 ? "Hall A" : "Terrace",
      accessToken: `olive-demo-token-${index + 1}`,
      qrCodeValue: `/olive-bistro/menu/olive-demo-token-${index + 1}`
    }))
  },
  {
    id: "rest_simuLev",
    slug: "simuLev",
    name: "SimuLev",
    description: "New restaurant space with QR ordering, ready for setup.",
    currency: "ILS",
    tables: Array.from({ length: 10 }, (_, index) => ({
      id: `simuLev_table_${index + 1}`,
      number: index + 1,
      seats: index < 6 ? 2 : 4,
      zone: index < 5 ? "Main hall" : "Bar area",
      accessToken: `simuLev-demo-token-${index + 1}`,
      qrCodeValue: `/simuLev/menu/simuLev-demo-token-${index + 1}`
    }))
  }
];

export const menuItems: MenuItem[] = [
  {
    id: "m1",
    restaurantSlug: "olive-bistro",
    category: "starters",
    nameHe: "חומוס עם פיתה",
    name: "חומוס עם פיתה",
    description: "חומוס קלאסי, שמן זית ופיתה חמה.",
    descriptionHe: "חומוס קלאסי, שמן זית ופיתה חמה.",
    nameEn: "Hummus with pita",
    descriptionEn: "Classic hummus, olive oil, warm pita.",
    price: 24,
    image:
      "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=900&q=80",
    showImage: true,
    available: true
  },
  {
    id: "m2",
    restaurantSlug: "olive-bistro",
    category: "starters",
    nameHe: "סלט טאבולה",
    name: "סלט טאבולה",
    description: "בורגול, הרבה ירק, לימון, עגבניות ונענע.",
    descriptionHe: "בורגול, הרבה ירק, לימון, עגבניות ונענע.",
    nameEn: "Tabbouleh salad",
    descriptionEn: "Bulgur, lots of greens, lemon, tomatoes and mint.",
    price: 29,
    image:
      "https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=900&q=80",
    showImage: true,
    available: true
  },
  {
    id: "m3",
    restaurantSlug: "olive-bistro",
    category: "mains",
    nameHe: "שווארמה בצלחת",
    name: "שווארמה בצלחת",
    description: "עוף, תפוחי אדמה, חמוצים, טחינה וסלט טרי.",
    descriptionHe: "עוף, תפוחי אדמה, חמוצים, טחינה וסלט טרי.",
    nameEn: "Shawarma plate",
    descriptionEn: "Chicken, potatoes, pickles, tahini and fresh salad.",
    price: 54,
    image:
      "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=900&q=80",
    showImage: true,
    available: true
  },
  {
    id: "m4",
    restaurantSlug: "olive-bistro",
    category: "mains",
    nameHe: "פילה סלמון",
    name: "פילה סלמון",
    description: "מוגש עם בורגול ורוטב לימון.",
    descriptionHe: "מוגש עם בורגול ורוטב לימון.",
    nameEn: "Salmon fillet",
    descriptionEn: "Served with bulgur and lemon sauce.",
    price: 78,
    image:
      "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=80",
    showImage: true,
    available: true
  },
  {
    id: "m5",
    restaurantSlug: "olive-bistro",
    category: "drinks",
    nameHe: "לימונדה עם נענע",
    name: "לימונדה עם נענע",
    description: "לימונדה ביתית בלי סירופים.",
    descriptionHe: "לימונדה ביתית בלי סירופים.",
    nameEn: "Mint lemonade",
    descriptionEn: "Homemade lemonade without syrups.",
    price: 18,
    image:
      "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=80",
    showImage: true,
    available: true
  },
  {
    id: "m6",
    restaurantSlug: "olive-bistro",
    category: "desserts",
    nameHe: "כנאפה",
    name: "כנאפה",
    description: "קינוח חם עם גבינה, פיסטוקים וסירופ.",
    descriptionHe: "קינוח חם עם גבינה, פיסטוקים וסירופ.",
    nameEn: "Kanafeh",
    descriptionEn: "Warm dessert with cheese, pistachios and syrup.",
    price: 32,
    image:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80",
    showImage: true,
    available: true
  },
  {
    id: "simulev_main_1",
    restaurantSlug: "simuLev",
    category: "main_dishes",
    nameHe: "דרניקי",
    name: "דרניקי",
    description: "לביבות תפוחי אדמה. וריאציית קישוא זמינה במחיר 42 ₪.",
    descriptionHe: "לביבות תפוחי אדמה. וריאציית קישוא זמינה במחיר 42 ₪.",
    nameEn: "Draniki",
    descriptionEn: "Potato pancakes. Zucchini variation is available for 42 ILS.",
    nameRu: "Драники",
    descriptionRu: "картофель / цукини",
    price: 38,
    image: "",
    showImage: false,
    available: true,
    volumeOptions: [
      { id: "simu_main_extra_caviar", label: "Икра", price: 37 },
      { id: "simu_main_extra_salmon", label: "Лосось", price: 28 },
      {
        id: "simu_main_extra_cracklings",
        label: "Шкварки с маринованными огурчиками",
        price: 28
      },
      { id: "simu_main_extra_mushroom_sauce", label: "Грибной соус", price: 18 },
      { id: "simu_main_extra_pickles", label: "Маринованные огурчики", price: 10 },
      { id: "simu_main_extra_double_sour_cream", label: "Двойная сметана", price: 3 }
    ]
  },
  {
    id: "simulev_main_2",
    restaurantSlug: "simuLev",
    category: "main_dishes",
    nameHe: "קולדוני עם פטריות",
    name: "קולדוני עם פטריות",
    description: "כיסוני תפוחי אדמה ממולאים בפטריות.",
    descriptionHe: "כיסוני תפוחי אדמה ממולאים בפטריות.",
    nameEn: "Kolduny with mushrooms",
    descriptionEn: "Potato dumplings stuffed with mushrooms.",
    nameRu: "Колдуны",
    descriptionRu: "с грибами",
    price: 60,
    image: "",
    showImage: false,
    available: true,
    volumeOptions: [
      { id: "simu_main2_extra_caviar", label: "Икра", price: 37 },
      { id: "simu_main2_extra_salmon", label: "Лосось", price: 28 },
      {
        id: "simu_main2_extra_cracklings",
        label: "Шкварки с маринованными огурчиками",
        price: 28
      },
      { id: "simu_main2_extra_mushroom_sauce", label: "Грибной соус", price: 18 },
      { id: "simu_main2_extra_pickles", label: "Маринованные огурчики", price: 10 },
      { id: "simu_main2_extra_double_sour_cream", label: "Двойная сметана", price: 3 }
    ]
  },
  {
    id: "simulev_main_3",
    restaurantSlug: "simuLev",
    category: "main_dishes",
    nameHe: "פלמני בקר",
    name: "פלמני בקר",
    description: "פלמני ביתיים במילוי בקר עסיסי.",
    descriptionHe: "פלמני ביתיים במילוי בקר עסיסי.",
    nameEn: "Pelmeni with beef",
    descriptionEn: "Homestyle pelmeni filled with juicy beef.",
    nameRu: "Пельмени",
    descriptionRu: "с говядиной",
    price: 65,
    image: "",
    showImage: false,
    available: true,
    volumeOptions: [
      { id: "simu_main3_extra_caviar", label: "Икра", price: 37 },
      { id: "simu_main3_extra_salmon", label: "Лосось", price: 28 },
      {
        id: "simu_main3_extra_cracklings",
        label: "Шкварки с маринованными огурчиками",
        price: 28
      },
      { id: "simu_main3_extra_mushroom_sauce", label: "Грибной соус", price: 18 },
      { id: "simu_main3_extra_pickles", label: "Маринованные огурчики", price: 10 },
      { id: "simu_main3_extra_double_sour_cream", label: "Двойная сметана", price: 3 }
    ]
  },
  {
    id: "simulev_main_4",
    restaurantSlug: "simuLev",
    category: "main_dishes",
    nameHe: "וורניקי תפוחי אדמה ופטריות",
    name: "וורניקי תפוחי אדמה ופטריות",
    description: "וורניקי קלאסיים במילוי תפוחי אדמה ופטריות.",
    descriptionHe: "וורניקי קלאסיים במילוי תפוחי אדמה ופטריות.",
    nameEn: "Vareniki with potato and mushrooms",
    descriptionEn: "Classic vareniki filled with potato and mushrooms.",
    nameRu: "Вареники",
    descriptionRu: "картофель, грибы",
    price: 54,
    image: "",
    showImage: false,
    available: true,
    volumeOptions: [
      { id: "simu_main4_extra_caviar", label: "Икра", price: 37 },
      { id: "simu_main4_extra_salmon", label: "Лосось", price: 28 },
      {
        id: "simu_main4_extra_cracklings",
        label: "Шкварки с маринованными огурчиками",
        price: 28
      },
      { id: "simu_main4_extra_mushroom_sauce", label: "Грибной соус", price: 18 },
      { id: "simu_main4_extra_pickles", label: "Маринованные огурчики", price: 10 },
      { id: "simu_main4_extra_double_sour_cream", label: "Двойная сметана", price: 3 }
    ]
  },
  {
    id: "simulev_main_5",
    restaurantSlug: "simuLev",
    category: "main_dishes",
    nameHe: "חינקלי",
    name: "חינקלי",
    description: "כיסוני בצק גאורגיים עסיסיים במתכון קלאסי.",
    descriptionHe: "כיסוני בצק גאורגיים עסיסיים במתכון קלאסי.",
    nameEn: "Khinkali",
    descriptionEn: "Juicy Georgian dumplings in a classic style.",
    nameRu: "Хинкали",
    descriptionRu: "",
    price: 54,
    image: "",
    showImage: false,
    available: true,
    volumeOptions: [
      { id: "simu_main5_extra_caviar", label: "Икра", price: 37 },
      { id: "simu_main5_extra_salmon", label: "Лосось", price: 28 },
      {
        id: "simu_main5_extra_cracklings",
        label: "Шкварки с маринованными огурчиками",
        price: 28
      },
      { id: "simu_main5_extra_mushroom_sauce", label: "Грибной соус", price: 18 },
      { id: "simu_main5_extra_pickles", label: "Маринованные огурчики", price: 10 },
      { id: "simu_main5_extra_double_sour_cream", label: "Двойная сметана", price: 3 }
    ]
  },
  {
    id: "simulev_buters_1",
    restaurantSlug: "simuLev",
    category: "buters",
    nameHe: "בוטר עם קוויאר וחמאה",
    name: "בוטר עם קוויאר וחמאה",
    description: "פרוסת לחם עם חמאה וקוויאר.",
    descriptionHe: "פרוסת לחם עם חמאה וקוויאר.",
    nameEn: "Buter with caviar and butter",
    descriptionEn: "Bread slice with butter and caviar.",
    nameRu: "Икра с маслом",
    descriptionRu: "",
    price: 25,
    image: "",
    showImage: false,
    available: true
  },
  {
    id: "simulev_buters_2",
    restaurantSlug: "simuLev",
    category: "buters",
    nameHe: "בוטר עם סלמון וחמאה",
    name: "בוטר עם סלמון וחמאה",
    description: "פרוסת לחם עם חמאה וסלמון.",
    descriptionHe: "פרוסת לחם עם חמאה וסלמון.",
    nameEn: "Buter with salmon and butter",
    descriptionEn: "Bread slice with butter and salmon.",
    nameRu: "Лосось с маслом",
    descriptionRu: "",
    price: 22,
    image: "",
    showImage: false,
    available: true
  },
  {
    id: "simulev_sweet_1",
    restaurantSlug: "simuLev",
    category: "sweet",
    nameHe: "בליני",
    name: "בליני",
    description: "בליני דקים ומתוקים בהגשה חמה.",
    descriptionHe: "בליני דקים ומתוקים בהגשה חמה.",
    nameEn: "Blini",
    descriptionEn: "Thin sweet blini served warm.",
    nameRu: "Блины",
    descriptionRu: "",
    price: 42,
    image: "",
    showImage: false,
    available: true,
    volumeOptions: [
      { id: "simu_sweet_extra_jam", label: "Варенье", price: 7 },
      { id: "simu_sweet_extra_nutella", label: "Нутелла", price: 7 },
      { id: "simu_sweet_extra_condensed_milk", label: "Сгущённое молоко", price: 7 }
    ]
  },
  {
    id: "simulev_sweet_2",
    restaurantSlug: "simuLev",
    category: "sweet",
    nameHe: "סירניקי",
    name: "סירניקי",
    description: "לביבות גבינה עדינות בסגנון ביתי.",
    descriptionHe: "לביבות גבינה עדינות בסגנון ביתי.",
    nameEn: "Syrniki",
    descriptionEn: "Soft cottage-cheese pancakes, homestyle.",
    nameRu: "Сырники",
    descriptionRu: "",
    price: 42,
    image: "",
    showImage: false,
    available: true,
    volumeOptions: [
      { id: "simu_sweet2_extra_jam", label: "Варенье", price: 7 },
      { id: "simu_sweet2_extra_nutella", label: "Нутелла", price: 7 },
      { id: "simu_sweet2_extra_condensed_milk", label: "Сгущённое молоко", price: 7 }
    ]
  },
  {
    id: "simulev_sweet_3",
    restaurantSlug: "simuLev",
    category: "sweet",
    nameHe: "וורניקי עם דובדבן",
    name: "וורניקי עם דובדבן",
    description: "וורניקי מתוקים במילוי דובדבן.",
    descriptionHe: "וורניקי מתוקים במילוי דובדבן.",
    nameEn: "Vareniki with cherry",
    descriptionEn: "Sweet vareniki filled with cherry.",
    nameRu: "Вареники",
    descriptionRu: "с вишней",
    price: 54,
    image: "",
    showImage: false,
    available: true,
    volumeOptions: [
      { id: "simu_sweet3_extra_jam", label: "Варенье", price: 7 },
      { id: "simu_sweet3_extra_nutella", label: "Нутелла", price: 7 },
      { id: "simu_sweet3_extra_condensed_milk", label: "Сгущённое молоко", price: 7 }
    ]
  },
  {
    id: "simulev_cake_1",
    restaurantSlug: "simuLev",
    category: "cakes",
    nameHe: "עוגת לב תל אביב",
    name: "עוגת לב תל אביב",
    description: "עוגת הבית «לב תל אביב».",
    descriptionHe: "עוגת הבית «לב תל אביב».",
    nameEn: "Heart of Tel Aviv cake",
    descriptionEn: "Signature cake “Heart of Tel Aviv”.",
    nameRu: "«Сердце Тель-Авива»",
    descriptionRu: "",
    price: 45,
    image: "",
    showImage: false,
    available: true
  },
  {
    id: "simulev_cake_2",
    restaurantSlug: "simuLev",
    category: "cakes",
    nameHe: "טירמיסו",
    name: "טירמיסו",
    description: "טירמיסו קלאסי עם קרם מסקרפונה עדין.",
    descriptionHe: "טירמיסו קלאסי עם קרם מסקרפונה עדין.",
    nameEn: "Tiramisu",
    descriptionEn: "Classic tiramisu with delicate mascarpone cream.",
    nameRu: "Тирамису",
    descriptionRu: "",
    price: 45,
    image: "",
    showImage: false,
    available: true
  },
  {
    id: "simulev_cake_3",
    restaurantSlug: "simuLev",
    category: "cakes",
    nameHe: "מוראבייניק",
    name: "מוראבייניק",
    description: "עוגת מוראבייניק בסגנון מסורתי.",
    descriptionHe: "עוגת מוראבייניק בסגנון מסורתי.",
    nameEn: "Muraveinik",
    descriptionEn: "Traditional-style Muraveinik cake.",
    nameRu: "Муравейник",
    descriptionRu: "",
    price: 45,
    image: "",
    showImage: false,
    available: true
  }
];

export const initialOrders: Order[] = [
  {
    id: "ord_demo_1",
    restaurantSlug: "olive-bistro",
    restaurantName: "Olive Bistro",
    tableNumber: 3,
    sessionId: 1,
    status: "new",
    serveMode: "all_at_once",
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    total: 92,
    items: [
      {
        id: "ord_demo_1_item_1",
        menuItemId: "m1",
        category: "starters",
        name: "Хумус с питой",
        price: 24,
        quantity: 1,
        served: false
      },
      {
        id: "ord_demo_1_item_2",
        menuItemId: "m5",
        category: "drinks",
        name: "Лимонад с мятой",
        price: 18,
        quantity: 2,
        served: false
      },
      {
        id: "ord_demo_1_item_3",
        menuItemId: "m6",
        category: "desserts",
        name: "Кнафе",
        price: 32,
        quantity: 1,
        note: "Разделить на две ложки",
        served: false
      }
    ]
  }
];
