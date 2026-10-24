import { cn } from "@/lib/utils";

/**
 * The queue table.
 *
 * A plain `<table>` on purpose: a sortable, virtualised data grid is the wrong
 * default for a screen where the whole point is that a reviewer reads every row
 * before deciding. Cells are rendered on the server, so an operator never
 * receives a record they were not authorised to read.
 *
 * `empty` is required rather than optional. A queue with nothing in it must say
 * what would appear there and why — "no rows" and "the query failed" should
 * never look the same to the person working the queue.
 */

export type ConsoleColumn<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  /** Hide this column below the given breakpoint to keep narrow screens usable. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;
const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

function ConsoleTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  empty,
  footer,
  className,
}: {
  caption: string;
  columns: ConsoleColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  empty: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  if (rows.length === 0) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase",
                    ALIGN[column.align ?? "left"],
                    column.hideBelow ? HIDE[column.hideBelow] : undefined,
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="border-b border-border/70 last:border-b-0 hover:bg-muted/30">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3 align-top text-foreground",
                      ALIGN[column.align ?? "left"],
                      column.hideBelow ? HIDE[column.hideBelow] : undefined,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer ? <div className="text-xs leading-relaxed text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

export { ConsoleTable };
