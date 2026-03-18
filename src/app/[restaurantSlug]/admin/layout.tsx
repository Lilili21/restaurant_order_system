import { ReactNode } from "react";
import { AdminAccessGate } from "@/components/admin/AdminAccessGate";

type RestaurantAdminLayoutProps = {
  children: ReactNode;
};

export default function RestaurantAdminLayout({
  children
}: RestaurantAdminLayoutProps) {
  return <AdminAccessGate>{children}</AdminAccessGate>;
}
