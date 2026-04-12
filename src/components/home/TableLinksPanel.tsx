import Link from "next/link";

type TableLinksPanelProps = {
  tableLinks: Array<{
    label?: string;
    tableNumber: number;
    href: string;
  }>;
};

export function TableLinksPanel({
  tableLinks
}: TableLinksPanelProps) {
  return (
    <section className="table-links-panel">
      <div className="table-links-panel__list">
        {tableLinks.map((table) => (
          <Link
            key={table.tableNumber}
            href={table.href}
            className="table-links-panel__link"
          >
            {table.label || `Table ${table.tableNumber}`}
          </Link>
        ))}
      </div>
    </section>
  );
}
