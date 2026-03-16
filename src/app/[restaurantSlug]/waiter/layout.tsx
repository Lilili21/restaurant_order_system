import { ReactNode } from "react";

import { AdminAccessGate } from "@/components/admin/AdminAccessGate";

type RestaurantWaiterLayoutProps = {
  children: ReactNode;
};

export default function RestaurantWaiterLayout({
  children
}: RestaurantWaiterLayoutProps) {
  return <AdminAccessGate>{children}</AdminAccessGate>;
}
