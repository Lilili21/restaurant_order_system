import { MenuEditor } from "@/components/admin/MenuEditor";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1>Menu editor</h1>
        </div>
      </section>
      <MenuEditor />
    </main>
  );
}
