import { MenuItem, Order, Restaurant } from "@/lib/types";

export const restaurants: Restaurant[] = [
  {
    id: "rest_olive",
    slug: "olive-bistro",
    name: "Olive Bistro",
    description: "Ресторан с QR-меню и моментальными заказами для официантов.",
    currency: "ILS",
    tables: Array.from({ length: 8 }, (_, index) => ({
      id: `olive_table_${index + 1}`,
      number: index + 1,
      seats: index < 4 ? 2 : 4,
      zone: index < 4 ? "Зал A" : "Терраса",
      accessToken: `olive-demo-token-${index + 1}`,
      qrCodeValue: `/menu/olive-bistro/olive-demo-token-${index + 1}`
    }))
  }
];

export const menuItems: MenuItem[] = [
  {
    id: "m1",
    restaurantSlug: "olive-bistro",
    category: "starters",
    nameHe: "חומוס עם פיתה",
    name: "Хумус с питой",
    description: "Классический хумус, оливковое масло, тёплая пита.",
    descriptionHe: "חומוס קלאסי, שמן זית ופיתה חמה.",
    nameRu: "Хумус с питой",
    nameEn: "Hummus with pita",
    descriptionRu: "Классический хумус, оливковое масло, тёплая пита.",
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
    name: "Салат табуле",
    description: "Булгур, много зелени, лимон, помидоры и мята.",
    descriptionHe: "בורגול, הרבה ירק, לימון, עגבניות ונענע.",
    nameRu: "Салат табуле",
    nameEn: "Tabbouleh salad",
    descriptionRu: "Булгур, много зелени, лимон, помидоры и мята.",
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
    name: "Шаурма на тарелке",
    description: "Курица, картофель, соленья, тахини и свежий салат.",
    descriptionHe: "עוף, תפוחי אדמה, חמוצים, טחינה וסלט טרי.",
    nameRu: "Шаурма на тарелке",
    nameEn: "Shawarma plate",
    descriptionRu: "Курица, картофель, соленья, тахини и свежий салат.",
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
    name: "Филе лосося",
    description: "Подаётся с булгуром и лимонным соусом.",
    descriptionHe: "מוגש עם בורגול ורוטב לימון.",
    nameRu: "Филе лосося",
    nameEn: "Salmon fillet",
    descriptionRu: "Подаётся с булгуром и лимонным соусом.",
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
    name: "Лимонад с мятой",
    description: "Домашний лимонад без сиропов.",
    descriptionHe: "לימונדה ביתית בלי סירופים.",
    nameRu: "Лимонад с мятой",
    nameEn: "Mint lemonade",
    descriptionRu: "Домашний лимонад без сиропов.",
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
    name: "Кнафе",
    description: "Тёплый десерт с сыром, фисташками и сиропом.",
    descriptionHe: "קינוח חם עם גבינה, פיסטוקים וסירופ.",
    nameRu: "Кнафе",
    nameEn: "Kanafeh",
    descriptionRu: "Тёплый десерт с сыром, фисташками и сиропом.",
    descriptionEn: "Warm dessert with cheese, pistachios and syrup.",
    price: 32,
    image:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80",
    showImage: true,
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
