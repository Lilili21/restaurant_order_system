import { MenuEditor } from "@/components/admin/MenuEditor";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <h1 className="hero-title-stacked control-center-title">
            <span>Control</span>
            <span>Center</span>
          </h1>
        </div>
      </section>
      <MenuEditor />
    </main>
  );
}
