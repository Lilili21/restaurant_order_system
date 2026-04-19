import { ReactNode } from "react";

import { AdminAccessGate } from "@/components/admin/AdminAccessGate";

type WaiterLayoutProps = {
  children: ReactNode;
};

export default function WaiterLayout({ children }: WaiterLayoutProps) {
  return (
    <AdminAccessGate scope="waiter" title="Waiter sign in">
      {children}
    </AdminAccessGate>
  );
}
