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
  accessToken: string;
  qrCodeValue: string;
};

export type MenuCategory =
  | "starters"
  | "mains"
  | "drinks"
  | "fluids"
  | "draft"
  | "bottled"
  | "fuel"
  | "whiskey"
  | "vodka"
  | "rum"
  | "cognac"
  | "gin"
  | "tequila"
  | "absent"
  | "ouzo"
  | "likers"
  | "two_component_mixture"
  | "dot4"
  | "non_alcoholic_drinks"
  | "desserts";
export type MenuLanguage = "he" | "en";
export type MenuBadge =
  | "chef_special"
  | "most_popular"
  | "vegan"
  | "spicy"
  | "kids_favorite"
  | "new"
  | "gluten_free"
  | "dairy_free"
  | "nut_free";

export type MenuVolumeOption = {
  id: string;
  label: string;
  price: number;
};

export type MenuItem = {
  id: string;
  restaurantSlug: string;
  category: MenuCategory;
  name: string;
  description: string;
  nameHe: string;
  nameEn: string;
  descriptionHe: string;
  descriptionEn: string;
  price: number;
  image: string;
  showImage: boolean;
  available: boolean;
  badges?: MenuBadge[];
  volumeOptions?: MenuVolumeOption[];
};

export type CartItem = {
  menuItemId: string;
  quantity: number;
  note?: string;
  volumeOptionId?: string;
  volumeLabel?: string;
  priceOverride?: number;
};

export type OrderItem = {
  id: string;
  menuItemId: string;
  category?: MenuCategory;
  name: string;
  volumeOptionId?: string;
  volumeLabel?: string;
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
  kind?: "order" | "waiter_call" | "bill_request";
  serveMode?: ServeMode;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
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
