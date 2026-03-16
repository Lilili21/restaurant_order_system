import Link from "next/link";

import { MenuEditor } from "@/components/admin/MenuEditor";

export default function AdminMenuPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>Menu editor</h1>
        </div>
        <div className="admin-nav" aria-label="Admin navigation">
          <Link href="/admin" className="admin-menu-bubble admin-menu-bubble--active">
            Admin
          </Link>
        </div>
      </section>
      <MenuEditor />
    </main>
  );
}
