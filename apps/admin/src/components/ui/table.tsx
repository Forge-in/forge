import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * The console's tables are flex layouts, not `<table>` elements: columns mix
 * fixed pixel widths with flex ratios, and rows are whole-row link targets. These
 * primitives keep the flex layout the design needs while exposing correct grid
 * semantics to assistive tech through ARIA roles.
 */

export function DataTable({
  label,
  toolbar,
  className,
  children,
}: {
  label: string;
  /**
   * Title and bulk actions above the grid. Rendered outside the `role="table"`
   * element, because a table may only contain rows, rowgroups and a caption.
   */
  toolbar?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      {toolbar}
      <div role="table" aria-label={label} className="flex flex-col">
        {children}
      </div>
    </div>
  );
}

export function TableHead({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="rowgroup">
      <div role="row" className={cn('hairline-b t-colhead flex', className)}>
        {children}
      </div>
    </div>
  );
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <div role="rowgroup">{children}</div>;
}

export function HeadCell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="columnheader" className={cn('min-w-0', className)}>
      {children}
    </div>
  );
}

export function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="cell" className={cn('min-w-0', className)}>
      {children}
    </div>
  );
}

export function TableRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="row" className={cn('hairline-b flex items-center', className)}>
      {children}
    </div>
  );
}

/**
 * Stands in for the body when a filter matches nothing. It is a real row, so the
 * grid's structure stays valid and a screen reader still lands on the message.
 */
export function EmptyRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="row" className="flex">
      <div role="cell" className={cn('t-body text-muted flex-1 text-pretty py-6', className)}>
        {children}
      </div>
    </div>
  );
}

/** A row that navigates. The whole row is the hit target, as the design shows. */
export function TableRowLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="row"
      className={cn('hairline-b wc-row flex items-center text-ink', className)}
    >
      {children}
    </Link>
  );
}
