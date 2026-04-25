type MockOrderItem = {
  id: string;
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  served: boolean;
  volumeLabel?: string;
  note?: string;
};

type MockOrder = {
  id: string;
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  sessionId: number;
  guestContactName?: string;
  guestContactPhone?: string;
  status: "new" | "preparing" | "served" | "cancelled";
  createdAt: string;
  updatedAt: string;
  total: number;
  kind: "order" | "waiter_call" | "bill_request";
  serveMode: "all_at_once" | "as_ready";
  items: MockOrderItem[];
};

type MockMenuItem = {
  id: string;
  restaurantSlug: string;
  category: string;
  name: string;
  description: string;
  nameHe: string;
  nameEn: string;
  nameRu: string;
  descriptionHe: string;
  descriptionEn: string;
  descriptionRu: string;
  price: number;
  image: string;
  showImage: boolean;
  available: boolean;
  badges: string[];
  volumeOptions: Array<{
    id: string;
    label: string;
    labelHe?: string;
    labelEn?: string;
    labelRu?: string;
    price: number;
  }>;
};

export function createMockOrder(overrides: Partial<MockOrder> = {}): MockOrder {
  const baseItems: MockOrderItem[] = [
    {
      id: "order-item-1",
      menuItemId: "menu-item-1",
      name: "QA pasta",
      category: "mains",
      price: 56,
      quantity: 1,
      served: false
    }
  ];

  return {
    id: "order-1",
    restaurantSlug: "olive-bistro",
    restaurantName: "Olive Bistro",
    tableNumber: 1,
    sessionId: 1001,
    status: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    total: 56,
    kind: "order",
    serveMode: "all_at_once",
    items: baseItems,
    ...overrides
  };
}

export function createMockMenuItem(overrides: Partial<MockMenuItem> = {}): MockMenuItem {
  return {
    id: "menu-item-qa-1",
    restaurantSlug: "olive-bistro",
    category: "mains",
    name: "QA Dish",
    description: "E2E fixture dish",
    nameHe: "QA Dish HE",
    nameEn: "QA Dish",
    nameRu: "QA Dish RU",
    descriptionHe: "Fixture description",
    descriptionEn: "Fixture description",
    descriptionRu: "Fixture description",
    price: 49,
    image: "",
    showImage: true,
    available: true,
    badges: [],
    volumeOptions: [],
    ...overrides
  };
}
