import Link from "next/link";

import { MenuEditor } from "@/components/admin/MenuEditor";
import { getMenuSettings } from "@/lib/menu-settings";

const ADMIN_DEFAULT_RESTAURANT_SLUG =
  process.env.ADMIN_DEFAULT_RESTAURANT_SLUG ?? "olive-bistro";

export default async function AdminMenuPage() {
  const settings = await getMenuSettings(ADMIN_DEFAULT_RESTAURANT_SLUG);
  const isCounterMode = settings.orderMode === "counter";

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1 className="hero-title-stacked control-center-title">
            <span>Control</span>
            <span>Center</span>
          </h1>
        </div>
        <div className="admin-nav" aria-label="Admin navigation">
          <div className="admin-switch">
            <Link href="/admin/orders" className="admin-switch__item">
              Orders
            </Link>
            {!isCounterMode ? (
              <Link href="/admin/tables" className="admin-switch__item">
                Tables
              </Link>
            ) : null}
          </div>
          <Link href="/admin/menu" className="admin-menu-bubble admin-menu-bubble--active">
            Menu
          </Link>
        </div>
      </section>
      <MenuEditor />
    </main>
  );
}
