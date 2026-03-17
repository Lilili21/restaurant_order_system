import { ReactNode } from "react";

type RestaurantAdminLayoutProps = {
  children: ReactNode;
};

export default function RestaurantAdminLayout({
  children
}: RestaurantAdminLayoutProps) {
  return <>{children}</>;
}
