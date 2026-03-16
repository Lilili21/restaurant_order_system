import { MenuEditor } from "@/components/admin/MenuEditor";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Menu editor</h1>
          <p className="muted">
            Edit menu items, kitchen notices, and the table count controls from
            one place.
          </p>
        </div>
      </section>

      <MenuEditor />
    </main>
  );
}
