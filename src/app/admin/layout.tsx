import { ReactNode } from "react";
import { AdminAccessGate } from "@/components/admin/AdminAccessGate";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return <AdminAccessGate>{children}</AdminAccessGate>;
}
