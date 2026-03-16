import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Restaurant dashboard</h1>
          <p className="muted">
            Review incoming table orders here and keep extending the system with
            statuses, kitchen printing, and payments.
          </p>
        </div>
        <div className="hero-actions">
          <Link href="/admin/orders" className="button-link">
            View orders
          </Link>
          <Link href="/admin/tables" className="button-link button-link--ghost">
            View tables
          </Link>
        </div>
      </section>
    </main>
  );
}
