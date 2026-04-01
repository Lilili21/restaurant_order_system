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
    id: "rest_beerabar",
    slug: "beerabar",
    name: "BeeraBar",
    description: "New restaurant space with QR ordering, ready for setup.",
    currency: "ILS",
    tables: Array.from({ length: 10 }, (_, index) => ({
      id: `beerabar_table_${index + 1}`,
      number: index + 1,
      seats: index < 6 ? 2 : 4,
      zone: index < 5 ? "Main hall" : "Bar area",
      accessToken: `beerabar-demo-token-${index + 1}`,
      qrCodeValue: `/beerabar/menu/beerabar-demo-token-${index + 1}`
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
