import Link from "next/link";

export default function WaiterPage() {
  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Live Orders</p>
          <h1>Service dashboard</h1>
          <p className="muted">
            Review incoming orders, manage table sessions, and respond to guest
            requests.
          </p>
        </div>
        <div className="hero-actions">
          <Link href="/waiter/orders" className="button-link">
            View orders
          </Link>
          <Link href="/waiter/tables" className="button-link button-link--ghost">
            View tables
          </Link>
        </div>
      </section>
    </main>
  );
}
