export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  description: string;
  currency: "ILS";
  tables: Table[];
};

export type Table = {
  id: string;
  number: number;
  seats: number;
  zone: string;
  qrCodeValue: string;
};

export type MenuCategory = "starters" | "mains" | "drinks" | "desserts";

export type MenuItem = {
  id: string;
  restaurantSlug: string;
  category: MenuCategory;
  name: string;
  description: string;
  price: number;
  image: string;
  available: boolean;
};

export type CartItem = {
  menuItemId: string;
  quantity: number;
  note?: string;
};

export type OrderItem = {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  served: boolean;
};

export type OrderStatus = "new" | "preparing" | "served" | "cancelled";

export type ServeMode = "all_at_once" | "as_ready";

export type Order = {
  id: string;
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  sessionId: number;
  kind?: "order" | "waiter_call";
  serveMode?: ServeMode;
  status: OrderStatus;
  createdAt: string;
  items: OrderItem[];
  total: number;
};

export type TableSession = {
  restaurant: Restaurant;
  table: Table;
  menu: MenuItem[];
  submittedOrders?: Order[];
};

export type TableOverview = {
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  currentSessionId: number;
  orderCount: number;
  total: number;
  statuses: OrderStatus[];
  orders: Order[];
};

export type ClosedTableSummary = {
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: number;
  sessionId: number;
  closedAt: string;
  total: number;
  orderCount: number;
  orderIds: string[];
  orders: Order[];
};
